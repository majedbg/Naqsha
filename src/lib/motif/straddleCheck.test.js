import { describe, it, expect } from 'vitest';
import { straddleCheck } from './straddleCheck.js';

describe('straddleCheck', () => {
  it('flags a placement centered exactly on a boundary (distance 0 < radius)', () => {
    const placements = [{ anchorId: 'a1', index: 0, x: 5, y: 0, radius: 3 }];
    const boundarySegments = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }];
    const result = straddleCheck(placements, boundarySegments);
    expect(result).toEqual([{ index: 0, anchorId: 'a1', distance: 0, straddles: true }]);
  });

  it('does not flag a placement far from all boundaries', () => {
    const placements = [{ anchorId: 'a1', index: 0, x: 100, y: 100, radius: 2 }];
    const boundarySegments = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }];
    expect(straddleCheck(placements, boundarySegments)).toEqual([]);
  });

  it('flags a placement whose center is just inside its radius of a segment', () => {
    // distance from (5, 1) to the segment y=0 (x in [0,10]) is 1; radius 1.5 > 1
    const placements = [{ anchorId: 'a2', index: 0, x: 5, y: 1, radius: 1.5 }];
    const boundarySegments = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }];
    const result = straddleCheck(placements, boundarySegments);
    expect(result).toEqual([{ index: 0, anchorId: 'a2', distance: 1, straddles: true }]);
  });

  it('does NOT flag a footprint exactly tangent to a boundary (distance === radius, strict <)', () => {
    // distance from (5, 2) to segment y=0 is exactly 2; radius is exactly 2 -> tangent, not straddling
    const placements = [{ anchorId: 'a3', index: 0, x: 5, y: 2, radius: 2 }];
    const boundarySegments = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }];
    expect(straddleCheck(placements, boundarySegments)).toEqual([]);
  });

  it('returns the correct subset, in placement order, for multiple placements and segments', () => {
    const placements = [
      { anchorId: 'p0', index: 0, x: 5, y: 0, radius: 1 }, // straddles seg0 (dist 0)
      { anchorId: 'p1', index: 1, x: 100, y: 100, radius: 1 }, // far from everything
      { anchorId: 'p2', index: 2, x: 0, y: 5, radius: 2 }, // straddles seg1 (dist to x=0 line segment)
      { anchorId: 'p3', index: 3, x: 50, y: 50, radius: 1 }, // far
    ];
    const boundarySegments = [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, // seg0: along y=0, x in [0,10]
      { a: { x: 0, y: 0 }, b: { x: 0, y: 10 } }, // seg1: along x=0, y in [0,10]
    ];
    const result = straddleCheck(placements, boundarySegments);
    expect(result).toEqual([
      { index: 0, anchorId: 'p0', distance: 0, straddles: true },
      { index: 2, anchorId: 'p2', distance: 0, straddles: true },
    ]);
  });

  it('returns [] for empty placements', () => {
    expect(straddleCheck([], [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }])).toEqual([]);
  });

  it('returns [] for empty boundarySegments', () => {
    expect(straddleCheck([{ anchorId: 'a1', index: 0, x: 5, y: 0, radius: 3 }], [])).toEqual([]);
  });

  it('returns [] when both placements and boundarySegments are empty', () => {
    expect(straddleCheck([], [])).toEqual([]);
  });

  it('is deterministic across repeated calls with the same input', () => {
    const placements = [
      { anchorId: 'p0', index: 0, x: 5, y: 0, radius: 1 },
      { anchorId: 'p1', index: 1, x: 100, y: 100, radius: 1 },
    ];
    const boundarySegments = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }];
    const first = straddleCheck(placements, boundarySegments);
    const second = straddleCheck(placements, boundarySegments);
    expect(first).toEqual(second);
  });

  it('picks the nearest-boundary distance among multiple segments', () => {
    const placements = [{ anchorId: 'a1', index: 0, x: 5, y: 0.5, radius: 1 }];
    const boundarySegments = [
      { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, // distance 0.5
      { a: { x: 0, y: 100 }, b: { x: 10, y: 100 } }, // distance 99.5
    ];
    const result = straddleCheck(placements, boundarySegments);
    expect(result).toEqual([{ index: 0, anchorId: 'a1', distance: 0.5, straddles: true }]);
  });
});
