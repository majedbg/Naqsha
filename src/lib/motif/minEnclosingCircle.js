// The minimal enclosing circle (Welzl) over a flattened point set — the one
// place the definition of a glyph's "tight" footprint lives (§5a, decisions 2
// and 2b). Everything downstream of this module is derived data: the generator
// and `importMotif` call it once per glyph and store the result, so a glyph's
// footprint cannot drift out of agreement with the art it measures.
//
// Ported verbatim from `scripts/measureGlyphFootprints.mjs:17-46`, which
// produced every number in §1 and §3 of the spec doc. It is not re-derived:
// §3's degeneracy table is the contract the whole PRD's numeric argument rests
// on, so an independently-written variant that merely agrees to a tolerance
// would quietly move that table. No p5, no DOM, no React, no app imports.
//
// NOT imported by `placementEngine.js` — the packer reads a stored number and
// never re-measures.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The `c &&` guard is load-bearing: the first iteration of the outer loop tests
// against a null circle, which must read as "not contained". The 1e-9 slack
// absorbs the rounding in `circ2`/`circ3` so a point that defined the current
// circle is never judged to have escaped it.
const inCirc = (c, p) => c && dist(c, p) <= c.r + 1e-9;

const circ2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: dist(a, b) / 2 });

/**
 * Circumcircle of three points, or null when they are collinear.
 *
 * Returning null rather than dividing by a vanishing determinant is the
 * behaviour half the library depends on: much of the vector set is
 * axis-aligned rectilinear art, so collinear triples are the common case here,
 * not the exotic one. The caller keeps the previous circle, which is already
 * correct for a degenerate triple — a line's enclosing circle is the diameter
 * circle on its two extremes, and `circ2` has already found it.
 *
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {{x:number,y:number}} c
 * @returns {{x:number,y:number,r:number}|null}
 */
function circ3(a, b, c) {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y, cx = c.x, cy = c.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) };
}

/**
 * Smallest circle containing every point, by move-to-front Welzl.
 *
 * The shuffle is Knuth's multiplicative hash, `(i * 2654435761) % (i + 1)`, and
 * deliberately not `Math.random`. Welzl is expected-linear only over a
 * randomised order, but ADR-0005 makes reproducibility contractual: a random
 * shuffle would let the emitted `footprintRadius` differ between two runs of
 * the generator, i.e. make the glyph library non-reproducible. A fixed
 * permutation buys the randomised-order argument without the randomness.
 *
 * The input array is not mutated — the shuffle runs on a copy.
 *
 * @param {{x:number,y:number}[]} points
 * @returns {{x:number,y:number,r:number}|null} null for fewer than 1 point.
 */
export function minEnclosingCircle(points) {
  const p = points.slice();
  for (let i = p.length - 1; i > 0; i--) { const j = (i * 2654435761) % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  let c = null;
  for (let i = 0; i < p.length; i++) {
    if (inCirc(c, p[i])) continue;
    c = { x: p[i].x, y: p[i].y, r: 0 };
    for (let j = 0; j < i; j++) {
      if (inCirc(c, p[j])) continue;
      c = circ2(p[i], p[j]);
      for (let k = 0; k < j; k++) {
        if (inCirc(c, p[k])) continue;
        const t = circ3(p[i], p[j], p[k]);
        if (t) c = t;
      }
    }
  }
  return c;
}
