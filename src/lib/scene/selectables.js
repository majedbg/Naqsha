// Unified selectable list for the Select tool (pattern + text layers).
//
// Patterns and text layers are both selectable, but they differ in how their
// bounding box + rotate/scale pivot are derived:
//
//   - PATTERN: draws across the whole canvas with no cheap tight extent, so its
//     selectable bbox is the FULL CANVAS {0,0,canvasW,canvasH} and its pivot is
//     the CANVAS CENTER (canvasW/2, canvasH/2). This matches useCanvas's pattern
//     render (center-pivot transform) and svgExport's pivot.
//
//   - IMPORT: dropped/imported artwork has a TIGHT geometry extent (its path
//     bbox), so the selectable bbox hugs the object and the pivot is that bbox's
//     centre — resize/rotate act in place. useCanvas render + svgExport use the
//     SAME pivot (importLayerPivot) so chrome, hit-test, render and export agree.
//     Geometry-less imports fall back to the PATTERN case (full canvas).
//
//   - TEXT: exposes a TIGHT bbox from its laid-out glyphs. TextNode.localBBox()
//     is ORIGIN-based ({x:0,y:0,w,h}), so the WORLD bbox is {x, y, w, h} (x,y
//     from layer.params) and the pivot is its center (x + w/2, y + h/2). This
//     same pivot is used by drawTextNode (canvas) and textNodeCommands (export)
//     so selection chrome, hit-test, gestures, render and export all agree.
//
// Returned in layers[] order (front to back), preserving z-order. Hit-testing
// walks the list front-first so a click hits the topmost visible layer.
//
// Pure: no DOM. The caller supplies a RESOLVED opentype `font` so text bboxes
// can be measured; with no font, text layers are SKIPPED (not yet measurable).

import { isTextLayer, textNodeFromLayer } from '../text/textLayer.js';
import { TextNode } from './TextNode.js';
import { importLayerBBox } from './placement.js';

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };

/**
 * @param {{ layers?: Array<object>, font?: import('opentype.js').Font|null,
 *           canvasW: number, canvasH: number }} scene
 * @returns {Array<{ id:string, kind:'text'|'pattern',
 *                   localBBox:{x,y,w,h}, pivot:{x,y} }>}
 *   `localBBox` is the node's WORLD-positioned (untransformed) bbox; `pivot` is
 *   its center. The node transform (from the transforms map) is layered ON TOP
 *   of this by the caller (hit-test / gestures / chrome / render / export).
 */
export function buildSelectables({ layers = [], font = null, canvasW, canvasH }) {
  const out = [];
  // Hidden or locked layers are NOT selectable on the canvas — a click over one
  // must fall through to the visible, unlocked layer beneath it. (Locked layers
  // remain selectable via the layer tree so they can be unlocked.)
  for (const layer of layers) {
    if (layer.visible === false) continue;
    if (layer.locked) continue;

    if (isTextLayer(layer)) {
      // Not measurable without a resolved font → not selectable yet.
      if (!font) continue;
      const tn = new TextNode({ ...textNodeFromLayer(layer), font });
      const local = tn.localBBox(); // {x:0,y:0,w,h} — origin-based
      const x = layer.params?.x || 0;
      const y = layer.params?.y || 0;
      out.push({
        id: layer.id,
        kind: 'text',
        localBBox: { x, y, w: local.w, h: local.h },
        pivot: { x: x + local.w / 2, y: y + local.h / 2 },
      });
      continue;
    }

    // IMPORT: dropped/imported artwork draws at a TIGHT geometry extent, not the
    // whole canvas. Use its geometry bbox so the selection box hugs the object and
    // its handles stay on-screen; pivot is that bbox's centre so resize/rotate act
    // IN PLACE (matching useCanvas render + svgExport, which use the same pivot).
    // No measurable geometry → fall back to full-canvas (legacy behaviour).
    if (layer.type === 'import') {
      const bb = importLayerBBox(layer);
      if (bb) {
        out.push({
          id: layer.id,
          kind: 'import',
          localBBox: { x: bb.x, y: bb.y, w: bb.w, h: bb.h },
          pivot: { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 },
        });
        continue;
      }
    }

    out.push({
      id: layer.id,
      kind: 'pattern',
      localBBox: { x: 0, y: 0, w: canvasW, h: canvasH },
      pivot: { x: canvasW / 2, y: canvasH / 2 },
    });
  }
  return out;
}

/**
 * Topmost selectable hit by `point` (world/canvas space), honoring each node's
 * live transform (from `transforms`, identity fallback). Walks the selectables
 * front-first and returns the first hit's id, or null on a miss.
 *
 * The hit test inverse-maps the pointer about the node's PIVOT (so rotated /
 * scaled nodes test correctly) and checks the node's WORLD bbox.
 */
export function pickTopmost(point, selectables, transforms = {}) {
  for (const sel of selectables) {
    const t = transforms[sel.id] || IDENTITY;
    if (hitSelectable(point, sel, t)) return sel.id;
  }
  return null;
}

/** True if world `point` lands inside `sel` given transform `t`. */
export function hitSelectable(point, sel, t) {
  const bbox = sel.localBBox;
  const pivot = sel.pivot;
  const lp = inverse(point, t, pivot);
  return (
    lp.x >= bbox.x &&
    lp.x <= bbox.x + bbox.w &&
    lp.y >= bbox.y &&
    lp.y <= bbox.y + bbox.h
  );
}

const DEG = Math.PI / 180;
// Local inverse so this module stays self-contained for hit-testing; identical
// math to transformOps.inversePoint (undo translate, pivot, rotation, scale).
function inverse(point, transform, pivot) {
  const { x = 0, y = 0, rotation = 0, scale = 1 } = transform || {};
  const tx = point.x - x - pivot.x;
  const ty = point.y - y - pivot.y;
  const rad = -rotation * DEG;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const rx = tx * c - ty * s;
  const ry = tx * s + ty * c;
  const inv = scale === 0 ? 0 : 1 / scale;
  return { x: rx * inv + pivot.x, y: ry * inv + pivot.y };
}
