import { describe, it, expect } from 'vitest';
import { parsePathD, flattenPathD } from '../pathOps.js';
import { MOTIF_GLYPHS } from '../../motif/glyphs.js';

// ---------------------------------------------------------------------------
// flattenPathD — M/L/Z byte-identity rail (characterization anchor)
//
// The whole feature rests on this: for ANY `d` containing only M / L / Z
// commands, flattenPathD(d, tol) must return VERTICES IDENTICAL to
// parsePathD(d) — same points, same order, same `closed`. The built-in motif
// glyphs are all M/L/Z, so this guarantees zero output change when a consumer
// later swaps parsePathD → flattenPathD.
//
// (flattenPathD's CURVE output is adaptive-tol and intentionally differs from
// parsePathD's fixed-16 cubic sampling — no byte-identity is claimed there.)
// ---------------------------------------------------------------------------

// Mirror the exact M/L/Z fixtures pathOps.test.js pins for parsePathD, so any
// silent drift in the shared quirks (implicit-L-after-M, lowercase-as-absolute,
// scientific notation, negatives, malformed tokens) is caught here too.
const MLZ_FIXTURES = [
  'M0,0 L10,20 L30,40',           // simple open polyline
  'M0,0 L5,5 Z',                  // closed
  'm0,0 l10,20 z',                // lowercase (treated as absolute, house quirk)
  'M-5,-10 L-15,-20',             // negatives
  'M1e2,2e1 L3,4',                // scientific notation
  'M0,0 10,20 30,40',             // implicit-L after M (extra coord pairs)
  'M0,0 L10,0 L10,10 Z',          // closed square
  '',                             // empty
  'M5,5',                         // single moveto, no line
];

describe('flattenPathD — M/L/Z byte-identity with parsePathD', () => {
  for (const d of MLZ_FIXTURES) {
    it(`matches parsePathD for "${d}"`, () => {
      expect(flattenPathD(d, 0.25)).toEqual(parsePathD(d));
    });
  }

  it('matches parsePathD for the four built-in motif glyphs', () => {
    for (const id of ['leaf', 'dot', 'diamond', 'rosette']) {
      const { d } = MOTIF_GLYPHS[id].paths[0];
      expect(flattenPathD(d, 0.25)).toEqual(parsePathD(d));
    }
  });

  it('returns empty result for empty/null/non-string input', () => {
    expect(flattenPathD('', 0.25)).toEqual({ points: [], closed: false });
    expect(flattenPathD(null, 0.25)).toEqual({ points: [], closed: false });
    expect(flattenPathD(undefined, 0.25)).toEqual({ points: [], closed: false });
    expect(flattenPathD(42, 0.25)).toEqual({ points: [], closed: false });
  });
});

// Independent analytic evaluators used to cross-check adaptive sampling. With
// adaptive tol the vertex INDEX of B(0.5) is not fixed, so tests SEARCH for the
// nearest sampled vertex rather than indexing a constant position.
function cubicAt(p0, c1, c2, p3, u) {
  const mt = 1 - u;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * u;
  const c = 3 * mt * u * u;
  const d = u * u * u;
  return [
    a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0],
    a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1],
  ];
}
function quadAt(p0, c, p2, u) {
  const mt = 1 - u;
  const a = mt * mt;
  const b = 2 * mt * u;
  const d = u * u;
  return [a * p0[0] + b * c[0] + d * p2[0], a * p0[1] + b * c[1] + d * p2[1]];
}
function nearestDist(points, target) {
  let best = Infinity;
  for (const p of points) best = Math.min(best, Math.hypot(p[0] - target[0], p[1] - target[1]));
  return best;
}

// ---------------------------------------------------------------------------
// flattenPathD — cubic C (adaptive de Casteljau)
// ---------------------------------------------------------------------------
describe('flattenPathD — cubic C', () => {
  it('pins the M anchor and the curve endpoint exactly', () => {
    const { points, closed } = flattenPathD('M3.5,7.25 C10,20 -5,40 42.5,-13.75', 0.25);
    expect(points[0]).toEqual([3.5, 7.25]);
    expect(points[points.length - 1]).toEqual([42.5, -13.75]);
    expect(closed).toBe(false);
  });

  it('samples a vertex near the analytic B(0.5)', () => {
    // Analytic B(0.5) for M0,0 C0,100 100,100 100,0 is (50, 75).
    const tol = 0.25;
    const { points } = flattenPathD('M0,0 C0,100 100,100 100,0', tol);
    const mid = cubicAt([0, 0], [0, 100], [100, 100], [100, 0], 0.5);
    expect(mid).toEqual([50, 75]);
    expect(nearestDist(points, mid)).toBeLessThan(tol);
  });

  it('keeps every sample within tol of a colinear cubic (all on y=0)', () => {
    const { points } = flattenPathD('M0,0 C10,0 20,0 30,0', 0.25);
    for (const [, y] of points) expect(Math.abs(y)).toBeLessThan(0.25);
  });

  it('never emits the control points as vertices', () => {
    const { points } = flattenPathD('M0,0 C10,0 20,0 30,0', 0.25);
    expect(points.some((p) => p[0] === 10 && p[1] === 0)).toBe(false);
    expect(points.some((p) => p[0] === 20 && p[1] === 0)).toBe(false);
  });

  it('grows the vertex count monotonically as tol shrinks', () => {
    const d = 'M0,0 C0,100 100,100 100,0';
    const coarse = flattenPathD(d, 4).points.length;
    const mid = flattenPathD(d, 0.5).points.length;
    const fine = flattenPathD(d, 0.05).points.length;
    expect(mid).toBeGreaterThanOrEqual(coarse);
    expect(fine).toBeGreaterThanOrEqual(mid);
    expect(fine).toBeGreaterThan(coarse); // genuinely curved => strictly more
  });

  it('handles implicit polybezier repetition with exact junction + endpoint', () => {
    const { points } = flattenPathD('M0,0 C0,10 10,10 10,0 10,-10 20,-10 20,0', 0.25);
    // The first cubic ends exactly at (10,0) — it must appear verbatim as the
    // junction vertex — and the whole path ends exactly at (20,0).
    expect(points.some((p) => p[0] === 10 && p[1] === 0)).toBe(true);
    expect(points[points.length - 1]).toEqual([20, 0]);
  });

  it('uses tol=0.25 by default when tol is omitted', () => {
    const d = 'M0,0 C0,100 100,100 100,0';
    expect(flattenPathD(d)).toEqual(flattenPathD(d, 0.25));
  });
});

// ---------------------------------------------------------------------------
// flattenPathD — smooth cubic S (reflects previous cubic control)
// ---------------------------------------------------------------------------
describe('flattenPathD — smooth cubic S', () => {
  it('reflects the previous C 2nd control about the current point', () => {
    // After C0,50 50,50 50,0: current=(50,0), prev 2nd control=(50,50).
    // S first control = 2*(50,0) - (50,50) = (50,-50).
    const tol = 0.25;
    const { points } = flattenPathD('M0,0 C0,50 50,50 50,0 S100,-50 100,0', tol);
    expect(points[points.length - 1]).toEqual([100, 0]);
    const mid = cubicAt([50, 0], [50, -50], [100, -50], [100, 0], 0.5);
    expect(mid).toEqual([75, -37.5]);
    expect(nearestDist(points, mid)).toBeLessThan(tol);
  });

  it('treats a leading S (no preceding C/S) as first control = P0', () => {
    const tol = 0.25;
    const { points } = flattenPathD('M0,0 S10,10 20,0', tol);
    expect(points[points.length - 1]).toEqual([20, 0]);
    const mid = cubicAt([0, 0], [0, 0], [10, 10], [20, 0], 0.5);
    expect(nearestDist(points, mid)).toBeLessThan(tol);
  });
});

// ---------------------------------------------------------------------------
// flattenPathD — quadratic Q and smooth quadratic T
// ---------------------------------------------------------------------------
describe('flattenPathD — quadratic Q / T', () => {
  it('pins endpoints and samples near analytic B(0.5) for a Q', () => {
    // Analytic quad B(0.5) for M0,0 Q50,100 100,0 is (50, 50).
    const tol = 0.25;
    const { points } = flattenPathD('M0,0 Q50,100 100,0', tol);
    expect(points[0]).toEqual([0, 0]);
    expect(points[points.length - 1]).toEqual([100, 0]);
    const mid = quadAt([0, 0], [50, 100], [100, 0], 0.5);
    expect(mid).toEqual([50, 50]);
    expect(nearestDist(points, mid)).toBeLessThan(tol);
  });

  it('never emits the quadratic control point as a vertex', () => {
    const { points } = flattenPathD('M0,0 Q50,100 100,0', 0.25);
    expect(points.some((p) => p[0] === 50 && p[1] === 100)).toBe(false);
  });

  it('grows the vertex count as tol shrinks for a Q', () => {
    const d = 'M0,0 Q50,100 100,0';
    expect(flattenPathD(d, 0.05).points.length)
      .toBeGreaterThan(flattenPathD(d, 4).points.length);
  });

  it('reflects the previous Q control about the current point for a T', () => {
    // After Q50,50 100,0: current=(100,0), prev control=(50,50).
    // T control = 2*(100,0) - (50,50) = (150,-50).
    const tol = 0.25;
    const { points } = flattenPathD('M0,0 Q50,50 100,0 T200,0', tol);
    expect(points[points.length - 1]).toEqual([200, 0]);
    const mid = quadAt([100, 0], [150, -50], [200, 0], 0.5);
    expect(nearestDist(points, mid)).toBeLessThan(tol);
  });

  it('treats a leading T (no preceding Q/T) as control = P0 (straight line)', () => {
    const { points } = flattenPathD('M0,0 T20,0', 0.25);
    // Control coincides with P0 => the quad degenerates to the chord (0,0)->(20,0).
    expect(points[points.length - 1]).toEqual([20, 0]);
    for (const [, y] of points) expect(Math.abs(y)).toBeLessThan(0.25);
  });
});

// ---------------------------------------------------------------------------
// flattenPathD — elliptical arc A
// ---------------------------------------------------------------------------
describe('flattenPathD — elliptical arc A', () => {
  it('flattens a semicircle into many segments, each within tol of the radius', () => {
    // Semicircle radius 50 centred at (50,0): from (0,0) to (100,0).
    const tol = 0.25;
    const { points } = flattenPathD('M0,0 A50,50 0 0 1 100,0', tol);
    expect(points.length).toBeGreaterThan(10);
    expect(points[points.length - 1]).toEqual([100, 0]);
    // Every vertex sits within tol of radius 50 from the analytic centre (50,0).
    for (const p of points) {
      const r = Math.hypot(p[0] - 50, p[1] - 0);
      expect(Math.abs(r - 50)).toBeLessThan(tol);
    }
  });

  it('pins both endpoints of a quarter arc exactly', () => {
    // Quarter arc radius 10, centre (0,0): from (10,0) to (0,10).
    const { points } = flattenPathD('M10,0 A10,10 0 0 1 0,10', 0.25);
    expect(points[0]).toEqual([10, 0]);
    expect(points[points.length - 1]).toEqual([0, 10]);
    for (const p of points) {
      expect(Math.abs(Math.hypot(p[0], p[1]) - 10)).toBeLessThan(0.25);
    }
  });

  it('grows the vertex count as tol shrinks for an arc', () => {
    const d = 'M0,0 A50,50 0 0 1 100,0';
    expect(flattenPathD(d, 0.05).points.length)
      .toBeGreaterThan(flattenPathD(d, 5).points.length);
  });

  it('collapses a zero-radius arc to a straight line (endpoint only)', () => {
    const { points } = flattenPathD('M0,0 A0,0 0 0 1 10,10', 0.25);
    expect(points).toEqual([[0, 0], [10, 10]]);
  });

  // Direction-sensitive checks: the radius/endpoint asserts above pass for
  // EITHER sweep, so a flipped sweep-flag would slip through. These pin the
  // absolute sweep direction of the canonical SVG endpoint→centre algorithm
  // (F.6.5): for M0,0 A50,50 0 0 1 100,0 the arc bulges to y=-50; sweep=0
  // mirrors it to y=+50.
  it('honours the sweep flag (opposite sides, spec-correct absolute direction)', () => {
    const tol = 0.25;
    const nearMidX = (pts) =>
      pts.reduce((best, p) => (Math.abs(p[0] - 50) < Math.abs(best[0] - 50) ? p : best));
    const vSweep1 = nearMidX(flattenPathD('M0,0 A50,50 0 0 1 100,0', tol).points);
    const vSweep0 = nearMidX(flattenPathD('M0,0 A50,50 0 0 0 100,0', tol).points);
    expect(Math.sign(vSweep1[1])).toBe(-Math.sign(vSweep0[1])); // opposite sides
    expect(vSweep1[1]).toBeCloseTo(-50, 1); // spec: sweep=1 => y=-50
    expect(vSweep0[1]).toBeCloseTo(50, 1);  // spec: sweep=0 => y=+50
  });

  // The large-arc flag selects the 270° major arc (centre (10,10), reaching
  // out to ~(20,10)/(10,20)) over the 90° minor arc (centre (0,0), bounded in
  // [0,10]²). Endpoint + radius alone cannot tell 90° from 270°.
  it('honours the large-arc flag (major vs minor arc)', () => {
    const tol = 0.25;
    const minor = flattenPathD('M10,0 A10,10 0 0 1 0,10', tol).points;
    const major = flattenPathD('M10,0 A10,10 0 1 1 0,10', tol).points;
    expect(major.length).toBeGreaterThan(minor.length * 2); // ~270° vs ~90°
    expect(minor.every((p) => p[0] <= 10.25 && p[1] <= 10.25)).toBe(true);
    expect(major.some((p) => p[0] > 10.5 || p[1] > 10.5)).toBe(true);
    expect(major[major.length - 1]).toEqual([0, 10]); // endpoint still exact
  });
});
