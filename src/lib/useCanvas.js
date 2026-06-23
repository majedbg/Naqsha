import { useEffect, useRef, useCallback, useState } from 'react';
import p5 from 'p5';
import { getDynamicPatternClass } from './patternRegistry';
import { P5Adapter } from './patterns/drawingContext';
import { PATTERN_CLASSES } from './patterns';
import ImportedPath from './patterns/ImportedPath';
import { resolveMoireSource } from './moirePair';
import { resolveLayerModulation } from './fields/resolveModulation';
import { handlesFor } from './transform/handles';
import { drawTextNode } from './text/drawTextNode';
import { isTextLayer, textNodeFromLayer } from './text/textLayer';
import { importLayerPivot } from './scene/placement';
import { buildSelectables } from './scene/selectables';
import { resolveCanvasColor, sheetBackground } from './materialPreview';

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
  colorView = null
) {
  const p5Ref = useRef(null);
  const debounceRef = useRef(null);
  const rafRef = useRef(null);
  const [patternInstances, setPatternInstances] = useState({});
  const instancesRef = useRef({});
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

    const newInstances = {};
    // Render bottom-to-top: last layer in array is bottom, first is top (front)
    // We iterate in reverse so bottom layers paint first
    const renderOrder = [...layers].reverse();
    for (const layer of renderOrder) {
      // Imported-path artwork (issue #12) has no generative PatternClass — it's a
      // synthetic instance wrapping parsed SVG path data. Build it from layer
      // data so it both draws on canvas and exports via buildAllLayersSVG.
      if (layer.type === 'import') {
        const instance = new ImportedPath();
        newInstances[layer.id] = instance;
        if (!layer.visible) {
          instance.generateWithContext(
            noDrawCtx, layer.seed, layer.params, canvasW, canvasH, resolveCanvasColor(layer, { operations, outputMode, colorView }), layer.opacity
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
          drawCtx, layer.seed, layer.params, canvasW, canvasH, resolveCanvasColor(layer, { operations, outputMode, colorView }), layer.opacity
        );
        p.pop();
        continue;
      }

      // Text layer (Option B). drawTextNode owns its OWN push/pop and a
      // TEXT-bbox-center pivot, so it must NOT be wrapped in applyNodeTransform
      // (which pivots about the CANVAS center) — wrapping would double-transform.
      // No PatternClass instance is registered (none exists), like orphan-B.
      // Without a resolved font we can't draw; export is handled in a later phase.
      if (isTextLayer(layer)) {
        if (!layer.visible || !font) continue;
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

      // Pattern modulation (slice 2): a guide layer's scalar field steers this
      // layer's density at geometry-build time. Resolved from the layer's
      // STORED spec (layer.modulation) into the runtime object GrainField wants.
      // Applied AFTER moiré so a moiré-resolved layer still receives modulation.
      // CRITICAL: when null we add NO `modulation` key, so an unmodulated layer
      // stays byte-identical to baseline (and matches its SVG export). One
      // injection covers BOTH the visible (drawCtx) and hidden (noDrawCtx) calls
      // below, which share this `renderParams`.
      const mod = resolveLayerModulation(layer, layers);
      if (mod) {
        renderParams = { ...renderParams, modulation: mod };
      }

      const instance = new PatternClass();
      newInstances[layer.id] = instance;

      if (!layer.visible) {
        // Still generate for SVG export, but don't draw to canvas
        instance.generateWithContext(
          noDrawCtx,
          layer.seed,
          renderParams,
          canvasW,
          canvasH,
          resolveCanvasColor(layer, { operations, outputMode, colorView }),
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

      instance.generateWithContext(drawCtx, layer.seed, renderParams, canvasW, canvasH, resolveCanvasColor(layer, { operations, outputMode, colorView }), layer.opacity);
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
      const selLayer = layers.find((l) => l.id === selId && l.visible !== false && !l.locked);
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
  }, [layers, canvasW, canvasH, bgColor, font, operations, outputMode, colorView]);

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
