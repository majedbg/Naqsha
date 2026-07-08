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
 * @typedef {{x:number,y:number,angle:number}} Root
 */

const DEG_TO_RAD = Math.PI / 180;

/** No-op default root: the glyph's local ORIGIN is the anchor, no growth turn. */
const DEFAULT_ROOT = { x: 0, y: 0, angle: 0 };

/**
 * SVG-convention affine product m1·m2 (m1 applied AFTER m2). Each matrix is
 * [a,b,c,d,e,f] mapping (x,y) → (a*x+c*y+e, b*x+d*y+f); this is the standard
 * 3×3 row-major multiply restricted to the affine rows.
 * @param {Matrix} m1
 * @param {Matrix} m2
 * @returns {Matrix}
 */
function composeMatrix(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/**
 * Build the SVG-convention affine matrix that maps a glyph authored in local
 * coordinates (bounding-circle radius `viewRadius`, centered at the origin)
 * onto a concrete placement.
 *
 * WI-2 — optional motif ROOT: a point `(root.x, root.y)` and growth-direction
 * `root.angle` (degrees), both in the glyph's LOCAL frame. The matrix maps the
 * root POINT onto `(placement.x, placement.y)` and aligns the local growth axis
 * (the direction at angle `root.angle`) to `placement.rotation`. Passed as a 3rd
 * arg (not read off `placement`) because a root belongs to the GLYPH's geometry,
 * not to the anchor — it must not leak into placement semantics, and built-in
 * glyphs simply omit it.
 *
 * Compose order (folds a LOCAL pre-transform into the locked T·R·S core; derived
 * and pinned by the non-zero-root tests, verified against the header convention):
 *   M = T(px,py) · R(rotation) · S(sx,sy) · R(−root.angle) · T(−root.x,−root.y)
 * The trailing `R(−angle)·T(−root)` sends the root point to the origin and
 * de-rotates the growth axis to +x BEFORE the core scale/rotate/translate; flip
 * stays folded in the core's sx exactly as before (never in the root turn).
 *
 * Default/absent root is short-circuited to the pre-root core so its output is
 * byte-identical (avoids signed-zero drift from an identity compose).
 *
 * @param {PlacementLike} placement
 * @param {number} viewRadius
 * @param {Root} [root]
 * @returns {Matrix}
 */
export function placementMatrix(placement, viewRadius, root = DEFAULT_ROOT) {
  const s = placement.radius / viewRadius;
  const sx = s * (placement.flip ? -1 : 1);
  const sy = s;
  const theta = placement.rotation * DEG_TO_RAD;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // The locked pre-root T·R·S core.
  const core = [cos * sx, sin * sx, -sin * sy, cos * sy, placement.x, placement.y];

  // No-op root ⇒ return the core verbatim (guarantees byte-identity).
  if (root.x === 0 && root.y === 0 && root.angle === 0) return core;

  // Local pre-transform P = R(−root.angle) · T(−root.x, −root.y), as one matrix.
  const phi = root.angle * DEG_TO_RAD;
  const cphi = Math.cos(phi);
  const sphi = Math.sin(phi);
  // R(−phi) = [[cosφ, sinφ], [−sinφ, cosφ]] ⇒ SVG [cosφ, −sinφ, sinφ, cosφ]; its
  // translation is R(−phi) applied to (−root.x, −root.y).
  const pre = [
    cphi,
    -sphi,
    sphi,
    cphi,
    -(root.x * cphi + root.y * sphi),
    root.x * sphi - root.y * cphi,
  ];

  return composeMatrix(core, pre);
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
