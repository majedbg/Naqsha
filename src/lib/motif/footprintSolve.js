// The offset-footprint clearance solve — the SIBLING of `emptyCircle.js`,
// deliberately not an extension of it (decision 7b).
//
// `emptyCircle.js` is not touched by this change. §4a of the `hold` doc pinned
// `largestEmptyCircleRadius` as a *required* byte-identity property rather than
// an incidental one, and decision 7b rules that it must keep serving `'root'`
// layers literally. Since `'root'` has to run today's expressions verbatim
// regardless, absorbing the offset solve into `emptyCircle.js` would mean
// absorbing it into a module that still has to expose the un-absorbed path. So
// the offset solve lives next door.
//
// THE GEOMETRY. A glyph's reserve is no longer the anchor-centred disc `(P, R)`.
// It is the glyph's minimal enclosing circle, carried into the world:
//
//     reserve centre  P + s·u        u = Rot(θ)·fc,  fc = glyph.footprintCenter
//     reserve radius  s·fr           fr = glyph.footprintRadius
//
// Against a committed disc `(cⱼ, rⱼ)`, with `a = P − cⱼ`, "the reserve does not
// overlap the obstacle" is `|a + s·u| ≥ s·fr + rⱼ`, which squares to
//
//     A·s² + B·s + C ≥ 0     A = |fc|² − fr²
//                            B = 2(a·u − rⱼ·fr)
//                            C = |a|² − rⱼ²
//
// One quadratic per obstacle where there is one division today. Greedy,
// single-pass and closed-form all survive.
//
// ⚠️ THE UNITS OF THE ANSWER. Every function here solves for the multiplier in
// whatever variable `u` and `fr` are expressed in relative to `a`/`v`/`P`/`rⱼ`.
// Pass raw glyph-local `fc`/`fr` against world-space obstacles and the answer is
// `s = R / viewRadius`, the `placementMatrix` scale (`instancing.js:77`); divide
// `u` and `fr` by `viewRadius` before calling and the answer is `R` directly.
// The algebra is identical either way. This module does not know which
// convention the caller uses and does not convert — pick one at the call site
// (#204) and stay in it.
//
// ⚠️ NO `margin` ANYWHERE IN THIS FILE (decision 6d). What comes back is the
// UN-MARGINED tangency maximum: the exact `s` at which the reserve touches the
// obstacle, the container or the edge. `margin` is the caller's, applied by
// SCALING the answer — solve, then scale. Folding it in here (as `fr / margin`,
// say) would silently break the tangency property the overlay's captor link
// draws, so none of these functions takes a `margin` argument and none should
// ever grow one.

/**
 * Loud on a non-finite scalar. #198 established that Welzl silently swallows an
 * interior NaN, so a glyph that reaches here missing `footprintCenter` or
 * `footprintRadius` will NOT have failed upstream — and it cannot be caught
 * downstream either, because `NaN < 0` is false and `!(NaN >= 0)` is true, so
 * an undefined `fr` sails straight through the C-sign test and out of the root
 * selector as `Infinity`, i.e. "this obstacle never binds". That reads as a
 * clean placement and draws as an overlap. This is the module where it has to
 * surface, so it throws.
 * @param {unknown} value
 * @param {string} name
 */
function assertFinite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(
      `footprintSolve: \`${name}\` must be a finite number, received ${String(value)}`
    );
  }
}

/**
 * @param {unknown} p
 * @param {string} name
 */
function assertFinitePoint(p, name) {
  if (!p || typeof p !== 'object') {
    throw new TypeError(
      `footprintSolve: \`${name}\` must be a {x,y} point, received ${String(p)}`
    );
  }
  assertFinite(/** @type {{x:unknown}} */ (p).x, `${name}.x`);
  assertFinite(/** @type {{y:unknown}} */ (p).y, `${name}.y`);
}

/**
 * The smallest STRICTLY-POSITIVE root of `A·s² + B·s + C`, or `Infinity` when
 * the expression never crosses zero for `s > 0`.
 *
 * Numerically stable pair (decision 7). NOT the textbook `(−B ± √Δ)/2A`: `A` is
 * within 1% of zero for 28 of the 62 built-ins and exactly zero for 4 (§3),
 * because `root` = bbox bottom-centre sits ON the minimal enclosing circle by
 * construction — the bottom edge is one of the extreme points determining it —
 * so `|fc| ≈ fr` almost universally and `A = |fc|² − fr² ≈ 0` with it. The
 * median glyph sits 5% from degenerate. The textbook form therefore divides by
 * a near-zero for nearly half the library and by exactly zero for four glyphs.
 * The degeneracy is the TYPICAL case here, not the edge case.
 *
 * Taking the min over *positive* roots rather than asserting which root is
 * physical is deliberate and costs nothing: it means the two sign-ambiguous
 * glyphs (`slice18`, `slice91`, both at `|A|/fr² ≈ 0` where the sign is
 * floating-point noise rather than a fact about the art) can only ever produce
 * a conservative answer. A wrong answer there is an overlap; a conservative one
 * is a slightly small glyph.
 *
 * `q === 0` is reachable — iff `B === 0` and `disc === 0` — and is handled by
 * the same idiom: every outcome either drops out as `NaN` or reports "never
 * binds" as `+Infinity`. The one case it gets *optimistically* wrong is
 * `A === 0, B === 0, C < 0`, a constant negative expression. That is guarded at
 * the callers below by the `C` sign tests, not here.
 *
 * @param {number} A
 * @param {number} B
 * @param {number} C
 * @returns {number} The smallest positive root, or `Infinity`.
 */
export function smallestPositiveRoot(A, B, C) {
  const disc = B * B - 4 * A * C;
  if (!(disc >= 0)) return Infinity; // no real crossing; NaN lands here too
  const sq = Math.sqrt(disc);
  // sgn(B) with sgn(0) := +1. The point of the form is that B and the radical
  // are ADDED, never subtracted, so the catastrophic cancellation the textbook
  // form suffers when 4AC ≪ B² cannot occur.
  const q = -0.5 * (B + (B < 0 ? -sq : sq));
  // Seeded with Infinity and compared with `<`, exactly as emptyCircle.js:119-125
  // already does: `NaN < x` is false, so a NaN root can never displace a good
  // one, where Math.min would propagate it. As A → 0 the q/A root → ±Infinity
  // and drops out of the minimum on its own — no A === 0 branch, no epsilon.
  // Both would be noise-floor tests for half the library, and an epsilon would
  // be a tuned constant sitting on the determinism-critical path.
  let best = Infinity;
  const r1 = q / A;
  const r2 = C / q;
  if (r1 > 0 && r1 < best) best = r1;
  if (r2 > 0 && r2 < best) best = r2;
  return best;
}

/**
 * Max multiplier before the reserve touches the committed obstacle `(cⱼ, rⱼ)`.
 *
 * @param {{x:number,y:number}} a  `P − cⱼ`, the placement centre relative to the obstacle.
 * @param {{x:number,y:number}} u  `Rot(θ)·fc` — the footprint offset, turned into world orientation.
 * @param {number} fr  the glyph's footprint radius.
 * @param {number} rj  the obstacle's radius.
 * @returns {number} the tangency maximum; `Infinity` when this obstacle never
 *   binds; `-1` when the placement centre is already INSIDE the obstacle disc,
 *   which the caller must treat as a rejection before trusting any root — this
 *   is today's `R <= 0 → no-fit` (`placementEngine.js:558-561`) under the new
 *   law, and it is also the `A === 0, B === 0, C < 0` case the root selector
 *   would otherwise get optimistically wrong.
 */
export function neighbourLimit(a, u, fr, rj) {
  assertFinitePoint(a, 'a');
  assertFinitePoint(u, 'u');
  assertFinite(fr, 'fr');
  assertFinite(rj, 'rj');
  const A = u.x * u.x + u.y * u.y - fr * fr; // |fc|² − fr² (|u| = |fc|; Rot preserves length)
  const B = 2 * (a.x * u.x + a.y * u.y - rj * fr);
  const C = a.x * a.x + a.y * a.y - rj * rj;
  if (C < 0) return -1; // centre INSIDE the disc ⇒ caller rejects
  return smallestPositiveRoot(A, B, C);
}

/**
 * Max multiplier before the reserve leaves a container of radius `H` centred
 * `v` back from the placement centre.
 *
 * This is the SAME quadratic as `neighbourLimit` with `rⱼ → −H` and the
 * inequality reversed — `≥ 0` for "stay off the obstacle", `≤ 0` for "stay
 * inside the container". That is why one root selector serves both, and why
 * decision 5's "a second quadratic" is not a second piece of algebra.
 *
 * @param {{x:number,y:number}} v  `P − anchor`, the same displacement `d = |v|` is today.
 * @param {{x:number,y:number}} u  `Rot(θ)·fc`.
 * @param {number} fr  the glyph's footprint radius.
 * @param {number} H  the container radius (`anchor.hostRadius`).
 * @returns {number} the tangency maximum; `Infinity` when the container never
 *   binds; `-1` when the centre already lies OUTSIDE the container — decision
 *   5c's restatement of the existing `hostCap <= 0 → reject 'no-fit'` guard
 *   (`placementEngine.js:605-614`).
 */
export function hostLimit(v, u, fr, H) {
  assertFinitePoint(v, 'v');
  assertFinitePoint(u, 'u');
  assertFinite(fr, 'fr');
  assertFinite(H, 'H');
  const A = u.x * u.x + u.y * u.y - fr * fr; // the SAME A
  const B = 2 * (v.x * u.x + v.y * u.y + H * fr);
  const C = v.x * v.x + v.y * v.y - H * H;
  if (C > 0) return -1; // centre already OUTSIDE ⇒ caller rejects
  return smallestPositiveRoot(A, B, C);
}

/**
 * Rect boundary. LINEAR in the multiplier per edge, not quadratic: the
 * reserve's extreme point along a rect edge normal moves at a constant rate, so
 * each of the four constraints is a single division and there is no root
 * selection to do.
 *
 *   left   `P.x + s·u.x − s·fr ≥ 0`        ⇒ `s ≤ P.x / (fr − u.x)`        when `fr > u.x`
 *   right  `(W − P.x) − s·u.x − s·fr ≥ 0`  ⇒ `s ≤ (W − P.x) / (fr + u.x)`  when `fr > −u.x`
 *   …and the same pair on `y` against `height`.
 *
 * Min over the four, `Infinity`-seeded and accumulated with `<` rather than
 * `Math.min`, the same idiom as `emptyCircle.js:119-125`. An edge whose
 * denominator is not strictly positive never binds and contributes nothing.
 *
 * A NEGATIVE result is legal and is not filtered: it is how "the anchor is
 * already outside the region" reaches the caller's `R <= 0 → no-fit` guard,
 * exactly as `signedBoundaryDistance` returns a negative distance today.
 * Strictness belongs to `smallestPositiveRoot`, which solves a different
 * question.
 *
 * @param {{x:number,y:number}} P  the placement centre in region coordinates.
 * @param {{x:number,y:number}} u  `Rot(θ)·fc`.
 * @param {number} fr  the glyph's footprint radius.
 * @param {null|undefined|{type:'rect',width:number,height:number}} rect
 * @returns {number} the tangency maximum, or `Infinity` for a null boundary —
 *   exactly as `signedBoundaryDistance` does (`emptyCircle.js:67-68`).
 */
export function boundaryLimit(P, u, fr, rect) {
  if (rect == null) return Infinity;
  if (rect.type !== 'rect') {
    // Deliberately loud rather than a silent `Infinity`. `signedBoundaryDistance`
    // also serves `{type:'polygon'}`, and nothing in production emits one today
    // (the union lives in the JSDoc, not in a producer) — but a polygon quietly
    // reported as "never binds" is an unbounded proportional layout, which is
    // the failure this module exists to stop being silent about.
    throw new TypeError(
      `footprintSolve: boundaryLimit supports rect boundaries only, received type "${String(rect.type)}"`
    );
  }
  assertFinitePoint(P, 'P');
  assertFinitePoint(u, 'u');
  assertFinite(fr, 'fr');
  assertFinite(rect.width, 'rect.width');
  assertFinite(rect.height, 'rect.height');

  let best = Infinity;

  const dLeft = fr - u.x;
  if (dLeft > 0) {
    const cap = P.x / dLeft;
    if (cap < best) best = cap;
  }
  const dRight = fr + u.x;
  if (dRight > 0) {
    const cap = (rect.width - P.x) / dRight;
    if (cap < best) best = cap;
  }
  const dTop = fr - u.y;
  if (dTop > 0) {
    const cap = P.y / dTop;
    if (cap < best) best = cap;
  }
  const dBottom = fr + u.y;
  if (dBottom > 0) {
    const cap = (rect.height - P.y) / dBottom;
    if (cap < best) best = cap;
  }

  return best;
}
