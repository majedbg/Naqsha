// Unified selectable list for the Select tool.
//
// Patterns and text nodes are both selectable, but they differ in how their
// bounding box + rotate/scale pivot are derived:
//
//   - PATTERN: draws across the whole canvas with no cheap tight extent, so its
//     selectable bbox is the FULL CANVAS {0,0,canvasW,canvasH} and its pivot is
//     the CANVAS CENTER (canvasW/2, canvasH/2). (Matches useCanvas's pattern
//     render + buildSceneSVG's pivot.)
//
//   - TEXT: exposes a TIGHT bbox from its laid-out glyphs. The glyphs are baked
//     at world coordinates offset by (node.x, node.y) — TextNode.localBBox() is
//     ORIGIN-based ({x:0,y:0,w,h}), so the WORLD bbox is {node.x, node.y, w, h}
//     and the pivot is its center (node.x + w/2, node.y + h/2). This same pivot
//     is used by drawTextNode (canvas) and textGroups (SVG export) so the
//     selection chrome, hit-test, gestures, render and export all agree.
//
// The returned order is TEXT NODES FIRST (on top — text is drawn after the
// pattern loop in useCanvas), then pattern layers in layers[] order (front to
// back). Hit-testing walks this list top-first so a click on text wins over the
// full-canvas pattern bbox beneath it.
//
// Pure: no DOM. The caller supplies a RESOLVED opentype `font` so text bboxes
// can be measured; with no font, text nodes are SKIPPED (not yet measurable).

import { TextNode } from './TextNode.js';

/**
 * @param {{
 *   layers?: Array<object>,
 *   textNodes?: Array<object>,
 *   font?: import('opentype.js').Font|null,
 *   canvasW: number, canvasH: number,
 * }} scene
 *
 * NOTE: pattern instances are intentionally NOT consumed — a pattern's
 * selectable bbox is the full canvas regardless of its rendered content (the P1
 * approximation), so callers needn't thread instances through here.
 * @returns {Array<{ id:string, kind:'text'|'pattern',
 *                   localBBox:{x,y,w,h}, pivot:{x,y} }>}
 *   `localBBox` is the node's WORLD-positioned (untransformed) bbox: full canvas
 *   for patterns, the tight glyph box offset by (x,y) for text. `pivot` is that
 *   bbox's center. The node transform (from the transforms map) is layered ON
 *   TOP of this by the caller (hit-test / gestures / chrome / render / export).
 */
export function buildSelectables({ layers = [], textNodes = [], font = null, canvasW, canvasH }) {
  const out = [];

  // Text first (drawn on top → selected first).
  if (font) {
    for (const data of textNodes) {
      const tn = new TextNode({ ...data, font });
      const local = tn.localBBox(); // {x:0,y:0,w,h} — origin-based
      const x = data.x || 0;
      const y = data.y || 0;
      const bbox = { x, y, w: local.w, h: local.h };
      out.push({
        id: data.id,
        kind: 'text',
        localBBox: bbox,
        pivot: { x: x + local.w / 2, y: y + local.h / 2 },
      });
    }
  }

  // Patterns next, in layers[] order (front to back). Hidden layers are NOT
  // selectable — a click over a hidden top layer must fall through to the
  // visible layer beneath it (matches the old pickTopmostHit behavior).
  for (const layer of layers) {
    if (layer.visible === false) continue;
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
 * top-first and returns the first hit's id, or null on a miss.
 *
 * The hit test inverse-maps the pointer about the node's PIVOT (so rotated /
 * scaled nodes test correctly) and checks the node's WORLD bbox.
 */
export function pickTopmost(point, selectables, transforms = {}) {
  for (const sel of selectables) {
    const t = transforms[sel.id] || { x: 0, y: 0, rotation: 0, scale: 1 };
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
