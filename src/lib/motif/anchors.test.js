import { describe, it, expect } from 'vitest';
import {
  polylineLength,
  resampleByArcLength,
  anchorId,
  sampleEdgeAnchors,
} from './anchors.js';

function square(size = 40) {
  return [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
}

// Same square, but every edge gets an extra colinear midpoint. Geometry is
// identical; only vertex density changed.
function squareWithMidpoints(size = 40) {
  const s = size;
  return [
    { x: 0, y: 0 },
    { x: s / 2, y: 0 },
    { x: s, y: 0 },
    { x: s, y: s / 2 },
    { x: s, y: s },
    { x: s / 2, y: s },
    { x: 0, y: s },
    { x: 0, y: s / 2 },
  ];
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

describe('polylineLength', () => {
  it('sums segment lengths for an open polyline', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(polylineLength(pts, false)).toBeCloseTo(100, 9);
  });

  it('includes the closing segment for a closed polyline', () => {
    expect(polylineLength(square(40), true)).toBeCloseTo(160, 9);
  });

  it('returns 0 for fewer than two points', () => {
    expect(polylineLength([], false)).toBe(0);
    expect(polylineLength([{ x: 1, y: 1 }], false)).toBe(0);
  });
});

describe('resampleByArcLength — arc-length uniform (KEY GUARDRAIL)', () => {
  it('samples a straight horizontal line at exact s positions', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const samples = resampleByArcLength(pts, { spacing: 25 });
    expect(samples.map((s) => s.s)).toEqual([0, 25, 50, 75, 100]);
    expect(samples.map((s) => round6(s.x))).toEqual([0, 25, 50, 75, 100]);
    samples.forEach((s) => expect(s.y).toBeCloseTo(0, 9));
  });
});

describe('resampleByArcLength / sampleEdgeAnchors — vertex-density independence (KEY GUARDRAIL)', () => {
  it('gives identical anchors for a square with and without extra colinear midpoints', () => {
    const spacing = 10;
    const a = sampleEdgeAnchors([{ points: square(40), closed: true }], { spacing });
    const b = sampleEdgeAnchors([{ points: squareWithMidpoints(40), closed: true }], { spacing });

    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
    a.forEach((anchorA, i) => {
      const anchorB = b[i];
      expect(round6(anchorA.x)).toBe(round6(anchorB.x));
      expect(round6(anchorA.y)).toBe(round6(anchorB.y));
      expect(round6(anchorA.tangent)).toBe(round6(anchorB.tangent));
    });
  });

  it('resampleByArcLength alone is unaffected by inserted colinear midpoints on an open path', () => {
    const spacing = 10;
    const straight = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const straightWithMidpoints = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 55, y: 0 },
      { x: 100, y: 0 },
    ];
    const a = resampleByArcLength(straight, { spacing });
    const b = resampleByArcLength(straightWithMidpoints, { spacing });
    expect(a.map((s) => round6(s.x))).toEqual(b.map((s) => round6(s.x)));
    expect(a.map((s) => round6(s.tangent))).toEqual(b.map((s) => round6(s.tangent)));
  });
});

describe('sampleEdgeAnchors — winding-direction robustness (KEY GUARDRAIL)', () => {
  it('outward normal points away from centroid for both CW and CCW windings', () => {
    const ccw = square(40);
    const cw = [...ccw].reverse();
    const centroid = { x: 20, y: 20 };

    for (const points of [ccw, cw]) {
      const anchors = sampleEdgeAnchors([{ points, closed: true }], { spacing: 5 });
      expect(anchors.length).toBeGreaterThan(0);
      anchors.forEach((anchor) => {
        const nx = Math.cos(anchor.normal);
        const ny = Math.sin(anchor.normal);
        const vx = anchor.x - centroid.x;
        const vy = anchor.y - centroid.y;
        const dot = nx * vx + ny * vy;
        expect(dot).toBeGreaterThan(0);
      });
    }
  });
});

describe('resampleByArcLength — closed-path count', () => {
  it('produces round(perimeter/spacing) anchors, starting at s=0, none duplicated at s=P', () => {
    const spacing = 10;
    const perimeter = 160; // 40x40 square
    const samples = resampleByArcLength(square(40), { spacing, closed: true });
    expect(samples.length).toBe(Math.round(perimeter / spacing));
    expect(samples[0].s).toBeCloseTo(0, 9);
    samples.forEach((s) => expect(s.s).toBeLessThan(perimeter));
  });
});

describe('resampleByArcLength — tangent correctness', () => {
  it('horizontal left-to-right segment has tangent ~0', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const samples = resampleByArcLength(pts, { spacing: 5 });
    samples.forEach((s) => expect(s.tangent).toBeCloseTo(0, 9));
  });

  it('vertical upward segment has tangent magnitude PI/2', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 10 }];
    const samples = resampleByArcLength(pts, { spacing: 5 });
    samples.forEach((s) => expect(Math.abs(s.tangent)).toBeCloseTo(Math.PI / 2, 9));
  });
});

describe('sampleEdgeAnchors — determinism', () => {
  it('produces identical output (including ids) across repeated calls', () => {
    const paths = [{ points: square(40), closed: true }];
    const a = sampleEdgeAnchors(paths, { spacing: 10 });
    const b = sampleEdgeAnchors(paths, { spacing: 10 });
    expect(a).toEqual(b);
    expect(a.map((x) => x.id)).toEqual(a.map((_, i) => anchorId('edge', 0, i)));
  });

  it('assigns stable role/meta on every anchor', () => {
    const paths = [{ points: square(40), closed: true }];
    const anchors = sampleEdgeAnchors(paths, { spacing: 10 });
    anchors.forEach((a, i) => {
      expect(a.role).toBe('edge');
      expect(a.meta).toEqual({ pathIndex: 0, sampleIndex: i, closed: true });
    });
  });
});

describe('sampleEdgeAnchors — degenerate input', () => {
  it('returns [] for an empty paths array', () => {
    expect(sampleEdgeAnchors([])).toEqual([]);
  });

  it('contributes nothing for a single-point (zero-length) path', () => {
    const anchors = sampleEdgeAnchors([{ points: [{ x: 5, y: 5 }], closed: false }], { spacing: 10 });
    expect(anchors).toEqual([]);
  });

  it('contributes nothing for a zero-length closed path (all points coincide)', () => {
    const pts = [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }];
    const anchors = sampleEdgeAnchors([{ points: pts, closed: true }], { spacing: 10 });
    expect(anchors).toEqual([]);
  });

  it('accepts a bare array of points as a path (implicit closed=false)', () => {
    const anchors = sampleEdgeAnchors([[{ x: 0, y: 0 }, { x: 10, y: 0 }]], { spacing: 5 });
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.every((a) => a.meta.closed === false)).toBe(true);
  });
});

describe('sampleEdgeAnchors — ordering', () => {
  it('orders anchors by (pathIndex, s)', () => {
    const paths = [
      { points: [{ x: 0, y: 0 }, { x: 20, y: 0 }], closed: false },
      { points: [{ x: 0, y: 100 }, { x: 20, y: 100 }], closed: false },
    ];
    const anchors = sampleEdgeAnchors(paths, { spacing: 5 });
    const pathIndices = anchors.map((a) => a.meta.pathIndex);
    // All of path 0's anchors precede all of path 1's.
    const firstPath1 = pathIndices.indexOf(1);
    expect(pathIndices.slice(0, firstPath1).every((p) => p === 0)).toBe(true);
    expect(pathIndices.slice(firstPath1).every((p) => p === 1)).toBe(true);
    // Within each path, s is non-decreasing.
    for (let i = 1; i < anchors.length; i++) {
      if (anchors[i].meta.pathIndex === anchors[i - 1].meta.pathIndex) {
        expect(anchors[i].s).toBeGreaterThanOrEqual(anchors[i - 1].s);
      }
    }
  });
});

describe('anchorId', () => {
  it('is deterministic and colon-joined', () => {
    expect(anchorId('edge', 0, 3)).toBe('edge:0:3');
  });
});
