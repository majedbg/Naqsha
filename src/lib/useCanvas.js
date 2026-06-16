import { useEffect, useRef, useCallback, useState } from 'react';
import p5 from 'p5';
import { getDynamicPatternClass } from './patternRegistry';
import { P5Adapter } from './patterns/drawingContext';
import { PATTERN_CLASSES } from './patterns';
import { resolveMoireSource } from './moirePair';
import { handlesFor } from './transform/handles.js';
import { drawTextNode } from './text/drawTextNode.js';
import { TextNode } from './scene/TextNode.js';
import { caretXY } from './text/caret.js';

export default function useCanvas(
  containerRef,
  layers,
  canvasW,
  canvasH,
  bgColor = '#ffffff',
  nodeTransforms = {},
  selectedNodeId = null,
  textNodes = [],
  font = null,
  editingNodeId = null
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
  // Text nodes + resolved font are read live inside renderAll (like transforms/
  // selection) so the immediate rAF re-render below repaints added/changed text
  // without re-entering renderAll's identity (which would bypass the debounce).
  const textNodesRef = useRef(textNodes);
  const fontRef = useRef(font);
  // Editing node + caret index (selectionStart) read live inside renderAll so
  // the caret draws/moves without re-entering renderAll's identity. The caret
  // index arrives via a window 'text-caret' CustomEvent from TextEditOverlay.
  const editingRef = useRef(editingNodeId);
  const caretIndexRef = useRef(0);
  useEffect(() => {
    transformsRef.current = nodeTransforms;
    selectedRef.current = selectedNodeId;
    textNodesRef.current = textNodes;
    fontRef.current = font;
    editingRef.current = editingNodeId;
  }, [nodeTransforms, selectedNodeId, textNodes, font, editingNodeId]);

  // Listen for caret-index updates from the editing textarea.
  useEffect(() => {
    const onCaret = (e) => {
      caretIndexRef.current = e.detail?.index ?? 0;
    };
    window.addEventListener('text-caret', onCaret);
    return () => window.removeEventListener('text-caret', onCaret);
  }, []);

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

    // Text layer: drawn AFTER the pattern loop (so text is on top of patterns)
    // and BEFORE the selection chrome. Each plain text-node datum is reified +
    // laid out + drawn by drawTextNode, wrapped in the SAME center-pivot
    // transform patterns use, so canvas matches the exported SVG. Only when the
    // font has resolved (drawTextNode also guards font internally).
    const textNodesNow = textNodesRef.current || [];
    const fontNow = fontRef.current;
    if (fontNow) {
      // Transform is read from the authoritative transforms map (keyed by node
      // id), NOT from the node datum — so undo (which snapshots the map) covers
      // text moves. Identity fallback for an untouched node.
      for (const tn of textNodesNow) drawTextNode(p, tn, fontNow, transforms[tn.id]);
    }

    // Blinking caret for the node being edited. Drawn INSIDE that node's
    // center-pivot transform (same form as the glyphs) so it tracks moves/
    // rotation/scale. caretXY returns the bar's LOCAL top-left + height; we draw
    // it offset by (node.x, node.y) since layoutText is origin-based but glyphs
    // are baked at world coords. Blink: visible during the first half of each
    // 1060ms period (≈ standard caret cadence).
    const editId = editingRef.current;
    if (editId && fontNow) {
      const editNode = textNodesNow.find((tn) => tn.id === editId);
      if (editNode) {
        const blinkOn = (Date.now() % 1060) < 530;
        if (blinkOn) {
          const tnode = new TextNode({ ...editNode, font: fontNow });
          const local = tnode.localBBox();
          const pivot = {
            x: (editNode.x || 0) + local.w / 2,
            y: (editNode.y || 0) + local.h / 2,
          };
          const car = caretXY(editNode.text, caretIndexRef.current, {
            font: fontNow,
            fontSize: editNode.fontSize,
            align: editNode.align || 'left',
            lineHeight: editNode.lineHeight || 1.2,
            wrapWidth: editNode.lineMode === 'multi' ? editNode.box?.w : null,
          });
          const t = transforms[editId] || { x: 0, y: 0, rotation: 0, scale: 1 };
          p.push();
          p.translate(t.x || 0, t.y || 0);
          p.translate(pivot.x, pivot.y);
          if (t.rotation) p.rotate(p.radians(t.rotation));
          if (t.scale != null && t.scale !== 1) p.scale(t.scale);
          p.translate(-pivot.x, -pivot.y);
          const caretX = (editNode.x || 0) + car.x;
          const caretY = (editNode.y || 0) + car.y;
          p.stroke(editNode.color || '#000000');
          p.strokeWeight(Math.max(1, editNode.fontSize * 0.04));
          p.line(caretX, caretY, caretX, caretY + car.height);
          p.pop();
        }
      }
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
      // Resolve the selected node's WORLD (untransformed) bbox + pivot. Patterns
      // use the full canvas with the canvas-center pivot (as before). Text uses
      // its TIGHT glyph box offset by (x,y), pivot = that box's center — the SAME
      // bbox/pivot the gestures + hit-test use, so chrome tracks the node.
      const selLayer = layers.find((l) => l.id === selId);
      let selBBox = null;
      let pivot = null;
      if (selLayer) {
        selBBox = { x: 0, y: 0, w: canvasW, h: canvasH };
        pivot = { x: canvasW / 2, y: canvasH / 2 };
      } else if (fontNow) {
        const selText = textNodesNow.find((tn) => tn.id === selId);
        if (selText) {
          const node = new TextNode({ ...selText, font: fontNow });
          const local = node.localBBox();
          const nx = selText.x || 0;
          const ny = selText.y || 0;
          selBBox = { x: nx, y: ny, w: local.w, h: local.h };
          pivot = { x: nx + local.w / 2, y: ny + local.h / 2 };
        }
      }
      if (selBBox) {
        const t = transforms[selId] || { x: 0, y: 0, rotation: 0, scale: 1 };
        const cx = pivot.x;
        const cy = pivot.y;
        p.push();
        // Same center-pivot transform used for the node render.
        p.translate(t.x || 0, t.y || 0);
        p.translate(cx, cy);
        if (t.rotation) p.rotate(p.radians(t.rotation));
        if (t.scale != null && t.scale !== 1) p.scale(t.scale);
        p.translate(-cx, -cy);

        // Bbox outline (node's world bbox).
        p.noFill();
        p.stroke(124, 92, 246); // violet accent
        p.strokeWeight(1);
        p.rect(selBBox.x + 0.5, selBBox.y + 0.5, selBBox.w - 1, selBBox.h - 1);

        const handles = handlesFor(selBBox);
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
    // values are read live from transformsRef inside renderAll. textNodes/font
    // join this immediate path so adding/changing text repaints right away
    // (also read live from refs inside renderAll, same pattern as transforms).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeTransforms, selectedNodeId, textNodes, font, editingNodeId]);

  // While a node is being edited, drive a steady repaint so the caret blinks
  // and follows arrow-key/click caret moves (read live from caretIndexRef). The
  // interval is cheap relative to typing and stops the moment editing ends.
  useEffect(() => {
    if (!editingNodeId || !p5Ref.current) return;
    const timer = setInterval(() => {
      if (p5Ref.current) renderAll();
    }, 60);
    return () => clearInterval(timer);
    // renderAll omitted deliberately (same rationale as the immediate effect):
    // it re-identifies on `layers` changes; the captured closure reads live refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNodeId]);

  return { patternInstances };
}
