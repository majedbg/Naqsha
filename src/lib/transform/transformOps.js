// Pure transform math for the interactive editing core.
//
// A `transform` is { x, y, rotation, scale } where:
//   - rotation is in DEGREES (clockwise in screen space: +y is down on canvas).
//   - scale is uniform.
//
// PIVOT CONVENTION (important, load-bearing for the canvas == SVG invariant):
//
//   `applyTransform(point, transform)` is the ORIGIN-based primitive. It applies
//   scale, THEN rotation, THEN translation — all about the world origin (0,0).
//   This matches the SVG attribute value emitted by `transformToSVG`:
//       translate(x,y) rotate(deg) scale(s)
//   which SVG applies right-to-left to geometry (scale first, then rotate, then
//   translate). Keeping these in lock-step means canvas-rendered geometry and the
//   exported SVG cannot drift.
//
//   Center/world-pivot rotation (the node-level intent — "rotate about the bbox
//   center") is layered ON TOP of this primitive by `transformBBox` and
//   `inversePoint`, which take an explicit pivot. With pivot = origin they reduce
//   to the origin primitive, so the round-trip identity holds.

const DEG = Math.PI / 180;

function rot(px, py, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: px * c - py * s, y: px * s + py * c };
}

/**
 * Origin-based forward transform: scale → rotate → translate, about (0,0).
 * Matches `transformToSVG`'s `translate() rotate() scale()` application order.
 */
export function applyTransform(point, transform) {
  const { x = 0, y = 0, rotation = 0, scale = 1 } = transform || {};
  const sx = point.x * scale;
  const sy = point.y * scale;
  const r = rot(sx, sy, rotation * DEG);
  return { x: r.x + x, y: r.y + y };
}

/**
 * Pivot-aware forward transform: scale & rotate ABOUT `pivot`, then translate by
 * {x,y}. With pivot = {0,0} this equals `applyTransform`.
 */
export function applyTransformAbout(point, transform, pivot = { x: 0, y: 0 }) {
  const { x = 0, y = 0, rotation = 0, scale = 1 } = transform || {};
  const dx = (point.x - pivot.x) * scale;
  const dy = (point.y - pivot.y) * scale;
  const r = rot(dx, dy, rotation * DEG);
  return { x: r.x + pivot.x + x, y: r.y + pivot.y + y };
}

/**
 * Inverse of `applyTransformAbout`: maps a WORLD point back into node-local
 * space (used to hit-test rotated nodes). `pivot` must match the pivot used for
 * the forward transform (origin for the primitive, bbox center for node-level).
 */
export function inversePoint(point, transform, pivot = { x: 0, y: 0 }) {
  const { x = 0, y = 0, rotation = 0, scale = 1 } = transform || {};
  // Undo translate, then undo pivot offset, then undo rotation, then undo scale.
  const tx = point.x - x - pivot.x;
  const ty = point.y - y - pivot.y;
  const r = rot(tx, ty, -rotation * DEG);
  const s = scale === 0 ? 0 : 1 / scale;
  return { x: r.x * s + pivot.x, y: r.y * s + pivot.y };
}

// Round to a stable number of decimals so emitted strings / AABBs don't chase
// floating-point noise (e.g. 90.00000001). 4 decimals is sub-micron at px scale.
function num(n) {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Identity-safe SVG transform attribute VALUE.
 *
 * Returns '' (empty) for the identity transform {x:0,y:0,rotation:0,scale:1} so
 * callers can skip the wrapping `<g>` entirely (export byte-identity). Otherwise
 * returns the components that differ from identity in the order
 *   translate(x y) rotate(deg) scale(s)
 * which SVG applies right-to-left, matching `applyTransform`.
 */
export function transformToSVG(transform, pivot) {
  const { x = 0, y = 0, rotation = 0, scale = 1 } = transform || {};
  const hasRot = num(rotation) !== 0;
  const hasScale = num(scale) !== 1;
  // Center-pivot form: only when a pivot is supplied AND there's actual
  // rotation/scale to pivot. Pure translate (no rot/scale) falls through to the
  // origin path below, where the pivot is irrelevant.
  if (pivot && (hasRot || hasScale)) {
    const parts = [];
    if (num(x) !== 0 || num(y) !== 0) parts.push(`translate(${num(x)} ${num(y)})`);
    parts.push(`translate(${num(pivot.x)} ${num(pivot.y)})`);
    if (hasRot) parts.push(`rotate(${num(rotation)})`);
    if (hasScale) parts.push(`scale(${num(scale)})`);
    parts.push(`translate(${num(-pivot.x)} ${num(-pivot.y)})`);
    return parts.join(' ');
  }
  const parts = [];
  if (num(x) !== 0 || num(y) !== 0) parts.push(`translate(${num(x)} ${num(y)})`);
  if (hasRot) parts.push(`rotate(${num(rotation)})`);
  if (hasScale) parts.push(`scale(${num(scale)})`);
  return parts.join(' ');
}

/**
 * World-space axis-aligned bounding box after applying `transform` to `bbox`,
 * rotating/scaling ABOUT THE BBOX CENTER, then translating by {x,y}.
 *
 * P1 approximation: returns the AABB of the four rotated corners (so a rotated
 * box's reported bbox is axis-aligned and slightly larger than the tight rotated
 * rectangle). This is the right, simple choice for handle layout / coarse
 * culling at P1.
 */
export function transformBBox(bbox, transform) {
  const center = { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 };
  const corners = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
    { x: bbox.x, y: bbox.y + bbox.h },
  ].map((p) => applyTransformAbout(p, transform, center));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: num(minX),
    y: num(minY),
    w: num(Math.max(...xs) - minX),
    h: num(Math.max(...ys) - minY),
  };
}
