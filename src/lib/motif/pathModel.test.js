import { describe, it, expect } from 'vitest';
import { parseDToAnchors, anchorsToD } from './pathModel.js';
import { flattenPathD } from '../plotter/pathOps.js';

// --- round-trip fidelity comparator -----------------------------------------
// The WHOLE point of this module: parse -> serialize -> flatten must match the
// original -> flatten in SHAPE (not byte-for-byte). Because curves from
// different control representations tessellate to different vertex COUNTS, we
// compare by geometric proximity — for every vertex of one polyline, its
// distance to the NEAREST SEGMENT of the other must be < tol — measured in both
// directions (a symmetric Hausdorff bound).
//
// Critically it ALSO asserts the `closed` flags match. flattenPathD encodes the
// closing edge ONLY in that flag (it is NOT a vertex in `points`), so without
// this a dropped `Z` would leave the two point arrays identical and pass green
// on a broken serializer.

function distPointToSeg(p, a, b) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : (apx * abx + apy * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a[0] + t * abx;
  const cy = a[1] + t * aby;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

// Directed: max over points of A of the min distance to any segment of B.
function directedHausdorff(A, B) {
  let worst = 0;
  for (const p of A) {
    let best = Infinity;
    for (let i = 1; i < B.length; i++) {
      const d = distPointToSeg(p, B[i - 1], B[i]);
      if (d < best) best = d;
    }
    if (B.length === 1) best = Math.hypot(p[0] - B[0][0], p[1] - B[0][1]);
    if (best > worst) worst = best;
  }
  return worst;
}

// Flatten FINE (0.02px) so each polyline hugs its true curve and the measured
// gap reflects real shape difference, not the flattener's own chord error (a
// coarse 0.25px flatten leaves ~0.2px sagitta that would swamp a faithful arc).
const FLAT_TOL = 0.02;

function maxShapeGap(dA, dB) {
  const a = flattenPathD(dA, FLAT_TOL);
  const b = flattenPathD(dB, FLAT_TOL);
  return Math.max(directedHausdorff(a.points, b.points), directedHausdorff(b.points, a.points));
}

// Assert two `d` strings describe the same SHAPE (both directions + closedness).
function expectSameShape(dOrig, dRound, tol = 0.5) {
  const a = flattenPathD(dOrig, FLAT_TOL);
  const b = flattenPathD(dRound, FLAT_TOL);
  expect(b.closed).toBe(a.closed);
  expect(maxShapeGap(dOrig, dRound)).toBeLessThan(tol);
}

const leaf = 'M0,-10 L7,-4 L8,5 L2,10 L-6,6 L-7,-2 L-2,-8 Z';
const diamond = 'M0,-8 L5,0 L0,8 L-5,0 Z';

// --- Slice 1: parse a simple M/L/Z triangle ---------------------------------
describe('parseDToAnchors — M/L/Z triangle', () => {
  const model = parseDToAnchors('M0,0 L10,0 L5,8 Z');

  it('emits one closed subpath with three corner anchors', () => {
    expect(model.subpaths).toHaveLength(1);
    const sp = model.subpaths[0];
    expect(sp.closed).toBe(true);
    expect(sp.anchors).toHaveLength(3);
    expect(sp.anchors.map((a) => a.type)).toEqual(['corner', 'corner', 'corner']);
  });

  it('captures coordinates with null handles on straight anchors', () => {
    const [a, b, c] = model.subpaths[0].anchors;
    expect(a).toMatchObject({ x: 0, y: 0, in: null, out: null });
    expect(b).toMatchObject({ x: 10, y: 0, in: null, out: null });
    expect(c).toMatchObject({ x: 5, y: 8, in: null, out: null });
  });
});

// --- Slice 2: anchorsToD round-trips the triangle (L + Z) -------------------
describe('anchorsToD — M/L/Z triangle', () => {
  it('round-trips to the same shape and emits L + Z', () => {
    const d = 'M0,0 L10,0 L5,8 Z';
    const out = anchorsToD(parseDToAnchors(d));
    expect(out).toMatch(/L/);
    expect(out.trim().endsWith('Z')).toBe(true);
    expectSameShape(d, out);
  });

  it('round-trips the built-in leaf and diamond glyphs', () => {
    expectSameShape(leaf, anchorsToD(parseDToAnchors(leaf)));
    expectSameShape(diamond, anchorsToD(parseDToAnchors(diamond)));
  });
});

// --- Slice 3: cubic C — handles captured as absolute points -----------------
describe('parseDToAnchors / anchorsToD — cubic C', () => {
  const d = 'M0,0 C10,0 20,10 20,20';

  it('captures both control points as absolute handle positions', () => {
    const [a, b] = parseDToAnchors(d).subpaths[0].anchors;
    expect(a.out).toEqual({ x: 10, y: 0 });
    expect(b.in).toEqual({ x: 20, y: 10 });
    expect(a.in).toBeNull();
    expect(b.out).toBeNull();
  });

  it('round-trips the cubic shape and emits C (not L)', () => {
    const out = anchorsToD(parseDToAnchors(d));
    expect(out).toMatch(/C/);
    expectSameShape(d, out);
  });
});

// --- Slice 4: S shorthand — reflected control point -------------------------
describe('parseDToAnchors — S shorthand', () => {
  it('reflects the previous cubic control point about the joint', () => {
    // After C ...30,10 40,0, the S first control = reflection of (40,0) about
    // the joint (40,0)?? Use an explicit joint to make the reflection concrete.
    const d = 'M0,0 C10,-10 30,-10 40,0 S70,10 80,0';
    const anchors = parseDToAnchors(d).subpaths[0].anchors;
    // Joint anchor is anchors[1] at (40,0); its incoming handle is (30,-10).
    expect(anchors[1]).toMatchObject({ x: 40, y: 0 });
    expect(anchors[1].in).toEqual({ x: 30, y: -10 });
    // The S segment's outgoing handle from the joint is the reflection of (30,-10)
    // about (40,0) => (50,10).
    expect(anchors[1].out).toEqual({ x: 50, y: 10 });
  });

  it('round-trips an S-shorthand path faithfully', () => {
    const d = 'M0,0 C10,-10 30,-10 40,0 S70,10 80,0';
    expectSameShape(d, anchorsToD(parseDToAnchors(d)));
  });
});

// --- Slice 5: Q / T — exact cubic elevation ---------------------------------
describe('parseDToAnchors — Q / T elevation', () => {
  it('elevates a quadratic Q to cubic exactly (2/3 rule)', () => {
    const d = 'M0,0 Q30,30 60,0';
    const [a, b] = parseDToAnchors(d).subpaths[0].anchors;
    // cp1 = p0 + 2/3(qc-p0) = (20,20); cp2 = p3 + 2/3(qc-p3) = (40,20).
    expect(a.out).toEqual({ x: 20, y: 20 });
    expect(b.in).toEqual({ x: 40, y: 20 });
  });

  it('round-trips Q faithfully (elevation is geometrically exact)', () => {
    const d = 'M0,0 Q30,30 60,0';
    expect(maxShapeGap(d, anchorsToD(parseDToAnchors(d)))).toBeLessThan(0.05);
  });

  it('round-trips a T continuation faithfully', () => {
    const d = 'M0,0 Q20,-20 40,0 T80,0';
    expectSameShape(d, anchorsToD(parseDToAnchors(d)));
  });
});

// --- Slice 6: A arc — cubic approximation within arc tolerance ---------------
describe('parseDToAnchors — A arc approximation', () => {
  it('approximates a quarter-circle arc within arc tolerance', () => {
    // Glyph-scale radius (10) — keeps cubic-approx error tiny.
    const d = 'M10,0 A10,10 0 0 1 0,10';
    const out = anchorsToD(parseDToAnchors(d));
    // A single quarter arc splits into >=1 cubic; a bit of headroom over the
    // exact L/C/Q cases for the lossy arc normalization.
    expect(maxShapeGap(d, out)).toBeLessThan(0.1);
  });

  it('approximates a large-arc semicircle within tolerance', () => {
    const d = 'M-8,0 A8,8 0 1 1 8,0';
    expectSameShape(d, anchorsToD(parseDToAnchors(d)), 0.2);
  });
});

// --- Slice 7: multiple subpaths in one d ------------------------------------
describe('parseDToAnchors — multiple subpaths', () => {
  it('splits two M...Z runs into two closed subpath entries', () => {
    const d = 'M0,0 L4,0 L4,4 Z M10,10 L14,10 L14,14 Z';
    const model = parseDToAnchors(d);
    expect(model.subpaths).toHaveLength(2);
    expect(model.subpaths[0].closed).toBe(true);
    expect(model.subpaths[1].closed).toBe(true);
    expect(model.subpaths[0].anchors).toHaveLength(3);
    expect(model.subpaths[1].anchors[0]).toMatchObject({ x: 10, y: 10 });
    expectSameShape(d, anchorsToD(model));
  });
});

// --- Slice 8: open subpath (no Z) -------------------------------------------
describe('parseDToAnchors — open subpath', () => {
  it('marks a Z-less subpath open and emits no Z', () => {
    const d = 'M0,0 L10,0 L10,10';
    const model = parseDToAnchors(d);
    expect(model.subpaths[0].closed).toBe(false);
    const out = anchorsToD(model);
    expect(out).not.toMatch(/Z/);
    expectSameShape(d, out);
  });

  it('handles a mix of one open and one closed subpath', () => {
    const d = 'M0,0 L10,0 L10,10 M20,20 L30,20 L25,28 Z';
    const model = parseDToAnchors(d);
    expect(model.subpaths[0].closed).toBe(false);
    expect(model.subpaths[1].closed).toBe(true);
    const out = anchorsToD(model);
    // exactly one Z
    expect((out.match(/Z/g) || []).length).toBe(1);
    expectSameShape(d, out);
  });
});

// --- Slice 9: type inference (hint only) ------------------------------------
describe('parseDToAnchors — type inference', () => {
  it('marks a genuinely smooth cubic joint as smooth', () => {
    // Symmetric, collinear, mirror-length handles about the joint (40,0):
    // incoming (30,-10) -> reflection (50,10) is the outgoing handle => smooth.
    const d = 'M0,0 C10,-10 30,-10 40,0 S70,10 80,0';
    const joint = parseDToAnchors(d).subpaths[0].anchors[1];
    expect(joint.type).toBe('smooth');
  });

  it('marks a sharp cubic joint (kink) as corner', () => {
    // Incoming handle (30,-10); outgoing handle (30,-10 direction) creates a kink.
    const d = 'M0,0 C10,-10 30,-10 40,0 C40,-30 70,10 80,0';
    const joint = parseDToAnchors(d).subpaths[0].anchors[1];
    expect(joint.type).toBe('corner');
  });

  it('marks anchors with a null handle as corner', () => {
    const d = 'M0,0 L40,0 C50,10 70,10 80,0';
    const anchors = parseDToAnchors(d).subpaths[0].anchors;
    // anchors[1] has a straight incoming (L) side => in is null => corner.
    expect(anchors[1].in).toBeNull();
    expect(anchors[1].type).toBe('corner');
  });
});

// --- Slice 10: type is a hint only — never affects geometry -----------------
describe('anchorsToD — type never affects geometry', () => {
  it('forcing a wrong type leaves the emitted d byte-identical', () => {
    const d = 'M0,0 C10,-10 30,-10 40,0 S70,10 80,0';
    const model = parseDToAnchors(d);
    const baseline = anchorsToD(model);
    // Flip every anchor's type to the opposite value.
    for (const sp of model.subpaths) {
      for (const a of sp.anchors) {
        a.type = a.type === 'smooth' ? 'corner' : 'smooth';
      }
    }
    expect(anchorsToD(model)).toBe(baseline);
  });
});

// --- Slice 11: lowercase commands match pathOps conventions (absolute) ------
describe('parseDToAnchors — lowercase conventions match flattenPathD', () => {
  it('treats lowercase m/l as ABSOLUTE (matching parsePathD/flattenPathD)', () => {
    const upper = 'M0,0 L10,0 L5,8 Z';
    const lower = 'm0,0 l10,0 l5,8 z';
    const up = parseDToAnchors(upper).subpaths[0].anchors.map((a) => [a.x, a.y]);
    const lo = parseDToAnchors(lower).subpaths[0].anchors.map((a) => [a.x, a.y]);
    expect(lo).toEqual(up);
  });

  it('lowercase curve round-trips consistently with the flattener', () => {
    const d = 'm0,0 c10,0 20,10 20,20';
    // Both parseDToAnchors and flattenPathD read lowercase as absolute, so the
    // shape round-trip stays self-consistent.
    expectSameShape(d, anchorsToD(parseDToAnchors(d)));
  });
});
