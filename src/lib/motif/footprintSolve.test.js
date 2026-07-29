// The offset clearance solve (§3, §5d, decisions 5, 7, 7b).
//
// The load-bearing test here is not the three unit cases at the top — it is the
// NUMERIC PROPERTY TEST over all 62 real glyph records at the bottom (§6).
// Decision 7 says in as many words that the acceptance test for the stable root
// pair is numeric, not a proof, and §3 explains why: `A = |fc|² − fr²` is within
// 1% of zero for 28 of 62 built-ins and exactly zero for 4, because `root` =
// bbox bottom-centre sits ON the minimal enclosing circle by construction. A
// suite that only exercises a well-conditioned `A` is testing the wrong library.
//
// Every property assertion is cross-checked against an INDEPENDENT reference
// solve — a log-spaced bracket scan for the first sign change, refined by
// bisection. If a closed form and a bisection disagree, the closed form is
// wrong.
import { describe, it, expect } from 'vitest';
import {
  smallestPositiveRoot,
  neighbourLimit,
  hostLimit,
  boundaryLimit,
} from './footprintSolve.js';
import { MOTIF_GLYPHS } from './glyphs.js';
import { VECTOR_MOTIF_GLYPHS } from './vectorMotifsGlyphs.js';

const ALL_GLYPHS = { ...MOTIF_GLYPHS, ...VECTOR_MOTIF_GLYPHS };

// ---------------------------------------------------------------------------
// The reference solve. Deliberately shares NO algebra with the module: it never
// forms a discriminant, never divides by `A`. It only evaluates the quadratic.
// ---------------------------------------------------------------------------

const evalQ = (A, B, C, s) => (A * s + B) * s + C;

// The widest `s` the reference is willing to look over. `s = R/viewRadius`, so
// a placement at 1e6 view-radii is far past any scene; beyond this, "there is a
// root" and "there is no root" are the same statement about the artwork. This
// bound is what makes criterion 5 assertable: for the sign-flipped degenerate
// glyphs the true root sits near |B/A| ~ 1e16, i.e. nowhere.
const S_MAX = 1e6;
const S_MIN = 1e-9;
const PER_DECADE = 120;

/**
 * First `s` in (0, S_MAX] at which `sense·(A·s² + B·s + C)` goes strictly
 * negative — i.e. the first point the constraint is violated. `sense` is +1 for
 * the obstacle form (stay off: expression must stay ≥ 0) and −1 for the
 * container form (stay inside: expression must stay ≤ 0).
 *
 * Log-spaced bracket scan, then 200 bisection halvings — enough to drive the
 * bracket to the double's own resolution at any magnitude in range.
 * Returns Infinity when the scan finds no violation anywhere in (0, S_MAX].
 */
function referenceFirstViolation(A, B, C, sense = 1) {
  const decades = Math.log10(S_MAX / S_MIN);
  const n = Math.ceil(decades * PER_DECADE);
  let lo = 0;
  let hi = null;
  for (let i = 0; i <= n; i++) {
    const s = S_MIN * 10 ** ((i / n) * decades);
    if (sense * evalQ(A, B, C, s) < 0) {
      hi = s;
      break;
    }
    lo = s;
  }
  if (hi === null) return Infinity;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (mid <= lo || mid >= hi) break;
    if (sense * evalQ(A, B, C, mid) < 0) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

/** Scale-normalised residual. An absolute tolerance is meaningless across 62
 *  glyphs whose coefficients span many orders of magnitude. */
function residual(A, B, C, s) {
  const scale = Math.abs(A) * s * s + Math.abs(B) * s + Math.abs(C);
  if (!(scale > 0)) return 0;
  return Math.abs(evalQ(A, B, C, s)) / scale;
}

/** Does the expression stay feasible strictly before `s`? "No positive root
 *  missed", asserted without needing the reference to match precision. */
function violatedBefore(A, B, C, s, sense = 1) {
  const cap = Math.min(s, S_MAX);
  const decades = Math.log10(cap / S_MIN);
  if (!(decades > 0)) return false;
  const n = Math.ceil(decades * PER_DECADE);
  for (let i = 0; i < n; i++) {
    // Stop short of `s` itself: the root is where the sign changes, so samples
    // arbitrarily close to it are legitimately on the far side.
    const t = S_MIN * 10 ** ((i / n) * decades);
    if (t >= cap * (1 - 1e-9)) break;
    if (sense * evalQ(A, B, C, t) < 0) return true;
  }
  return false;
}

const rot = (fc, deg) => {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: c * fc.x - s * fc.y, y: s * fc.x + c * fc.y };
};

// ---------------------------------------------------------------------------
// The three TDD cases from the ticket.
// ---------------------------------------------------------------------------

describe('smallestPositiveRoot — the stable pair', () => {
  it('solves the exactly-degenerate A === 0 case the textbook form cannot', () => {
    // −2s + 1 = 0 ⇒ s = 0.5. This is the whole point of the module: 4 of 62
    // glyphs land here exactly, and 28 land within 1% of it.
    const r = smallestPositiveRoot(0, -2, 1);
    expect(r).toBe(0.5);
    expect(Number.isFinite(r)).toBe(true);

    // The textbook form, for comparison. Both of its roots are unusable.
    const disc = (-2) * (-2) - 4 * 0 * 1;
    const sq = Math.sqrt(disc);
    expect(Number.isFinite((2 + sq) / (2 * 0))).toBe(false);
    expect(Number.isFinite((2 - sq) / (2 * 0))).toBe(false);
  });

  it('reports Infinity when both roots are negative', () => {
    expect(smallestPositiveRoot(1, 5, 6)).toBe(Infinity);
  });

  it('reports Infinity when the expression never crosses zero', () => {
    expect(smallestPositiveRoot(1, 0, 1)).toBe(Infinity); // disc < 0
    expect(smallestPositiveRoot(0, 0, 1)).toBe(Infinity); // constant, positive
  });

  it('takes the SMALLEST of two positive roots', () => {
    // (s − 2)(s − 3) = s² − 5s + 6
    expect(smallestPositiveRoot(1, -5, 6)).toBeCloseTo(2, 12);
  });

  it('takes the positive root when the pair straddles zero', () => {
    // (s − 3)(s + 1) = s² − 2s − 3
    expect(smallestPositiveRoot(1, -2, -3)).toBeCloseTo(3, 12);
  });

  it('never returns a NaN and never returns a non-positive number', () => {
    const cases = [
      [0, 0, 0], [0, 0, -1], [0, 1, 0], [1, 0, 0], [1, 2, 1], [-1, 0, 1],
      [NaN, 1, 1], [1, NaN, 1], [1, 1, NaN], [0, -2, 0],
    ];
    for (const [A, B, C] of cases) {
      const r = smallestPositiveRoot(A, B, C);
      expect(Number.isNaN(r)).toBe(false);
      expect(r > 0).toBe(true);
    }
  });

  it('adds B and the radical rather than subtracting them', () => {
    // 4AC ≪ B² is where the textbook form loses the small root to
    // cancellation. Here the small root is 1e-8 and the textbook numerator
    // −B + √Δ is a difference of two numbers agreeing to ~16 digits.
    const A = 1;
    const B = -1e8;
    const C = 1;
    const stable = smallestPositiveRoot(A, B, C);
    expect(stable).toBeGreaterThan(0);
    expect(residual(A, B, C, stable)).toBeLessThan(1e-14);
  });
});

describe('neighbourLimit', () => {
  it('returns -1 when the placement centre is inside the obstacle disc', () => {
    // C = |a|² − rj² = 4 − 25 < 0: today's `R <= 0 → no-fit` under the new law.
    expect(neighbourLimit({ x: 2, y: 0 }, { x: 1, y: 0 }, 1, 5)).toBe(-1);
  });

  it('reduces to the anchor-centred distance when fc = 0 and the glyph is a disc', () => {
    // u = 0, fr = 1: reserve is (P, s). |a| = 10, rj = 2 ⇒ s = 8.
    const r = neighbourLimit({ x: 10, y: 0 }, { x: 0, y: 0 }, 1, 2);
    expect(r).toBeCloseTo(8, 9);
  });

  it('reports Infinity when the reserve grows away from the obstacle forever', () => {
    // fr = 0 (a point reserve) travelling straight away from the obstacle.
    expect(neighbourLimit({ x: 10, y: 0 }, { x: 1, y: 0 }, 0, 2)).toBe(Infinity);
  });

  it('throws on a non-finite input rather than silently returning Infinity', () => {
    // #198: Welzl swallows interior NaN, so a glyph missing `footprintRadius`
    // does NOT fail upstream. `NaN < 0` is false and `!(NaN >= 0)` is true, so
    // without this guard `undefined` would sail through the C-sign test and out
    // of the root selector as Infinity — "this obstacle never binds" — which is
    // an overlap, silently.
    expect(() => neighbourLimit({ x: 1, y: 0 }, { x: 0, y: 0 }, undefined, 1)).toThrow(
      /footprintSolve/
    );
    expect(() => neighbourLimit({ x: 1, y: 0 }, { x: NaN, y: 0 }, 1, 1)).toThrow(
      /footprintSolve/
    );
    expect(() => neighbourLimit({ x: 1, y: 0 }, undefined, 1, 1)).toThrow(/footprintSolve/);
  });
});

describe('hostLimit', () => {
  it('returns -1 when the centre already lies outside the container', () => {
    // C = |v|² − H² = 100 − 25 > 0.
    expect(hostLimit({ x: 10, y: 0 }, { x: 0, y: 0 }, 1, 5)).toBe(-1);
  });

  it('is the same quadratic as neighbourLimit with rj → −H', () => {
    // Coefficient-for-coefficient, which is decision 5's "second quadratic"
    // being one piece of algebra rather than two. Only the C-sign guard differs
    // — `≥ 0` for "stay off the obstacle" against `≤ 0` for "stay inside the
    // container" — so the two functions cannot be compared through their
    // return values except at C === 0, and the identity is asserted here on
    // the coefficients they hand the shared root selector.
    const v = { x: 1, y: 2 };
    const u = { x: 0.3, y: -0.7 };
    const fr = 1.1;
    const H = 9;
    const rj = -H;
    const A = u.x * u.x + u.y * u.y - fr * fr;
    expect(2 * (v.x * u.x + v.y * u.y + H * fr)).toBe(2 * (v.x * u.x + v.y * u.y - rj * fr));
    expect(v.x * v.x + v.y * v.y - H * H).toBe(v.x * v.x + v.y * v.y - rj * rj);
    const B = 2 * (v.x * u.x + v.y * u.y + H * fr);
    const C = v.x * v.x + v.y * v.y - H * H;
    expect(hostLimit(v, u, fr, H)).toBe(smallestPositiveRoot(A, B, C));
  });

  it('lets an anchor-centred disc grow to the container radius', () => {
    // v = 0, u = 0, fr = 1, H = 7 ⇒ s = 7.
    expect(hostLimit({ x: 0, y: 0 }, { x: 0, y: 0 }, 1, 7)).toBeCloseTo(7, 9);
  });

  it('throws on a non-finite input', () => {
    expect(() => hostLimit({ x: 0, y: 0 }, { x: 0, y: 0 }, NaN, 7)).toThrow(/footprintSolve/);
  });
});

describe('boundaryLimit', () => {
  const rect = { type: 'rect', width: 100, height: 80 };

  it('returns Infinity for a null boundary, exactly as signedBoundaryDistance does', () => {
    expect(boundaryLimit({ x: 5, y: 5 }, { x: 0, y: 0 }, 1, null)).toBe(Infinity);
    expect(boundaryLimit({ x: 5, y: 5 }, { x: 0, y: 0 }, 1, undefined)).toBe(Infinity);
  });

  it('reduces to the anchor-centred signed distance when fc = 0 and fr = 1', () => {
    // Reserve (P, s): the four caps are 20, 80, 30, 50 ⇒ 20.
    expect(boundaryLimit({ x: 20, y: 30 }, { x: 0, y: 0 }, 1, rect)).toBeCloseTo(20, 9);
  });

  it('is linear per edge and takes the min over the four', () => {
    // u = (+4, 0), fr = 5. left: 20/(5−4) = 20. right: 80/(5+4) = 8.888…
    // top: 30/5 = 6. bottom: 50/5 = 10. ⇒ 6.
    const r = boundaryLimit({ x: 20, y: 30 }, { x: 4, y: 0 }, 5, rect);
    expect(r).toBeCloseTo(6, 9);
  });

  it('lets a centre outside the rect return a negative cap for the caller to reject', () => {
    // Strictness belongs to smallestPositiveRoot, not here: a negative cap is
    // how "already outside" reaches today's `R <= 0 → no-fit`.
    expect(boundaryLimit({ x: -10, y: 30 }, { x: 0, y: 0 }, 1, rect)).toBeLessThan(0);
  });

  it('is Infinity-seeded — a reserve that never touches an edge never binds', () => {
    // fr = 0 and u = 0: a point reserve pinned at P. No edge moves toward it.
    expect(boundaryLimit({ x: 20, y: 30 }, { x: 0, y: 0 }, 0, rect)).toBe(Infinity);
  });

  it('leaves an edge unbound when the reserve retreats from it faster than it grows', () => {
    // u = (−9, 0), fr = 5: the right edge is never reached (fr + u.x < 0), but
    // the left edge is, at 20/(5+9).
    const r = boundaryLimit({ x: 20, y: 40 }, { x: -9, y: 0 }, 5, rect);
    expect(r).toBeCloseTo(20 / 14, 9);
  });

  it('throws on a non-finite input and on an unsupported boundary shape', () => {
    expect(() => boundaryLimit({ x: 1, y: 1 }, { x: 0, y: 0 }, NaN, rect)).toThrow(
      /footprintSolve/
    );
    expect(() =>
      boundaryLimit({ x: 1, y: 1 }, { x: 0, y: 0 }, 1, { type: 'polygon', points: [] })
    ).toThrow(/footprintSolve/);
  });

});

describe('decision 6d — the module solves, the caller scales', () => {
  it('gives no function here a margin argument', () => {
    // This module returns the UN-MARGINED tangency maximum. `margin` is the
    // caller's, applied by scaling the answer — solve, then scale. Folding it
    // in here (as `fr / margin`, the wrong version §5e writes out beside the
    // right one) would silently break the tangency property the overlay's
    // captor link draws. Arity is the cheapest enforcement there is.
    expect(smallestPositiveRoot).toHaveLength(3);
    expect(neighbourLimit).toHaveLength(4);
    expect(hostLimit).toHaveLength(4);
    expect(boundaryLimit).toHaveLength(4);
  });

  it('returns a pure ratio — all three coefficients are degree 2 in length', () => {
    // A, B and C all scale as λ², so scaling every length in the problem by λ
    // leaves the answer alone: what comes back is a multiplier, not a length.
    // That is what lets the caller apply `margin` by multiplying the result,
    // and it is the first thing a stray `margin` folded into `fr` would break.
    const u = { x: 3, y: -1 };
    const fr = 4;
    const base = neighbourLimit({ x: 30, y: 12 }, u, fr, 5);
    const lambda = 7;
    const scaled = neighbourLimit(
      { x: 30 * lambda, y: 12 * lambda },
      { x: u.x * lambda, y: u.y * lambda },
      fr * lambda,
      5 * lambda
    );
    expect(scaled).toBeCloseTo(base, 12);
  });
});

// ---------------------------------------------------------------------------
// §6's numeric property test — the load-bearing one.
// ---------------------------------------------------------------------------

/** Every (glyph, rotation, obstacle) case the property test sweeps. */
function* cases() {
  for (const [id, g] of Object.entries(ALL_GLYPHS)) {
    const fc = g.footprintCenter;
    const fr = g.footprintRadius;
    for (const deg of [0, 37, 113, 251]) {
      const u = rot(fc, deg);
      for (const k of [0.5, 1.5, 3, 7]) {
        for (const phi of [0, 90, 200]) {
          const t = (phi * Math.PI) / 180;
          const a = { x: k * fr * Math.cos(t), y: k * fr * Math.sin(t) };
          for (const m of [0.2, 0.8]) {
            yield { id, fr, u, a, rj: m * fr, deg, k, phi };
          }
        }
      }
    }
  }
}

const coeffs = (a, u, fr, rj) => ({
  A: u.x * u.x + u.y * u.y - fr * fr,
  B: 2 * (a.x * u.x + a.y * u.y - rj * fr),
  C: a.x * a.x + a.y * a.y - rj * rj,
});

describe('§6 — the numeric property test over all 62 real glyph records', () => {
  it('sweeps every built-in glyph, not synthetic triples', () => {
    expect(Object.keys(ALL_GLYPHS)).toHaveLength(62);
    const ids = new Set([...cases()].map((c) => c.id));
    expect(ids.size).toBe(62);
  });

  it('agrees with a brute-force bisection reference on every case', () => {
    let worstRel = 0;
    let worstResidual = 0;
    let worstCase = null;
    let finiteCount = 0;
    let infiniteCount = 0;
    let rejectCount = 0;

    for (const c of cases()) {
      const { A, B, C } = coeffs(c.a, c.u, c.fr, c.rj);
      const got = neighbourLimit(c.a, c.u, c.fr, c.rj);

      if (C < 0) {
        // 2. Infeasible at s → 0⁺. The caller rejects; the root is not trusted.
        expect(got).toBe(-1);
        rejectCount++;
        continue;
      }

      const ref = referenceFirstViolation(A, B, C, 1);

      // 3. Never NaN, never ≤ 0.
      expect(Number.isNaN(got)).toBe(false);
      expect(got > 0).toBe(true);

      if (Number.isFinite(ref)) {
        // 1. No positive root missed.
        finiteCount++;
        expect(Number.isFinite(got)).toBe(true);
        const rel = Math.abs(got - ref) / ref;
        if (rel > worstRel) {
          worstRel = rel;
          worstCase = c;
        }
        const res = residual(A, B, C, got);
        if (res > worstResidual) worstResidual = res;
      } else {
        infiniteCount++;
        // The reference found no violation anywhere in (0, S_MAX]. The closed
        // form must agree that nothing binds within the scene — either
        // literally Infinity, or a root so far out it is not a placement.
        expect(got > S_MAX || got === Infinity).toBe(true);
      }

      // 1 again, stated directly: the returned value is the SMALLEST such s.
      expect(violatedBefore(A, B, C, got, 1)).toBe(false);
    }

    // The census, pinned EXACTLY rather than bounded. A `> 100` floor would let
    // the sweep collapse to a fraction of itself while still passing, and the
    // commit message that quotes these numbers would go quietly stale — the
    // failure §6 legislates against when it asks for the measurement to be
    // re-run rather than the document trusted. Same discipline as
    // `glyphFootprint.test.js`'s `toHaveLength(28)`. If the glyph library moves,
    // this line is what says so.
    expect(rejectCount).toBe(744);
    expect(finiteCount).toBe(4635);
    expect(infiniteCount).toBe(573);
    expect(rejectCount + finiteCount + infiniteCount).toBe(62 * 4 * 4 * 3 * 2);

    // THE STATED TOLERANCE. Measured worst case over the 4635 cases with a
    // finite reference root is 4.3e-16 relative (at `slice33`), and the worst
    // scale-normalised residual is 2.7e-16 — i.e. the stable pair agrees with
    // an independent bisection to the double's own resolution. The threshold is
    // set four orders above that, tight enough to be load-bearing and loose
    // enough to survive a different platform's `Math.sqrt` rounding. It is NOT
    // a vacuous bound: substituting the textbook `(−B ± √Δ)/2A` into the module
    // and re-running this sweep breaks 193 of the 4635 cases, several to
    // Infinity.
    const detail = worstCase
      ? `${worstCase.id} θ=${worstCase.deg} k=${worstCase.k} φ=${worstCase.phi}`
      : 'none';
    expect(
      worstRel,
      `worst relative disagreement ${worstRel.toExponential(3)} at ${detail}`
    ).toBeLessThan(1e-12);
    expect(worstResidual).toBeLessThan(1e-12);
  });

  it('agrees with the reference on the container form too', () => {
    let worstRel = 0;
    let solved = 0;
    for (const c of cases()) {
      // Container radius large enough that the centre is inside for most cases.
      for (const H of [c.fr * 2, c.fr * 6]) {
        const v = c.a;
        const A = c.u.x * c.u.x + c.u.y * c.u.y - c.fr * c.fr;
        const B = 2 * (v.x * c.u.x + v.y * c.u.y + H * c.fr);
        const C = v.x * v.x + v.y * v.y - H * H;
        const got = hostLimit(v, c.u, c.fr, H);
        if (C > 0) {
          expect(got).toBe(-1);
          continue;
        }
        expect(Number.isNaN(got)).toBe(false);
        expect(got > 0).toBe(true);
        const ref = referenceFirstViolation(A, B, C, -1);
        if (Number.isFinite(ref)) {
          solved++;
          expect(Number.isFinite(got)).toBe(true);
          worstRel = Math.max(worstRel, Math.abs(got - ref) / ref);
        } else {
          expect(got > S_MAX || got === Infinity).toBe(true);
        }
        expect(violatedBefore(A, B, C, got, -1)).toBe(false);
      }
    }
    expect(solved).toBeGreaterThan(1000);
    expect(worstRel, `worst relative disagreement ${worstRel.toExponential(3)}`).toBeLessThan(
      1e-12
    );
  });

  it('never leaks a NaN or an Infinity into a radius once a min consumes it', () => {
    // `Infinity` is a legal INTERMEDIATE — it is how "this side does not
    // constrain" is spelled (emptyCircle.js:125, `capOf`). What must never
    // happen is that it survives the reduction. Stand in for the caller's
    // `Math.min(naturalTarget, …)` and assert the result is always finite.
    const naturalTarget = 4.2;
    const rect = { type: 'rect', width: 500, height: 400 };
    for (const c of cases()) {
      const nb = neighbourLimit(c.a, c.u, c.fr, c.rj);
      const bd = boundaryLimit({ x: 120, y: 90 }, c.u, c.fr, rect);
      const hs = hostLimit({ x: 0, y: 0 }, c.u, c.fr, c.fr * 3);
      for (const term of [nb, bd, hs]) {
        expect(Number.isNaN(term)).toBe(false);
        expect(Number.isFinite(Math.min(naturalTarget, term))).toBe(true);
      }
    }
  });
});

describe("§6.4 — the degenerate glyphs, by name", () => {
  const DEGENERATE = ['leaf', 'slice17', 'slice91', 'slice95'];

  it('confirms the 4 named glyphs sit at |A|/fr² < 1e-9 and the 28 within 1%', () => {
    // The contract §3 states, re-read off the shipped records so the test says
    // so rather than the document going quietly stale.
    const table = Object.entries(ALL_GLYPHS).map(([id, g]) => {
      const { x, y } = g.footprintCenter;
      return { id, A: (x * x + y * y - g.footprintRadius ** 2) / g.footprintRadius ** 2 };
    });
    expect(table.filter((r) => Math.abs(r.A) < 1e-9).map((r) => r.id).sort()).toEqual(
      DEGENERATE
    );
    expect(table.filter((r) => Math.abs(r.A) < 0.01)).toHaveLength(28);
  });

  it.each(DEGENERATE)('%s solves where the textbook form divides by ~zero', (id) => {
    const g = ALL_GLYPHS[id];
    const fr = g.footprintRadius;
    const u = g.footprintCenter; // θ = 0: A is exactly 0 for three of the four
    const A = u.x * u.x + u.y * u.y - fr * fr;
    expect(Math.abs(A) / (fr * fr)).toBeLessThan(1e-9);

    // A concrete obstacle, clear of the anchor (so C > 0) and placed on the
    // side the footprint travels toward (so a root exists at all — with the
    // obstacle behind the offset the reserve simply grows away from it forever,
    // which is a correct Infinity and not a test of the root selector).
    const n = Math.hypot(u.x, u.y);
    const uh = n > 0 ? { x: u.x / n, y: u.y / n } : { x: 1, y: 0 };
    const a = { x: -2.5 * fr * uh.x, y: -2.5 * fr * uh.y };
    const rj = 0.4 * fr;
    const B = 2 * (a.x * u.x + a.y * u.y - rj * fr);
    const C = a.x * a.x + a.y * a.y - rj * rj;

    const got = neighbourLimit(a, u, fr, rj);
    expect(Number.isFinite(got)).toBe(true);
    expect(got).toBeGreaterThan(0);

    const ref = referenceFirstViolation(A, B, C, 1);
    expect(Number.isFinite(ref)).toBe(true);
    expect(Math.abs(got - ref) / ref).toBeLessThan(1e-9);
    expect(residual(A, B, C, got)).toBeLessThan(1e-12);

    // And the textbook form, on the same coefficients, does not survive it.
    // For the three glyphs where A is exactly 0 it returns Infinity and NaN;
    // for `slice91`, where A is 1.8e-12 rather than 0, both roots are finite
    // and both are wrong — 8.5e15 and 1.0 against a true root of 1.05, the
    // second being `−2AC/B` recovered from a difference of two numbers agreeing
    // to fifteen digits. So the claim is not "it throws", it is "it does not
    // answer the question": no textbook root lands within 0.1% of the truth.
    const disc = B * B - 4 * A * C;
    const textbook = [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)];
    for (const r of textbook) {
      expect(!Number.isFinite(r) || Math.abs(r - ref) / ref > 1e-3).toBe(true);
    }
  });

  it('handles the degenerate glyphs under rotation, where A becomes float noise', () => {
    // Rot(θ)·fc preserves |fc| algebraically but not bit-for-bit, so A stops
    // being exactly 0 and becomes ~1e-16·fr² of either sign. No branch in the
    // module notices, which is decision 7's claim.
    for (const id of DEGENERATE) {
      const g = ALL_GLYPHS[id];
      const fr = g.footprintRadius;
      for (const deg of [7, 37, 90, 113, 180, 251, 300]) {
        const u = rot(g.footprintCenter, deg);
        const a = { x: 2.5 * fr, y: -1.75 * fr };
        const rj = 0.6 * fr;
        const { A, B, C } = coeffs(a, u, fr, rj);
        const got = neighbourLimit(a, u, fr, rj);
        expect(Number.isNaN(got)).toBe(false);
        expect(got > 0).toBe(true);
        const ref = referenceFirstViolation(A, B, C, 1);
        if (Number.isFinite(ref)) {
          expect(Math.abs(got - ref) / ref).toBeLessThan(1e-6);
        } else {
          expect(got > S_MAX || got === Infinity).toBe(true);
        }
        expect(violatedBefore(A, B, C, got, 1)).toBe(false);
      }
    }
  });
});

describe('§6.5 — the two sign-ambiguous glyphs can only be conservative', () => {
  const AMBIGUOUS = ['slice18', 'slice91'];

  it('confirms slice18 and slice91 are the only two with A > 0', () => {
    const positive = Object.entries(ALL_GLYPHS)
      .filter(([, g]) => {
        const { x, y } = g.footprintCenter;
        return x * x + y * y - g.footprintRadius ** 2 > 0;
      })
      .map(([id]) => id)
      .sort();
    expect(positive).toEqual(AMBIGUOUS);
  });

  it.each(AMBIGUOUS)('%s never over-sizes: the answer is a real root or nothing binds', (id) => {
    const g = ALL_GLYPHS[id];
    const fr = g.footprintRadius;
    for (const deg of [0, 37, 90, 113, 180, 251]) {
      const u = rot(g.footprintCenter, deg);
      for (const k of [1.2, 2.5, 6]) {
        const a = { x: k * fr, y: 0.3 * k * fr };
        const rj = 0.5 * fr;
        const { A, B, C } = coeffs(a, u, fr, rj);
        const got = neighbourLimit(a, u, fr, rj);
        const ref = referenceFirstViolation(A, B, C, 1);
        if (Number.isFinite(ref)) {
          // A real crossing exists: the answer must BE it, not something later.
          expect(Number.isFinite(got)).toBe(true);
          expect(got).toBeLessThanOrEqual(ref * (1 + 1e-6));
        } else {
          // No crossing within the scene. Reporting Infinity here is the same
          // statement, not an over-size: `min` with `naturalTarget` consumes it.
          //
          // This is the branch decision 7's conservatism claim actually lands
          // in, so it is asserted rather than argued. Under rotation, Rot(θ)·fc
          // preserves |fc| algebraically but not bit-for-bit, so A flips
          // positive; with A, B and C all positive both roots go negative and
          // the closed form returns Infinity. That is sound only because there
          // is genuinely nothing to hit — the true root sits near |B/A| ~ 1e16,
          // which is not a placement. The reference confirms it directly: the
          // expression is still feasible at S_MAX, so no crossing was skipped.
          expect(got > S_MAX || got === Infinity).toBe(true);
          expect(evalQ(A, B, C, S_MAX)).toBeGreaterThanOrEqual(0);
        }
        // The conservative promise, stated as the property that matters: the
        // returned cap is never LARGER than the first real violation.
        expect(violatedBefore(A, B, C, got, 1)).toBe(false);
      }
    }
  });
});
