// Per-instance motif instancing — pure, deterministic, headless (no p5/DOM/
// React). Turns a Placement (see placementEngine.js) + a glyph's viewRadius
// into an SVG-convention affine matrix, and applies/serializes it.
//
// LOCKED matrix convention: SVG matrix [a,b,c,d,e,f] maps a point (x,y) to
// (a*x + c*y + e, b*x + d*y + f). Compose order is T(px,py) · R(theta) ·
// S(sx,sy) — translate last, rotate second, scale first — with `flip`
// (x-negation) folded INTO the scale step (sx), never into rotation.
// Rotation is math/CCW-positive: R = [[cosθ,-sinθ],[sinθ,cosθ]].
//
// See docs/motif-adorn-arch-brief.md §8/§9.

/**
 * @typedef {[number,number,number,number,number,number]} Matrix
 * @typedef {{x:number,y:number,rotation:number,radius:number,flip?:boolean}} PlacementLike
 */

const DEG_TO_RAD = Math.PI / 180;

/**
 * Build the SVG-convention affine matrix that maps a glyph authored in local
 * coordinates (bounding-circle radius `viewRadius`, centered at the origin)
 * onto a concrete placement.
 *
 * @param {PlacementLike} placement
 * @param {number} viewRadius
 * @returns {Matrix}
 */
export function placementMatrix(placement, viewRadius) {
  const s = placement.radius / viewRadius;
  const sx = s * (placement.flip ? -1 : 1);
  const sy = s;
  const theta = placement.rotation * DEG_TO_RAD;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const e = placement.x;
  const f = placement.y;

  return [a, b, c, d, e, f];
}

/**
 * Apply an SVG-convention affine matrix to a point.
 * @param {{x:number,y:number}} point
 * @param {Matrix} m
 * @returns {{x:number,y:number}}
 */
export function applyMatrix(point, m) {
  const [a, b, c, d, e, f] = m;
  return {
    x: a * point.x + c * point.y + e,
    y: b * point.x + d * point.y + f,
  };
}

// Round to 6 decimal places, strip trailing zeros and a bare trailing dot,
// normalize -0 to "0", and never emit exponential notation (toFixed keeps
// plain-decimal form across the ranges instancing matrices actually see).
function formatNum(n) {
  let v = Math.round(n * 1e6) / 1e6;
  if (Object.is(v, -0)) v = 0;
  let str = v.toFixed(6);
  str = str.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  if (str === '-0') str = '0';
  return str;
}

/**
 * Serialize an SVG-convention affine matrix as an SVG `matrix(...)` string.
 * @param {Matrix} m
 * @returns {string}
 */
export function matrixToSVG(m) {
  return `matrix(${m.map(formatNum).join(' ')})`;
}
