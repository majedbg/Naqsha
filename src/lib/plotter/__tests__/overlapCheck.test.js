import { describe, it, expect } from 'vitest';
import { countOverlaps } from '../overlapCheck.js';

// Drive `intersect` indirectly through countOverlaps (intersect is module-private).

describe('countOverlaps / intersect', () => {
  // ---- near-miss (non-intersecting) ----
  it('returns count=0 for two parallel horizontal segments', () => {
    const paths = [
      { points: [[0, 0], [10, 0]] },
      { points: [[0, 5], [10, 5]] },
    ];
    const { count } = countOverlaps(paths);
    expect(count).toBe(0);
  });

  it('returns count=0 for two non-overlapping collinear segments', () => {
    const paths = [
      { points: [[0, 0], [5, 0]] },
      { points: [[6, 0], [10, 0]] },
    ];
    const { count } = countOverlaps(paths);
    expect(count).toBe(0);
  });

  // ---- cardinal cross (proper X intersection) ----
  it('counts 1 for a cardinal cross (+)', () => {
    // Horizontal: (0,5)-(10,5), Vertical: (5,0)-(5,10) — cross at (5,5)
    const paths = [
      { points: [[0, 5], [10, 5]] },
      { points: [[5, 0], [5, 10]] },
    ];
    const { count, samples } = countOverlaps(paths);
    expect(count).toBe(1);
    expect(samples[0][0]).toBeCloseTo(5, 5);
    expect(samples[0][1]).toBeCloseTo(5, 5);
  });

  // ---- T-junction (mid-segment contact, NOT a shared endpoint) ----
  it('counts 1 for a T-junction', () => {
    // Horizontal: (0,0)-(10,0), Vertical: (5,0)-(5,5) — T at (5,0)
    // The touch point is the START of segment B and a MID-POINT of segment A,
    // so the shares() check (shared endpoints) does NOT suppress it.
    const paths = [
      { points: [[0, 0], [10, 0]] },
      { points: [[5, 0], [5, 5]] },
    ];
    const { count } = countOverlaps(paths);
    expect(count).toBe(1);
  });

  // ---- shared endpoint suppression ----
  it('does NOT count a shared endpoint as an intersection', () => {
    // A ends at (5,0), B starts at (5,0) — the shares() check suppresses this
    const paths = [
      { points: [[0, 0], [5, 0]] },
      { points: [[5, 0], [10, 5]] },
    ];
    const { count } = countOverlaps(paths);
    expect(count).toBe(0);
  });

  // ---- truncation at MAX_SEGMENTS (3000) ----
  it('sets truncated=true when segment count exceeds 3000', () => {
    // One path with 3001 points → 3000 segments → triggers truncation
    const pts = [];
    for (let i = 0; i <= 3001; i++) pts.push([i, i % 2 === 0 ? 0 : 1]);
    const paths = [{ points: pts }];
    const result = countOverlaps(paths);
    expect(result.truncated).toBe(true);
    expect(result.segmentCount).toBe(3000); // capped, not over
  });

  it('returns truncated=false for a small input', () => {
    const paths = [{ points: [[0, 0], [1, 1], [2, 0]] }];
    const { truncated } = countOverlaps(paths);
    expect(truncated).toBe(false);
  });

  // ---- empty / trivial inputs ----
  it('handles empty paths array', () => {
    const r = countOverlaps([]);
    expect(r.count).toBe(0);
    expect(r.segmentCount).toBe(0);
  });

  it('ignores paths with fewer than 2 points', () => {
    const r = countOverlaps([{ points: [[0, 0]] }, { points: [] }]);
    expect(r.count).toBe(0);
  });

  // ---- known overlap count ----
  it('counts multiple intersections for a star pattern', () => {
    // Two X-patterns stacked: 2 crosses × 1 intersection each = 2
    const makeX = (cx, cy, r) => [
      { points: [[cx - r, cy - r], [cx + r, cy + r]] },
      { points: [[cx - r, cy + r], [cx + r, cy - r]] },
    ];
    const paths = [...makeX(0, 0, 5), ...makeX(20, 0, 5)];
    const { count } = countOverlaps(paths);
    expect(count).toBe(2);
  });
});
