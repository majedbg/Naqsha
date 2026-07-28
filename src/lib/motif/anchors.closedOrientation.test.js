// #164 — glyph orientation on closed paths. A glyph's `normal` IS its rotation,
// so this file is about which way ornament faces on a closed host.
//
// THE DECISION (2026-07-28), taken on measurement:
//
//   1a — a closed path with a REAL area orients by its WINDING: the normal is
//        `tangent ± π/2` with the sign chosen ONCE per path from the sign of the
//        shoelace area. On a simple closed polygon that IS the outward normal,
//        and it is continuous by construction (a per-path constant added to a
//        continuous tangent), so it cannot reverse mid-curve.
//
//   2a — a DEGENERATE path (|area| < EPS) keeps today's behaviour verbatim:
//        the outward direction from the vertex-average centroid. There is no
//        winding to read and no "outward" to be right about on such a figure —
//        a default Lissajous has signed area ~1e-9 by harmonic orthogonality —
//        and the radial look it produces was judged worth keeping.
//
// WHY 1a IS A FIX AND NOT A PREFERENCE. Outward-from-centroid is only the
// outward normal when the ring is star-shaped about its own centroid. Measured
// on the shipping hosts before this change:
//
//   topographic (defaults) — 554 anchors: normal points OUT at 505 (91%), with
//     47 reversals on smooth stretches of curve, on 46 of 50 rings.
//   after 1a               — 554 of 554 (100%) out, 0 reversals.
//   convex rings           — byte-identical; a simple ellipse changed 0 of 754.
//
// The ticket supposed iso-contours were the clear case and self-intersecting
// figures the doubtful one. It is the other way round: topographic had the
// HIGHEST reversal rate measured (8.5% of anchors) and a default Lissajous the
// lower one (1.3%) — and Lissajous is the case 2a deliberately leaves alone.

import { describe, it, expect } from 'vitest';
import { sampleEdgeAnchors } from './anchors.js';

// An L: a horizontal arm along y ∈ [0,20] and a vertical arm along x ∈ [0,20].
// Its centroid is (32.2, 32.2), which lies in the notch — OUTSIDE the material —
// so the figure is not star-shaped about its own centroid and outward-from-
// centroid has nothing sound to say. Hand-checkable on the segment from (100,20)
// to (20,20), the UNDERSIDE of the horizontal arm: material is at y < 20, so the
// outward normal points to +y. But (pos − centroid) at (60,20) is (27.8, −12.2),
// whose larger dot product is with −y — so the old rule picked −y, straight back
// into the arm.
const L_SHAPE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 20 },
  { x: 20, y: 20 },
  { x: 20, y: 100 },
  { x: 0, y: 100 },
];

const SQUARE = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];

// A figure-eight: signed area cancels to exactly 0, so it takes the degenerate
// branch — the Lissajous case in miniature.
const FIGURE_EIGHT = [
  { x: -50, y: -50 },
  { x: 50, y: -50 },
  { x: -50, y: 50 },
  { x: 50, y: 50 },
];

/** Even-odd ray cast. */
function inside(pt, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (
      a.y > pt.y !== b.y > pt.y &&
      pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
    ) {
      c = !c;
    }
  }
  return c;
}

const wrap = (d) => {
  const m = Math.abs(d) % (2 * Math.PI);
  return m > Math.PI ? 2 * Math.PI - m : m;
};

/** Anchors whose normal, stepped a little, does NOT leave the polygon. */
function inwardFacing(anchors, pts, step = 0.75) {
  return anchors.filter((a) =>
    inside({ x: a.x + step * Math.cos(a.normal), y: a.y + step * Math.sin(a.normal) }, pts)
  );
}

/** Reversals >90° between neighbours while the TANGENT runs smooth. */
function reversals(anchors) {
  let n = 0;
  for (let i = 1; i < anchors.length; i++) {
    if (
      wrap(anchors[i].tangent - anchors[i - 1].tangent) <= Math.PI / 2 &&
      wrap(anchors[i].normal - anchors[i - 1].normal) > Math.PI / 2
    ) {
      n++;
    }
  }
  return n;
}

const sample = (points, opts = {}) =>
  sampleEdgeAnchors([{ points, closed: true }], { spacing: 4, ...opts });

describe('#164 / 1a — a non-convex ring orients OUTWARD everywhere', () => {
  it('every normal on the L points out of the material', () => {
    const anchors = sample(L_SHAPE);
    expect(anchors.length).toBeGreaterThan(20);
    expect(inwardFacing(anchors, L_SHAPE)).toEqual([]);
  });

  it('no normal reverses against its neighbour on a smooth stretch', () => {
    expect(reversals(sample(L_SHAPE))).toBe(0);
  });

  it('the underside of the horizontal arm — where the old rule pointed inward', () => {
    // Segment (100,20) → (20,20): material at y < 20, so the outward normal must
    // have a POSITIVE y component. Outward-from-centroid chose negative here,
    // which is what makes this the discriminating case rather than a restatement
    // of the aggregate check above.
    const underside = sample(L_SHAPE).filter(
      (a) => Math.abs(a.y - 20) < 1e-6 && a.x > 25 && a.x < 95
    );
    expect(underside.length).toBeGreaterThan(5);
    underside.forEach((a) => expect(Math.sin(a.normal)).toBeGreaterThan(0));
  });
});

describe('#164 / 1a — winding robustness is preserved', () => {
  // Stated as the PROPERTY, not pointwise: the two windings do not sample the
  // same arc-length positions (resampling starts at points[0] and runs the other
  // way), so comparing anchor-to-anchor would compare different places on the
  // curve. What must hold either way is that every normal faces out.
  it('both windings orient outward on a non-convex ring', () => {
    for (const shape of [L_SHAPE, [...L_SHAPE].reverse()]) {
      const anchors = sample(shape);
      expect(anchors.length).toBeGreaterThan(20);
      expect(inwardFacing(anchors, shape)).toEqual([]);
    }
  });

  it('a convex ring is unchanged — still outward from the centroid, both windings', () => {
    const centroid = { x: 20, y: 20 };
    for (const points of [SQUARE, [...SQUARE].reverse()]) {
      const anchors = sample(points, { spacing: 5 });
      expect(anchors.length).toBeGreaterThan(0);
      anchors.forEach((a) => {
        const dot =
          Math.cos(a.normal) * (a.x - centroid.x) + Math.sin(a.normal) * (a.y - centroid.y);
        expect(dot).toBeGreaterThan(0);
      });
    }
  });
});

describe('#164 / 2a — a degenerate figure keeps the radial rule, deliberately', () => {
  it('a zero-area figure-eight is BYTE-IDENTICAL to the pre-#164 degenerate rule', () => {
    const anchors = sample(FIGURE_EIGHT, { spacing: 10 });
    expect(anchors.length).toBeGreaterThan(4);
    // Recompute the OLD rule here, verbatim: outward from the plain vertex
    // average (which is what polygonCentroid falls back to at |area| < EPS).
    // The vertex average of FIGURE_EIGHT is the origin.
    const centre = { x: 0, y: 0 };
    anchors.forEach((a) => {
      const perpA = a.tangent + Math.PI / 2;
      const perpB = a.tangent - Math.PI / 2;
      const vx = a.x - centre.x;
      const vy = a.y - centre.y;
      const dotA = Math.cos(perpA) * vx + Math.sin(perpA) * vy;
      const dotB = Math.cos(perpB) * vx + Math.sin(perpB) * vy;
      const expected = dotA >= dotB ? perpA : perpB;
      expect(wrap(a.normal - expected)).toBeLessThan(1e-9);
    });
  });

  it('an OPEN path is untouched by all of this — still tangent + PI/2', () => {
    const open = sampleEdgeAnchors([{ points: L_SHAPE, closed: false }], { spacing: 4 });
    expect(open.length).toBeGreaterThan(10);
    open.forEach((a) => expect(wrap(a.normal - (a.tangent + Math.PI / 2))).toBeLessThan(1e-9));
  });
});
