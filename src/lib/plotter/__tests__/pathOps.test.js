import { describe, it, expect } from 'vitest';
import {
  parsePathD,
  pathDFromPoints,
  rdp,
  mergeLines,
  reorderPaths,
  pathStats,
  estimateTimeSec,
  PX_PER_MM,
} from '../pathOps.js';

// ---------------------------------------------------------------------------
// parsePathD
// ---------------------------------------------------------------------------
describe('parsePathD', () => {
  it('parses a simple M + L polyline', () => {
    const { points, closed } = parsePathD('M0,0 L10,20 L30,40');
    expect(points).toEqual([[0, 0], [10, 20], [30, 40]]);
    expect(closed).toBe(false);
  });

  it('sets closed=true when path ends with Z', () => {
    const { closed } = parsePathD('M0,0 L5,5 Z');
    expect(closed).toBe(true);
  });

  it('handles lowercase m/l/z', () => {
    const { points, closed } = parsePathD('m0,0 l10,20 z');
    expect(points).toEqual([[0, 0], [10, 20]]);
    expect(closed).toBe(true);
  });

  it('handles negative coordinates', () => {
    const { points } = parsePathD('M-5,-10 L-15,-20');
    expect(points).toEqual([[-5, -10], [-15, -20]]);
  });

  it('handles scientific notation coordinates', () => {
    const { points } = parsePathD('M1e2,2e1 L3,4');
    expect(points[0][0]).toBeCloseTo(100, 5);
    expect(points[0][1]).toBeCloseTo(20, 5);
  });

  it('returns empty result for empty/null input', () => {
    expect(parsePathD('')).toEqual({ points: [], closed: false });
    expect(parsePathD(null)).toEqual({ points: [], closed: false });
    expect(parsePathD(undefined)).toEqual({ points: [], closed: false });
  });

  it('returns empty for a non-string', () => {
    expect(parsePathD(42)).toEqual({ points: [], closed: false });
  });
});

// ---------------------------------------------------------------------------
// pathDFromPoints
// ---------------------------------------------------------------------------
describe('pathDFromPoints', () => {
  it('serializes open path with M + L commands', () => {
    expect(pathDFromPoints([[0, 0], [10, 20]])).toBe('M0.00,0.00 L10.00,20.00');
  });

  it('appends Z for closed paths', () => {
    expect(pathDFromPoints([[0, 0], [5, 5]], true)).toBe('M0.00,0.00 L5.00,5.00 Z');
  });

  it('returns empty string for empty points', () => {
    expect(pathDFromPoints([])).toBe('');
  });
});

// ---------------------------------------------------------------------------
// parsePathD <-> pathDFromPoints round-trip
// ---------------------------------------------------------------------------
describe('parsePathD / pathDFromPoints round-trip', () => {
  it('is idempotent for 2-decimal-place coordinates (no drift)', () => {
    const original = [[1.23, 4.56], [7.89, 0.12]];
    const d = pathDFromPoints(original);
    const { points } = parsePathD(d);
    expect(points).toEqual(original);
  });

  // DOCUMENTED PRECISION LOSS: pathDFromPoints uses toFixed(2), so coordinates
  // with more than 2 decimal places are rounded. The parsed round-trip will
  // NOT match the original high-precision input.
  it('documents 2-dp precision rounding on serialise', () => {
    const highPrec = [[1.123456, 2.987654]];
    const d = pathDFromPoints(highPrec);
    const { points } = parsePathD(d);
    // Points are rounded to 2dp, not equal to original
    expect(points[0][0]).toBeCloseTo(1.12, 2);
    expect(points[0][1]).toBeCloseTo(2.99, 2);
    // Confirm they do NOT exactly match the high-precision input
    expect(points[0][0]).not.toBe(highPrec[0][0]);
  });

  it('is stable on a second round-trip (idempotent after first serialise)', () => {
    const pts = [[1.5, 2.7], [9.33, 0.01]];
    const d1 = pathDFromPoints(pts);
    const { points: p1 } = parsePathD(d1);
    const d2 = pathDFromPoints(p1);
    const { points: p2 } = parsePathD(d2);
    expect(p2).toEqual(p1);
  });
});

// ---------------------------------------------------------------------------
// rdp — Ramer-Douglas-Peucker simplification
// ---------------------------------------------------------------------------
describe('rdp', () => {
  it('preserves endpoints regardless of epsilon', () => {
    const pts = [[0, 0], [1, 0.01], [2, 0], [3, 0.01], [10, 0]];
    const out = rdp(pts, 100); // very large epsilon — collapse everything
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([10, 0]);
  });

  it('removes collinear points with epsilon > 0', () => {
    // 5 collinear points on y=0 — all interior points should be removed
    const pts = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];
    const out = rdp(pts, 0.001);
    expect(out).toEqual([[0, 0], [4, 0]]);
  });

  it('keeps a peak that exceeds epsilon', () => {
    // Triangle peak at [2, 5] — distance from line (0,0)-(4,0) is 5
    const pts = [[0, 0], [2, 5], [4, 0]];
    const out = rdp(pts, 1);
    expect(out).toEqual([[0, 0], [2, 5], [4, 0]]);
  });

  it('drops a near-collinear intermediate point below epsilon', () => {
    // Peak at [2, 0.001] — well below epsilon 1
    const pts = [[0, 0], [2, 0.001], [4, 0]];
    const out = rdp(pts, 1);
    expect(out).toEqual([[0, 0], [4, 0]]);
  });

  it('returns a copy for <=2 points (no simplification possible)', () => {
    const pts = [[0, 0], [5, 5]];
    const out = rdp(pts, 1);
    expect(out).toEqual(pts);
    expect(out).not.toBe(pts); // must be a copy
  });

  it('returns empty array for null/undefined input', () => {
    expect(rdp(null, 1)).toEqual([]);
    expect(rdp(undefined, 1)).toEqual([]);
  });

  it('returns copy unchanged when epsilon <= 0', () => {
    const pts = [[0, 0], [1, 1], [2, 0]];
    const out = rdp(pts, 0);
    expect(out).toEqual(pts);
  });
});

// ---------------------------------------------------------------------------
// mergeLines
// ---------------------------------------------------------------------------
describe('mergeLines', () => {
  it('merges two end-to-end open paths within tolerance', () => {
    // A ends at [5,0], B starts at [5,0] — same point
    const paths = [
      { points: [[0, 0], [5, 0]], closed: false },
      { points: [[5, 0], [10, 0]], closed: false },
    ];
    const out = mergeLines(paths, 0.1); // tolerance 0.1 mm
    expect(out).toHaveLength(1);
    expect(out[0].points).toEqual([[0, 0], [5, 0], [10, 0]]);
  });

  it('merges a reversed path (end-to-end by flipping)', () => {
    // A ends at [5,0], B ends at [5,0] — B must be reversed to connect
    const paths = [
      { points: [[0, 0], [5, 0]], closed: false },
      { points: [[10, 0], [5, 0]], closed: false },
    ];
    const out = mergeLines(paths, 0.1);
    expect(out).toHaveLength(1);
    expect(out[0].points[0]).toEqual([0, 0]);
    expect(out[0].points[out[0].points.length - 1]).toEqual([10, 0]);
  });

  it('passes through closed paths untouched', () => {
    const paths = [
      { points: [[0, 0], [5, 0], [5, 5], [0, 0]], closed: true },
    ];
    const out = mergeLines(paths, 1);
    expect(out).toHaveLength(1);
    expect(out[0].closed).toBe(true);
  });

  it('does not merge paths that are farther apart than tolerance', () => {
    const paths = [
      { points: [[0, 0], [5, 0]], closed: false },
      { points: [[10, 0], [15, 0]], closed: false }, // gap of 5px ≈ 1.32mm
    ];
    const out = mergeLines(paths, 0.1); // only 0.1mm tolerance
    expect(out).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// reorderPaths — travel minimization
// ---------------------------------------------------------------------------
describe('reorderPaths', () => {
  it('reduces total travel distance for a pessimal ordering', () => {
    // Four segments deliberately ordered far apart; greedy NN should improve.
    // Segment A: (100,0)-(110,0), B: (0,0)-(10,0), C: (200,0)-(210,0), D: (50,0)-(60,0)
    // Starting from (0,0), optimal is roughly B→D→A→C (ascending x)
    const paths = [
      { points: [[100, 0], [110, 0]], closed: false },
      { points: [[0, 0], [10, 0]], closed: false },
      { points: [[200, 0], [210, 0]], closed: false },
      { points: [[50, 0], [60, 0]], closed: false },
    ];
    const before = pathStats(paths);
    const reordered = reorderPaths(paths);
    const after = pathStats(reordered);
    expect(after.travelMm).toBeLessThan(before.travelMm);
  });

  it('returns a copy for a single-path input', () => {
    const paths = [{ points: [[0, 0], [5, 5]], closed: false }];
    const out = reorderPaths(paths);
    expect(out).toHaveLength(1);
    expect(out).not.toBe(paths);
  });

  it('preserves all paths (no loss)', () => {
    const paths = [
      { points: [[0, 0], [1, 1]], closed: false },
      { points: [[5, 5], [6, 6]], closed: false },
      { points: [[10, 10], [11, 11]], closed: false },
    ];
    const out = reorderPaths(paths);
    expect(out).toHaveLength(paths.length);
  });
});

// ---------------------------------------------------------------------------
// pathStats
// ---------------------------------------------------------------------------
describe('pathStats', () => {
  it('returns zero stats for empty input', () => {
    const s = pathStats([]);
    expect(s.paths).toBe(0);
    expect(s.drawMm).toBe(0);
    expect(s.travelMm).toBe(0);
    expect(s.points).toBe(0);
  });

  it('counts draw distance for a known segment', () => {
    // 96px horizontal segment = 96/PX_PER_MM mm = 25.4mm (1 inch)
    const paths = [{ points: [[0, 0], [96, 0]], closed: false }];
    const s = pathStats(paths);
    expect(s.paths).toBe(1);
    expect(s.drawMm).toBeCloseTo(25.4, 4);
    expect(s.travelMm).toBe(0); // first path, no preceding pen-up
  });

  it('counts travel distance between paths', () => {
    // Two horizontally separated unit-length segments
    const paths = [
      { points: [[0, 0], [0, 0]], closed: false }, // zero-length, skipped for stats
      { points: [[0, 0], [10, 0]], closed: false },
      { points: [[50, 0], [60, 0]], closed: false }, // 40px travel gap
    ];
    const s = pathStats(paths);
    // travel = distance from [10,0] to [50,0] = 40px / PX_PER_MM
    expect(s.travelMm).toBeCloseTo(40 / PX_PER_MM, 4);
  });

  it('ignores paths with fewer than 2 points', () => {
    const paths = [
      { points: [[0, 0]], closed: false },
      { points: [], closed: false },
      { points: [[0, 0], [10, 0]], closed: false },
    ];
    const s = pathStats(paths);
    expect(s.paths).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// estimateTimeSec
// ---------------------------------------------------------------------------
describe('estimateTimeSec', () => {
  it('estimates time at default AxiDraw V3 speeds (200/500 mm/s)', () => {
    // 200mm draw at 200mm/s = 1s; 500mm travel at 500mm/s = 1s → 2s total
    const result = estimateTimeSec({ drawMm: 200, travelMm: 500 });
    expect(result).toBeCloseTo(2, 10);
  });

  it('accepts explicit speed overrides', () => {
    const result = estimateTimeSec({ drawMm: 100, travelMm: 100 }, { drawSpeed: 50, travelSpeed: 100 });
    expect(result).toBeCloseTo(3, 10); // 100/50 + 100/100
  });

  it('handles zero draw and zero travel', () => {
    expect(estimateTimeSec({ drawMm: 0, travelMm: 0 })).toBe(0);
  });
});
