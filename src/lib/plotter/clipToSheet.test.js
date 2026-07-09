import { describe, it, expect } from 'vitest';
import { clipToSheet } from './clipToSheet.js';

// A 10x10 px Sheet anchored at the origin, reused across cases. The pattern
// classes draw relative to the canvas origin so x/y default to 0 (see the
// Sheet-rect contract in clipToSheet.js).
const SHEET = { x: 0, y: 0, width: 10, height: 10 };

// ---------------------------------------------------------------------------
// Fully inside the Sheet — kept unchanged, never counted as cropped.
// ---------------------------------------------------------------------------
describe('clipToSheet — path fully inside the Sheet', () => {
  it('keeps an open path unchanged and reports zero cropped', () => {
    const path = { points: [[2, 2], [8, 2], [8, 8]], closed: false };
    const { kept, dropped, croppedPathCount } = clipToSheet([path], SHEET);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toBe(path); // "unchanged" is literal — the same reference
    expect(kept[0].points).toEqual([[2, 2], [8, 2], [8, 8]]);
    expect(kept[0].closed).toBe(false);
    expect(dropped).toHaveLength(0);
    expect(croppedPathCount).toBe(0);
  });

  it('keeps a closed path closed (fully inside is not a crossing)', () => {
    const path = { points: [[2, 2], [8, 2], [8, 8], [2, 2]], closed: true };
    const { kept, croppedPathCount } = clipToSheet([path], SHEET);
    expect(kept).toHaveLength(1);
    expect(kept[0].closed).toBe(true);
    expect(kept[0].points).toEqual([[2, 2], [8, 2], [8, 8], [2, 2]]);
    expect(croppedPathCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fully outside the Sheet — culled to `dropped`, absent from `kept`.
// ---------------------------------------------------------------------------
describe('clipToSheet — path fully outside the Sheet', () => {
  it('culls the original into dropped and does not count it as cropped', () => {
    const path = { points: [[20, 20], [30, 25]], closed: false };
    const { kept, dropped, croppedPathCount } = clipToSheet([path], SHEET);
    expect(kept).toHaveLength(0);
    expect(dropped).toContain(path); // the ORIGINAL object, not a clone
    expect(croppedPathCount).toBe(0); // fully gone is not "cropped at the edge"
  });
});

// ---------------------------------------------------------------------------
// Crossing an edge — split at the boundary, counts once as cropped.
// ---------------------------------------------------------------------------
describe('clipToSheet — path crossing the Sheet edge', () => {
  it('splits an open path at the boundary and increments croppedPathCount', () => {
    // Horizontal segment entering the left edge at x=0 (y=5).
    const path = { points: [[-5, 5], [5, 5]], closed: false };
    const { kept, dropped, croppedPathCount } = clipToSheet([path], SHEET);
    expect(kept).toHaveLength(1);
    expect(kept[0].points).toEqual([[0, 5], [5, 5]]);
    expect(dropped).toHaveLength(0);
    expect(croppedPathCount).toBe(1);
  });

  it('preserves color on the clipped fragment', () => {
    const path = { points: [[-5, 5], [5, 5]], closed: false, color: '#ff0000' };
    const { kept } = clipToSheet([path], SHEET);
    expect(kept[0].color).toBe('#ff0000');
  });
});

// ---------------------------------------------------------------------------
// Closed path crossing — becomes OPEN interior arcs. The seam vertex trap:
// points[0] is INTERIOR, so a naive open-polyline walk over the ring would
// spuriously split the arc passing through the start vertex into two fragments.
// ---------------------------------------------------------------------------
describe('clipToSheet — closed path crossing the Sheet edge', () => {
  it('yields ONE open arc when the seam vertex is interior (no false split)', () => {
    // Triangle: [5,5] interior, [5,15] above the Sheet, [9,5] interior.
    const path = { points: [[5, 5], [5, 15], [9, 5]], closed: true };
    const { kept, croppedPathCount } = clipToSheet([path], SHEET);
    expect(kept).toHaveLength(1);
    expect(kept[0].closed).toBe(false); // a clipped ring is open
    expect(kept[0].points).toEqual([[7, 10], [9, 5], [5, 5], [5, 10]]);
    expect(croppedPathCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Multiple crossings — ONE original yields MULTIPLE kept fragments.
// ---------------------------------------------------------------------------
describe('clipToSheet — path crossing the Sheet multiple times', () => {
  it('produces multiple fragments but counts the original as cropped once', () => {
    // Enter left, exit top, re-enter top, exit right.
    const path = {
      points: [[-5, 5], [5, 5], [5, 15], [8, 15], [8, 5], [15, 5]],
      closed: false,
    };
    const { kept, croppedPathCount } = clipToSheet([path], SHEET);
    expect(kept).toHaveLength(2);
    expect(kept[0].points).toEqual([[0, 5], [5, 5], [5, 10]]);
    expect(kept[1].points).toEqual([[8, 10], [8, 5], [10, 5]]);
    expect(croppedPathCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Boundary inclusive — a path exactly ON an edge is inside the Sheet.
// ---------------------------------------------------------------------------
describe('clipToSheet — path exactly on the Sheet edge', () => {
  it('keeps an edge-aligned path unchanged (boundaries are inclusive)', () => {
    const path = { points: [[0, 0], [10, 0]], closed: false }; // top edge y=0
    const { kept, dropped, croppedPathCount } = clipToSheet([path], SHEET);
    expect(kept).toHaveLength(1);
    expect(kept[0].points).toEqual([[0, 0], [10, 0]]);
    expect(dropped).toHaveLength(0);
    expect(croppedPathCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Degenerate input — <2 points is malformed, never fabricable.
// ---------------------------------------------------------------------------
describe('clipToSheet — degenerate paths', () => {
  it('never keeps a single-point path and does not throw', () => {
    const single = { points: [[5, 5]], closed: false };
    const empty = { points: [], closed: false };
    let result;
    expect(() => { result = clipToSheet([single, empty], SHEET); }).not.toThrow();
    expect(result.kept).toHaveLength(0);
    expect(result.croppedPathCount).toBe(0);
    // Documented choice: degenerate originals are culled to `dropped`.
    expect(result.dropped).toContain(single);
    expect(result.dropped).toContain(empty);
  });
});

// ---------------------------------------------------------------------------
// Mixed batch — the counts stay consistent across a realistic Operation.
// ---------------------------------------------------------------------------
describe('clipToSheet — mixed batch', () => {
  it('classifies inside / crossing / outside independently', () => {
    const inside = { points: [[2, 2], [8, 8]], closed: false };
    const crossing = { points: [[-5, 5], [5, 5]], closed: false };
    const outside = { points: [[50, 50], [60, 60]], closed: false };
    const { kept, dropped, croppedPathCount } = clipToSheet(
      [inside, crossing, outside],
      SHEET
    );
    expect(kept).toHaveLength(2); // inside (unchanged) + crossing fragment
    expect(dropped).toContain(outside);
    expect(croppedPathCount).toBe(1); // only the crossing original
  });

  it('returns empty results for an empty input array', () => {
    expect(clipToSheet([], SHEET)).toEqual({
      kept: [],
      dropped: [],
      croppedPathCount: 0,
    });
  });
});
