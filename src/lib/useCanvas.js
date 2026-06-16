import { useEffect, useRef, useCallback, useState } from 'react';
import p5 from 'p5';
import { getDynamicPatternClass } from './patternRegistry';
import { P5Adapter } from './patterns/drawingContext';
import { PATTERN_CLASSES } from './patterns';
import { resolveMoireSource } from './moirePair';
import { handlesFor } from './transform/handles.js';

export default function useCanvas(
  containerRef,
  layers,
  canvasW,
  canvasH,
  bgColor = '#ffffff',
  nodeTransforms = {},
  selectedNodeId = null
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
  const transformsRef = useRef(nodeTransforms);
  const selectedRef = useRef(selectedNodeId);
  useEffect(() => {
    transformsRef.current = nodeTransforms;
    selectedRef.current = selectedNodeId;
  }, [nodeTransforms, selectedNodeId]);

  const renderAll = useCallback(() => {
    if (!p5Ref.current) return;
    const p = p5Ref.current;
    const transforms = transformsRef.current || {};
    p.clear();
    p.background(bgColor);

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
          layer.color,
          layer.opacity
        );
        continue;
      }

      // Center-pivot transform: rotate/scale about the node's bbox center
      // (cx,cy) = canvas center, then translate by (x,y). Matches the SVG
      // `translate(x y) translate(cx cy) rotate scale translate(-cx -cy)` form
      // emitted by transformToSVG, so canvas and exported SVG stay consistent.
      // Identity transform → no-op (guarded) so untouched layers are unchanged.
      const t = transforms[layer.id];
      p.push();
      if (t && (t.x || t.y || (t.rotation && t.rotation !== 0) || (t.scale != null && t.scale !== 1))) {
        const cx = canvasW / 2;
        const cy = canvasH / 2;
        p.translate(t.x || 0, t.y || 0);
        p.translate(cx, cy);
        if (t.rotation) p.rotate(p.radians(t.rotation));
        if (t.scale != null && t.scale !== 1) p.scale(t.scale);
        p.translate(-cx, -cy);
      }

      // Draw layer background fill if bgOpacity > 0
      if (layer.bgOpacity > 0) {
        const bgAlpha = Math.round((layer.bgOpacity / 100) * 255);
        const bgC = p.color(layer.bgColor);
        bgC.setAlpha(bgAlpha);
        p.noStroke();
        p.fill(bgC);
        p.rect(0, 0, canvasW, canvasH);
      }

      instance.generateWithContext(drawCtx, layer.seed, renderParams, canvasW, canvasH, layer.color, layer.opacity);
      p.pop();
    }

    // Selection chrome (canvas-drawn, plan §5): bbox outline + 8 resize handles
    // + 1 rotate handle, drawn INSIDE the node's center-pivot transform so they
    // rotate/scale WITH the node. Handles are placed at LOCAL bbox coords (full
    // canvas), so the same transform maps them to where the node is.
    // Guarded by layers.find so a stale id (deleted layer) can't throw. The
    // transform is applied UNCONDITIONALLY (identity → no-op) so a freshly
    // selected, untransformed node still shows its handles.
    const selId = selectedRef.current;
    if (selId) {
      const selLayer = layers.find((l) => l.id === selId);
      if (selLayer) {
        const t = transforms[selId] || { x: 0, y: 0, rotation: 0, scale: 1 };
        const cx = canvasW / 2;
        const cy = canvasH / 2;
        p.push();
        // Same center-pivot transform used for the node render.
        p.translate(t.x || 0, t.y || 0);
        p.translate(cx, cy);
        if (t.rotation) p.rotate(p.radians(t.rotation));
        if (t.scale != null && t.scale !== 1) p.scale(t.scale);
        p.translate(-cx, -cy);

        // Bbox outline (local full-canvas coords).
        p.noFill();
        p.stroke(124, 92, 246); // violet accent
        p.strokeWeight(1);
        p.rect(0.5, 0.5, canvasW - 1, canvasH - 1);

        const handles = handlesFor({ x: 0, y: 0, w: canvasW, h: canvasH });
        const rotate = handles.find((h) => h.id === 'rotate');
        const topCenter = handles.find((h) => h.id === 'n');

        // Line from top-edge center up to the rotate handle.
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
  }, [layers, canvasW, canvasH, bgColor]);

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
  // re-running generate during a drag is visually stable (CPU cost is a known
  // perf follow-up). Param edits still go through the 150ms debounce above.
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
    // bypass the 150ms debounce (decision #3). During a drag `layers` is
    // unchanged so the captured renderAll reads correct layers; transform
    // values are read live from transformsRef inside renderAll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeTransforms, selectedNodeId]);

  return { patternInstances };
}
