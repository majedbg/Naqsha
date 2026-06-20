// Selectable list for the Select tool (pattern layers).
//
// A pattern draws across the whole canvas with no cheap tight extent, so its
// selectable bbox is the FULL CANVAS {0,0,canvasW,canvasH} and its pivot is the
// CANVAS CENTER (canvasW/2, canvasH/2). This matches useCanvas's pattern render
// (center-pivot transform) and svgExport's pivot, so the selection chrome,
// hit-test, gestures, render and export all agree.
//
// Returned in layers[] order (front to back). Hit-testing walks the list
// front-first so a click hits the topmost visible layer, mirroring z-order.
//
// Pure: no DOM. (Text nodes are intentionally out of scope here — this is the
// pattern-only Select wiring.)

const IDENTITY = { x: 0, y: 0, rotation: 0, scale: 1 };

/**
 * @param {{ layers?: Array<object>, canvasW: number, canvasH: number }} scene
 * @returns {Array<{ id:string, kind:'pattern', localBBox:{x,y,w,h}, pivot:{x,y} }>}
 *   `localBBox` is the node's WORLD-positioned (untransformed) bbox; `pivot` is
 *   its center. The node transform (from the transforms map) is layered ON TOP
 *   of this by the caller (hit-test / gestures / chrome / render / export).
 */
export function buildSelectables({ layers = [], canvasW, canvasH }) {
  const out = [];
  // Hidden layers are NOT selectable — a click over a hidden top layer must fall
  // through to the visible layer beneath it.
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
