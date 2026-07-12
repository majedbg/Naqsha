import { useEffect, useRef, useCallback, useState } from 'react';
import p5 from 'p5';
import { getDynamicPatternClass } from './patternRegistry';
import { P5Adapter } from './patterns/drawingContext';
import { PATTERN_CLASSES } from './patterns';
import ImportedPath from './patterns/ImportedPath';
import { resolveMoireSource } from './moirePair';
import { resolveModulationsForTarget, composeModulationParam } from './fields/resolveModulationForTarget';
import { resolveMotifHostParams } from './motif/resolveMotifHost';
import { collectMotifHostGeometry } from './motif/collectHostGeometry';
import { isMotifLayer } from './motif/motifLayer';
import { getGlyph } from './motif/glyphs';
import { handlesFor } from './transform/handles';
import { drawTextNode } from './text/drawTextNode';
import { isTextLayer, textNodeFromLayer } from './text/textLayer';
import { importLayerPivot } from './scene/placement';
import { buildSelectables } from './scene/selectables';
import { resolveCanvasColor, sheetBackground, offSheetDimFactor } from './materialPreview';
import { effectiveVisible } from './panels';
import { isEtchLayer } from './etch/etchLayer';
import { makeEtchInstance } from './etch/etchInstance';
import { bitmapToRGBA } from './etch/etchBitmap';
import { resolveEtchBitmap, etchCacheNeedsResolve } from './etch/etchSource';

// Pivoted node transform shared by render + selection chrome. Matches the SVG
// `translate(x y) translate(cx cy) rotate scale translate(-cx -cy)` form emitted
// by transformToSVG, so canvas-rendered geometry and exported SVG stay
// byte-consistent. The pivot (cx,cy) is the canvas center for patterns and the
// geometry-bbox center for IMPORT layers (so resize/rotate act in place) — the
// caller passes whichever matches svgExport's wrapLayerTransform. Identity
// transform → no-op (guarded), so untouched layers render exactly as before.
// Caller wraps this in p.push()/p.pop().
function applyNodeTransform(p, t, cx, cy) {
  if (!t) return;
  const moved = t.x || t.y || (t.rotation && t.rotation !== 0) || (t.scale != null && t.scale !== 1);
  if (!moved) return;
  p.translate(t.x || 0, t.y || 0);
  p.translate(cx, cy);
  if (t.rotation) p.rotate(p.radians(t.rotation));
  if (t.scale != null && t.scale !== 1) p.scale(t.scale);
  p.translate(-cx, -cy);
}

export default function useCanvas(
  containerRef,
  layers,
  canvasW,
  canvasH,
  bgColor = '#ffffff',
  transforms = {},
  selectedNodeId = null,
  font = null,
  // The document's operation library + the active machine profile (= export's
  // `outputMode`). Threaded through so the canvas stroke for each layer is the
  // SAME color the export emits (resolveExportColor): on a laser profile every
  // layer draws in its assigned operation's locked convention color (cut=red,
  // score=blue, engrave=black) rather than an arbitrary per-layer color; on
  // other profiles the layer's own color is preserved, matching export. Defaults
  // keep legacy/test callers (no operations) byte-identical to `layer.color`.
  operations = [],
  outputMode = null,
  // Color-view lens (spec: docs/material-preview-plan.md). null / operation mode
  // → canvas colors are BYTE-IDENTICAL to before (resolveCanvasColor delegates to
  // resolveExportColor). material mode → the sheet/process preview shading, and
  // the artboard background becomes the material's sheet hex. Export is untouched.
  colorView = null,
  // WI-4 Naqsha Panels: the panel array. A layer belongs to a panel via
  // `layer.panelId`; a layer on a HIDDEN panel renders as not-visible (no-draw
  // adapter) WITHOUT mutating `layer.visible`. Additive + LAST positional arg, so
  // callers that don't pass it get `[]` → `effectiveVisible` degrades to
  // `layer.visible` and behaviour is byte-identical to before panels existed.
  panels = [],
  // WI-3 custom-glyph store: the document's `{ [id]: glyph }` map. Used to
  // resolve a motif layer's `glyphRef` at the render seam and INJECT the glyph
  // object into its renderParams (below), so MotifPattern stays decoupled from
  // the store AND the in-app SVG export (which reuses these baked instances) sees
  // the same resolution. Additive + LAST positional arg, default `{}` → callers
  // that don't pass it resolve built-ins only (byte-identical to before).
  customGlyphs = {}
) {
  const p5Ref = useRef(null);
  const debounceRef = useRef(null);
  const rafRef = useRef(null);
  const [patternInstances, setPatternInstances] = useState({});
  const instancesRef = useRef({});
  // Etch (Raster Etch S1, #80): the single-source 1-bit bitmap is produced
  // ASYNCHRONOUSLY (decode → resample → worker), so it can't be built inside the
  // synchronous p5 draw. The cache holds `layer.id → { sig, bitmap }`; an effect
  // below fills it and calls the latest renderAll (held in a ref, like
  // transformsRef, to avoid dep churn) to repaint. renderAll's draw loop reads
  // the cached bitmap and both draws AND registers the export instance from it —
  // the same buffer for canvas and SVG (grilled decision 4).
  const etchBitmapCacheRef = useRef(new Map());
  const renderAllRef = useRef(null);
  // Live transform/selection read inside renderAll WITHOUT entering its dep
  // array — keeps renderAll's identity stable so the 150ms param-debounce
  // effect doesn't re-fire on every drag frame. The rAF effect below drives
  // immediate re-renders when these change.
  const transformsRef = useRef(transforms);
  const selectedRef = useRef(selectedNodeId);
  useEffect(() => {
    transformsRef.current = transforms;
    selectedRef.current = selectedNodeId;
  }, [transforms, selectedNodeId]);

  const renderAll = useCallback(() => {
    if (!p5Ref.current) return;
    const p = p5Ref.current;
    const nodeTransforms = transformsRef.current || {};
    p.clear();
    p.background(sheetBackground(colorView, bgColor));

    // Adapters over the live p5 instance: draw-mode for visible layers,
    // no-draw for hidden layers (RNG/color still delegate to p5, draw calls
    // are no-ops). Replaces the old leaky createOffscreenProxy.
    const drawCtx = new P5Adapter(p, { draw: true });
    const noDrawCtx = new P5Adapter(p, { draw: false });

    // Motif host-geometry PRE-PASS (order-independent). A host (currently only
    // Voronoi) stashes its resolved cells on the instance as `motifHostGeometry`
    // during generate(); motifs read them via resolveMotifHostParams below. We
    // harvest that geometry HERE, before the main paint loop, so placement never
    // depends on z-order — matching how grid/recursive/spiral motifs already read
    // host PARAMS directly. (Previously the harvest lived INSIDE the reverse-order
    // render loop; because addMotifLayer APPENDS a motif → last in `layers` →
    // FIRST in renderOrder, a freshly-added motif resolved its host params before
    // the host had generated → empty geometry → zero placements. This pre-pass
    // fixes that.) Each host is generated into a THROWAWAY instance ONLY to read
    // its geometry — the real drawn instance (which owns _lastParams/_lastCx for
    // SVG export) is still built in the main loop below. Hosts are probed
    // regardless of visibility, so a hidden host still feeds a visible motif.
    // NOTE: uses BASE host.params. Voronoi is not modulated/moiré, so harvested
    // cells == drawn cells; a modulated host would diverge → out of scope.
    // NO-DIVERGENCE: drawCtx/noDrawCtx wrap the SAME p5 instance, and
    // VoronoiCells.generate calls ctx.randomSeed(seed) first, so generating the
    // host twice (probe here, real draw below) reproduces byte-identical cells.
    const hostGeometry = collectMotifHostGeometry(layers, (host) => {
      const HostClass =
        PATTERN_CLASSES[host.patternType] || getDynamicPatternClass(host.patternType);
      if (!HostClass) return null;
      const probe = new HostClass();
      p.push(); // defensive matrix isolation — probe never draws, but be safe
      probe.generateWithContext(
        noDrawCtx,
        host.seed,
        host.params,
        canvasW,
        canvasH,
        resolveCanvasColor(host, { operations, outputMode, colorView, panels }),
        host.opacity
      );
      p.pop();
      return probe.motifHostGeometry || null;
    });

    // WI-4: panel lookup for effective visibility. Built once per render. A
    // layer on a hidden panel takes the no-draw path; with no panels (or no
    // matching panel) effectiveVisible degrades to layer.visible → byte-identical
    // to before. Never mutates layer.visible or any panel.
    const panelById = new Map((panels || []).map((pn) => [pn.id, pn]));

    const newInstances = {};
    // Render bottom-to-top: last layer in array is bottom, first is top (front)
    // We iterate in reverse so bottom layers paint first
    const renderOrder = [...layers].reverse();
    for (const layer of renderOrder) {
      // Effective visibility = layer.visible AND its panel.visible (if any).
      const vis = effectiveVisible(layer, panelById.get(layer.panelId));
      // Material lens: a layer whose OWN panel material differs from the lens
      // (background) sheet draws dimmed — its reaction colors belong to another
      // sheet than the one on screen. Applied ONLY to the visible draw calls;
      // the no-draw export-cache path keeps the layer's true opacity. 1
      // everywhere outside the Material lens (byte-identical baseline).
      const drawOpacity =
        layer.opacity * offSheetDimFactor(layer, { colorView, panels });
      // Imported-path artwork (issue #12) has no generative PatternClass — it's a
      // synthetic instance wrapping parsed SVG path data. Build it from layer
      // data so it both draws on canvas and exports via buildAllLayersSVG.
      if (layer.type === 'import') {
        const instance = new ImportedPath();
        newInstances[layer.id] = instance;
        if (!vis) {
          instance.generateWithContext(
            noDrawCtx, layer.seed, layer.params, canvasW, canvasH, resolveCanvasColor(layer, { operations, outputMode, colorView, panels }), layer.opacity
          );
          continue;
        }
        p.push();
        // Import pivots about its own geometry-bbox center (matches its tight
        // selection box + svgExport), so a resize/rotate stays in place.
        {
          const piv = importLayerPivot(layer, canvasW, canvasH);
          applyNodeTransform(p, nodeTransforms[layer.id], piv.x, piv.y);
        }
        instance.generateWithContext(
          drawCtx, layer.seed, layer.params, canvasW, canvasH, resolveCanvasColor(layer, { operations, outputMode, colorView, panels }), drawOpacity
        );
        p.pop();
        continue;
      }

      // Etch layer (Raster Etch, ADR-0006): a raster layer with no generative
      // PatternClass. Its 1-bit bitmap is computed off-thread and cached; here we
      // draw that SAME bitmap (via bitmapToRGBA) pixelated-scaled into the canvas
      // box, and register makeEtchInstance(bitmap) so svgExport embeds the exact
      // buffer we drew — the WYSIWYG single-source invariant (grilled decision 4).
      // Until the async bitmap arrives, the instance carries a null bitmap (export
      // emits nothing, no crash) and nothing is drawn.
      if (isEtchLayer(layer)) {
        const cached = etchBitmapCacheRef.current.get(layer.id);
        const bitmap = cached ? cached.bitmap : null;
        newInstances[layer.id] = makeEtchInstance(bitmap);
        if (!vis || !bitmap || !bitmap.width || !bitmap.height) continue;
        const color = resolveCanvasColor(layer, { operations, outputMode, colorView, panels });
        const rgba = bitmapToRGBA(bitmap, color);
        const img = p.createImage(bitmap.width, bitmap.height);
        img.loadPixels();
        img.pixels.set(rgba);
        img.updatePixels();
        p.push();
        applyNodeTransform(p, nodeTransforms[layer.id], canvasW / 2, canvasH / 2);
        p.noSmooth(); // pixelated — each dot maps to physical size (WYSIWYG)
        p.image(img, 0, 0, canvasW, canvasH);
        p.pop();
        continue;
      }

      // Text layer (Option B). drawTextNode owns its OWN push/pop and a
      // TEXT-bbox-center pivot, so it must NOT be wrapped in applyNodeTransform
      // (which pivots about the CANVAS center) — wrapping would double-transform.
      // No PatternClass instance is registered (none exists), like orphan-B.
      // Without a resolved font we can't draw; export is handled in a later phase.
      if (isTextLayer(layer)) {
        if (!vis || !font) continue;
        const nodeData = textNodeFromLayer(layer);
        drawTextNode(p, nodeData, font, nodeTransforms[layer.id]);
        continue;
      }

      const PatternClass = PATTERN_CLASSES[layer.patternType] || getDynamicPatternClass(layer.patternType);
      if (!PatternClass) continue;

      // Moiré single-source-of-truth resolution. A non-moiré layer (no
      // moireRole) keeps its own params verbatim — byte-identical to before.
      // A moiré layer resolves its render params via the pair helper: role A
      // uses its own params; role B reads partner A's. An ORPHAN B (no partner)
      // resolves to null → render NOTHING and add NO instance (so the cached-
      // instance export path skips it too). No crash.
      let renderParams = layer.params;
      if (layer.moireRole) {
        const resolved = resolveMoireSource(layer, layers);
        if (!resolved) continue; // orphan B — no instance cached, nothing drawn
        renderParams = { ...resolved.params, moireRole: resolved.moireRole };
      }

      // Pattern modulation (modulator-centric, Ableton-LFO model): a GUIDE
      // layer owns a `modulator` device that maps OUT to target layers. For this
      // layer (the target), resolveModulationForTarget finds a guide whose
      // modulator.maps point here and merges device-level + per-map controls with
      // the guide's resolved field into the runtime object GrainField reads as
      // `params.modulation`. Applied AFTER moiré so a moiré-resolved layer still
      // receives modulation. CRITICAL: when null we add NO `modulation` key, so an
      // unmodulated layer stays byte-identical to baseline (and matches its SVG
      // export). One injection covers BOTH the visible (drawCtx) and hidden
      // (noDrawCtx) calls below, which share this `renderParams`.
      // Phase 2b (PRD §5): a target may accumulate SEVERAL incoming modulations
      // (guide A's field PLUS guide B's), stacked like LFOs. resolveModulations…
      // returns ALL of them; we inject a COMPOSITE `params.modulation` that is
      // the first source's object (so every existing reader — warp/density/
      // distort/lattice consumers AND the motif-anchor refusal in semanticAnchors
      // / gridAnchors — sees the identical shape it always did) enriched with a
      // `sources` array carrying the full stack. Warp/density consumers stack via
      // stackWarpDisplacement / stackDensityWeight; distort/lattice consume the
      // first source (no PRD compose rule). N=1 → sources:[only] → byte-identical.
      const modulation = composeModulationParam(
        resolveModulationsForTarget(layer, layers)
      );
      if (modulation) {
        renderParams = { ...renderParams, modulation };
      }

      // Motif host-params injection (semantic anchors). A motif layer reads its
      // host's patternType + params PURELY off the layers array (like the
      // modulation/moiré resolves above) — no render-ordering dependency. A
      // Voronoi host's drawn cells come from the order-independent PRE-PASS above
      // (`hostGeometry`), so a motif places regardless of z-order. Non-motif
      // layers resolve null → byte-identical baseline.
      const motifHost = resolveMotifHostParams(layer, layers, hostGeometry);
      if (motifHost) {
        renderParams = { ...renderParams, ...motifHost };
      }

      // Motif GLYPH resolution (WI-3). Resolve the layer's `glyphRef` against the
      // built-in library first, then the document custom-glyph store, and inject
      // the resolved glyph OBJECT so MotifPattern (and the export path that reuses
      // its baked svgElements) stays decoupled from the store. Mirrors the
      // motifHost injection above. A MISSING glyph (e.g. a shared doc whose custom
      // glyph was stripped) resolves to undefined → no injection → MotifPattern's
      // built-in fallback also misses → renders nothing (graceful degrade, no
      // crash). Built-in motifs inject the same built-in object getGlyph returns,
      // so their output is byte-identical to before. Gated on isMotifLayer so
      // every other layer type is untouched.
      if (isMotifLayer(layer)) {
        const glyph = getGlyph(renderParams.glyphRef, customGlyphs);
        if (glyph) renderParams = { ...renderParams, glyph };
      }

      const instance = new PatternClass();
      newInstances[layer.id] = instance;

      if (!vis) {
        // Still generate for SVG export, but don't draw to canvas
        instance.generateWithContext(
          noDrawCtx,
          layer.seed,
          renderParams,
          canvasW,
          canvasH,
          resolveCanvasColor(layer, { operations, outputMode, colorView, panels }),
          layer.opacity
        );
        continue;
      }

      // Center-pivot transform (move/resize/rotate). Wraps the layer's bg fill
      // AND its draw so both move together and match the exported SVG group.
      p.push();
      applyNodeTransform(p, nodeTransforms[layer.id], canvasW / 2, canvasH / 2);

      // Draw layer background fill if bgOpacity > 0
      if (layer.bgOpacity > 0) {
        const bgAlpha = Math.round((layer.bgOpacity / 100) * 255);
        const bgC = p.color(layer.bgColor);
        bgC.setAlpha(bgAlpha);
        p.noStroke();
        p.fill(bgC);
        p.rect(0, 0, canvasW, canvasH);
      }

      instance.generateWithContext(drawCtx, layer.seed, renderParams, canvasW, canvasH, resolveCanvasColor(layer, { operations, outputMode, colorView, panels }), drawOpacity);
      p.pop();
    }

    // Selection chrome (canvas-drawn): bbox outline + 8 resize handles + 1
    // rotate handle, drawn INSIDE the node's pivot transform so they rotate/scale
    // WITH the node. The bbox + pivot come from buildSelectables — the SAME source
    // of truth the Select tool hit-tests/gestures against — so the drawn handles
    // and the grabbable handles always agree (full canvas for a pattern, tight
    // geometry for an import, tight glyph bbox for text). Falls back to full
    // canvas + canvas center when no selectable resolves (e.g. text before its
    // font loads). Guarded by layers.find so a stale id can't throw.
    const selId = selectedRef.current;
    if (selId) {
      const selLayer = layers.find(
        (l) => l.id === selId && effectiveVisible(l, panelById.get(l.panelId)) && !l.locked
      );
      if (selLayer) {
        const sel = buildSelectables({ layers, font, canvasW, canvasH }).find(
          (s) => s.id === selId
        );
        const selBBox = sel ? sel.localBBox : { x: 0, y: 0, w: canvasW, h: canvasH };
        const piv = sel ? sel.pivot : { x: canvasW / 2, y: canvasH / 2 };
        const t = nodeTransforms[selId] || { x: 0, y: 0, rotation: 0, scale: 1 };
        p.push();
        p.translate(t.x || 0, t.y || 0);
        p.translate(piv.x, piv.y);
        if (t.rotation) p.rotate(p.radians(t.rotation));
        if (t.scale != null && t.scale !== 1) p.scale(t.scale);
        p.translate(-piv.x, -piv.y);

        // Bbox outline.
        p.noFill();
        p.stroke(124, 92, 246); // violet accent
        p.strokeWeight(1);
        p.rect(selBBox.x + 0.5, selBBox.y + 0.5, selBBox.w - 1, selBBox.h - 1);

        const handles = handlesFor(selBBox);
        const rotate = handles.find((h) => h.id === 'rotate');
        const topCenter = handles.find((h) => h.id === 'n');
        // Stalk from the top-edge center up to the rotate handle.
        if (rotate && topCenter) {
          p.stroke(124, 92, 246);
          p.strokeWeight(1);
          p.line(topCenter.x, topCenter.y, rotate.x, rotate.y);
        }

        const HS = 8; // handle square size (px, local units)
        p.stroke(124, 92, 246);
        p.strokeWeight(1);
        p.fill(255);
        for (const h of handles) {
          if (h.type === 'rotate') {
            p.circle(h.x, h.y, HS);
          } else {
            p.rectMode(p.CENTER);
            p.rect(h.x, h.y, HS, HS);
            p.rectMode(p.CORNER);
          }
        }
        p.pop();
      }
    }

    instancesRef.current = newInstances;
    setPatternInstances(newInstances);
    // `font` resolves asynchronously (null → Font); it's in the deps so when it
    // arrives renderAll gets a new identity, the debounce effect re-fires, and
    // text actually paints. Changes once, so it doesn't churn the param-debounce.
    // `operations` + `outputMode` are deps so recoloring an operation (or
    // switching machine profile) re-resolves every layer's stroke and repaints.
    // `panels` is a dep so toggling a panel's visibility (new array identity)
    // gives renderAll a new identity → the debounce effect re-fires and repaints.
  }, [layers, canvasW, canvasH, bgColor, font, operations, outputMode, colorView, panels, customGlyphs]);

  // Keep the latest renderAll in a ref so the async Etch effect can repaint
  // WITHOUT taking renderAll as a dependency (which would relaunch bitmap
  // computation on every param edit). Mirrors transformsRef's decoupling.
  useEffect(() => {
    renderAllRef.current = renderAll;
  }, [renderAll]);

  // Etch bitmaps: compute the single-source 1-bit buffer for every Etch layer
  // whose source/DPI/canvas-size changed, off the main thread (grilled decision
  // 4). Fills etchBitmapCacheRef then repaints via renderAllRef. Keyed by a
  // signature so an unchanged Etch never recomputes; removed Etches are pruned.
  //
  // Liveness (FIX 2): the entry carries a `resolving` flag and the effect does
  // NOT cancel/drop in-flight results. An unrelated `layers`-identity change
  // during the ~10–50ms decode therefore can't strand the Etch at `bitmap:null`
  // — etchCacheNeedsResolve relaunches a still-unresolved entry, and every
  // resolve writes its result (guarded by a re-read of the current signature so
  // a superseded run can't clobber a newer bitmap). Writing to the ref Map after
  // unmount is harmless: renderAll no-ops once p5Ref is torn down.
  useEffect(() => {
    const cache = etchBitmapCacheRef.current;
    const live = new Set();
    for (const layer of layers) {
      if (!isEtchLayer(layer)) continue;
      const { source, dpi, stack } = layer.params || {};
      // Include the Etch Stack in the signature so editing a Stage (add /
      // reorder / bypass / any Tone/Dither control — mode & size live in each
      // Stage's params, which JSON.stringify captures) re-resolves the
      // single-source bitmap live. threshold/invert are intentionally OMITTED:
      // they are not Etch-layer params yet (resolveEtchBitmap passes only
      // { stack }), so there is nothing to key on until they become controls.
      const sig = `${dpi}|${canvasW}|${canvasH}|${source || ''}|${JSON.stringify(stack || [])}`;
      live.add(layer.id);
      const cached = cache.get(layer.id);
      if (!etchCacheNeedsResolve(cached, sig)) continue;
      // Carry forward a same-signature bitmap (a benign relaunch) but mark the
      // entry resolving so a concurrent effect run doesn't double-launch.
      const carried = cached && cached.sig === sig ? cached.bitmap : null;
      cache.set(layer.id, { sig, bitmap: carried, resolving: true });
      resolveEtchBitmap(layer, canvasW, canvasH)
        .then((bitmap) => {
          const cur = cache.get(layer.id);
          if (!cur || cur.sig !== sig) return; // superseded by a newer signature
          if (!bitmap) {
            cache.set(layer.id, { ...cur, resolving: false });
            return;
          }
          cache.set(layer.id, { sig, bitmap, resolving: false });
          renderAllRef.current?.();
        })
        .catch(() => {
          // decode/threshold failure: clear the in-flight flag so a later run can
          // retry, leaving any last-known bitmap intact. No crash.
          const cur = cache.get(layer.id);
          if (cur && cur.sig === sig) cache.set(layer.id, { ...cur, resolving: false });
        });
    }
    // Prune cache entries for layers that no longer exist.
    for (const id of [...cache.keys()]) {
      if (!live.has(id)) cache.delete(id);
    }
  }, [layers, canvasW, canvasH]);

  // Initialize p5 instance
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up old instance
    if (p5Ref.current) {
      p5Ref.current.remove();
      p5Ref.current = null;
    }

    const sketch = (p) => {
      p.setup = () => {
        p.createCanvas(canvasW, canvasH);
        p.pixelDensity(1);
        p.noLoop();
      };
      p.draw = () => {};
    };

    p5Ref.current = new p5(sketch, containerRef.current);

    // Give p5 a frame to set up, then render
    const timer = setTimeout(() => renderAll(), 50);
    return () => {
      clearTimeout(timer);
      if (p5Ref.current) {
        p5Ref.current.remove();
        p5Ref.current = null;
      }
    };
  }, [containerRef, canvasW, canvasH]);

  // Debounced re-render on layer changes
  useEffect(() => {
    if (!p5Ref.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Resize canvas if needed
      if (p5Ref.current && (p5Ref.current.width !== canvasW || p5Ref.current.height !== canvasH)) {
        p5Ref.current.resizeCanvas(canvasW, canvasH);
      }
      renderAll();
    }, 150);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [layers, canvasW, canvasH, bgColor, renderAll]);

  // Immediate (un-debounced) re-render when transforms or selection change —
  // throttled to one frame via rAF. Patterns are deterministic by seed, so
  // re-running generate during a drag is visually stable. Param edits still go
  // through the 150ms debounce above.
  useEffect(() => {
    if (!p5Ref.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      renderAll();
    });
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // renderAll deliberately omitted: it changes identity whenever `layers`
    // change, which would make param edits re-fire this IMMEDIATE path and
    // bypass the 150ms debounce. During a drag `layers` is unchanged so the
    // captured renderAll reads correct layers; transform values are read live
    // from transformsRef inside renderAll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transforms, selectedNodeId]);

  return { patternInstances };
}
