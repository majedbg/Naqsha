// TileComposer (S5, issue #54) — lattice → tile placements over a region.
//
// Ground-truth tests per PRD #48: tile + lattice → expected cell count and
// positions; general (oblique) bases covered; degenerate lattices are capped,
// never an infinite loop.

import { describe, it, expect } from 'vitest';
import { tilePlacements, MAX_TILE_PLACEMENTS } from './tileComposer';

const rectLattice = (w, h) => ({
  t1: [w, 0],
  t2: [0, h],
  cell: { width: w, height: h },
  type: 'rect',
  confidence: 1,
});

describe('tilePlacements', () => {
  it('covers an exact axis-aligned grid with the expected count and positions', () => {
    const placements = tilePlacements(rectLattice(25, 30), { width: 100, height: 60 });
    // 4 columns × 2 rows, anchored at (0,0)
    expect(placements).toHaveLength(8);
    expect(placements).toContainEqual({ x: 0, y: 0 });
    expect(placements).toContainEqual({ x: 75, y: 30 });
    expect(placements).not.toContainEqual({ x: 100, y: 0 });
  });

  it('adds a partial column/row when the region is not a multiple of the cell', () => {
    const placements = tilePlacements(rectLattice(25, 30), { width: 101, height: 61 });
    // 5 columns (last partial) × 3 rows (last partial)
    expect(placements).toHaveLength(15);
    expect(placements).toContainEqual({ x: 100, y: 60 });
  });

  it('returns placements in deterministic row-major order', () => {
    const placements = tilePlacements(rectLattice(50, 50), { width: 100, height: 100 });
    expect(placements).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 0, y: 50 },
      { x: 50, y: 50 },
    ]);
  });

  it('covers the region with an oblique basis (every placement intersects, region fully spanned)', () => {
    const lattice = {
      t1: [40, 0],
      t2: [15, 35],
      cell: { width: 55, height: 35 },
      type: 'oblique',
      confidence: 1,
    };
    const region = { width: 120, height: 100 };
    const placements = tilePlacements(lattice, region);
    expect(placements.length).toBeGreaterThan(6);
    // Every placement's cell bbox intersects the region…
    for (const { x, y } of placements) {
      expect(x).toBeLessThan(region.width);
      expect(y).toBeLessThan(region.height);
      expect(x + lattice.cell.width).toBeGreaterThan(0);
      expect(y + lattice.cell.height).toBeGreaterThan(0);
    }
    // …and skewed rows actually shift: some placement has a negative x
    // (the j-th row starts left of the region and slides in).
    expect(placements.some((p) => p.x < 0)).toBe(true);
  });

  it('single-cell region → exactly one placement at the origin', () => {
    expect(tilePlacements(rectLattice(50, 50), { width: 50, height: 50 })).toEqual([
      { x: 0, y: 0 },
    ]);
  });

  it('caps the placement count for absurdly small cells (no runaway loops)', () => {
    const placements = tilePlacements(rectLattice(2, 2), { width: 4000, height: 4000 });
    expect(placements.length).toBeLessThanOrEqual(MAX_TILE_PLACEMENTS);
  });

  it('throws on an invalid lattice rather than looping', () => {
    expect(() =>
      tilePlacements(
        { t1: [10, 0], t2: [20, 0], cell: { width: 10, height: 10 }, type: 'rect', confidence: 1 },
        { width: 100, height: 100 }
      )
    ).toThrow();
    expect(() =>
      tilePlacements(
        { t1: [NaN, 0], t2: [0, 10], cell: { width: 10, height: 10 }, type: 'rect', confidence: 1 },
        { width: 100, height: 100 }
      )
    ).toThrow();
  });

  it('returns an empty list for an empty region', () => {
    expect(tilePlacements(rectLattice(25, 25), { width: 0, height: 0 })).toEqual([]);
  });
});
