import { describe, it, expect } from 'vitest';
import { rasterizeTile, iou, RASTER_GRID } from './raster';
import {
  starFixture,
  floralFixture,
  randomFixture,
  calligraphicFixture,
} from './families/__testFixtures';

describe('rasterizeTile + iou', () => {
  it('rasterizes into a grid×grid binary buffer with some ink', () => {
    const grid = rasterizeTile(starFixture(8));
    expect(grid).toHaveLength(RASTER_GRID * RASTER_GRID);
    const ink = grid.reduce((s, v) => s + v, 0);
    expect(ink).toBeGreaterThan(0);
  });

  it('iou(a,a) === 1 for a non-empty tile; disjoint tiles → 0', () => {
    const a = rasterizeTile(starFixture(8));
    expect(iou(a, a)).toBe(1);
    // A tile with a single dot far away vs a star → near-zero overlap.
    const dot = rasterizeTile({ width: 100, height: 100, fills: [], strokes: [{ d: 'M2 2 L3 3', role: 'score' }] });
    expect(iou(a, dot)).toBeLessThan(0.05);
  });

  it('empty ∪ empty → 0 (never a spurious 1)', () => {
    const empty = new Uint8Array(RASTER_GRID * RASTER_GRID);
    expect(iou(empty, empty)).toBe(0);
  });

  it('DISCRIMINATES: star-vs-same-star IoU >> star-vs-nonstar IoU', () => {
    const star = rasterizeTile(starFixture(8, 45));
    const starSame = rasterizeTile(starFixture(8, 45));
    const floral = rasterizeTile(floralFixture(8));
    const random = rasterizeTile(randomFixture(7));
    const calli = rasterizeTile(calligraphicFixture());
    expect(iou(star, starSame)).toBe(1);
    // Every non-star sits well below any star self-overlap — the structural gap.
    expect(iou(star, floral)).toBeLessThan(0.5);
    expect(iou(star, random)).toBeLessThan(0.5);
    expect(iou(star, calli)).toBeLessThan(0.5);
  });
});
