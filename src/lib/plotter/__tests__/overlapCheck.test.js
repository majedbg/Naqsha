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

// ── determinism under permutation (the truncation-honesty contract) ──────────
//
// Physical overlap is a property of the geometry laid on the sheet, NOT of the
// order the paths are drawn in — permuting or reversing paths cannot change how
// often the plot crosses itself. So countOverlaps must return the SAME count
// for the same multiset of segments regardless of input order, even when the
// MAX_SEGMENTS cap engages. The legacy cap took the first 3000 segments in
// input order, which made the count order-dependent: the Reorder optimization
// permuted paths, the cap sampled a different subset, and the Run Plan's
// overlaps warning collapsed (e.g. 85 → 0) with no geometric change.
describe('countOverlaps — deterministic under path permutation when truncated', () => {
  // 40 X-crosses in the left band (80 single-segment paths → 40 true crossings)
  // plus 3000 crossing-free parallel segments far to the right: 3080 segments
  // total, exceeding the 3000 cap so truncation MUST engage.
  const makeX = (cx, cy, r) => [
    { points: [[cx - r, cy - r], [cx + r, cy + r]] },
    { points: [[cx - r, cy + r], [cx + r, cy - r]] },
  ];
  const crosses = [];
  for (let i = 0; i < 40; i++) crosses.push(...makeX(100 + i * 20, 100, 5));
  const parallels = [];
  for (let i = 0; i < 3000; i++) {
    parallels.push({ points: [[10000, i * 2], [10010, i * 2]] });
  }

  it('same count whether the crossing paths come first or last', () => {
    const crossesFirst = countOverlaps([...crosses, ...parallels]);
    const crossesLast = countOverlaps([...parallels, ...crosses]);
    // The cap engages either way…
    expect(crossesFirst.truncated).toBe(true);
    expect(crossesLast.truncated).toBe(true);
    // …but the count is a property of the geometry, not of path order.
    expect(crossesLast.count).toBe(crossesFirst.count);
    // And the truncated count stays a meaningful lower bound, not zero.
    expect(crossesFirst.count).toBeGreaterThan(0);
  });

  it('same count when every path is direction-reversed (Reorder may flip paths)', () => {
    const reversed = [...parallels, ...crosses].map((p) => ({
      ...p, points: [...p.points].reverse(),
    }));
    const forward = countOverlaps([...crosses, ...parallels]);
    const flipped = countOverlaps(reversed);
    expect(flipped.truncated).toBe(true);
    expect(flipped.count).toBe(forward.count);
  });

  it('does NOT flag truncated at exactly MAX_SEGMENTS (nothing was dropped)', () => {
    // 3001 points → exactly 3000 segments: every segment is tested, so the
    // count is exact and truncated must be false.
    const pts = [];
    for (let i = 0; i <= 3000; i++) pts.push([i, i % 2 === 0 ? 0 : 1]);
    const result = countOverlaps([{ points: pts }]);
    expect(result.segmentCount).toBe(3000);
    expect(result.truncated).toBe(false);
  });
});
