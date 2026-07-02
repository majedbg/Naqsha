// TileComposer — tile a repeat cell across a target region via its lattice
// (S5, issue #54; PRD #48 "CV/geometry core": `TileComposer.compose(tile,
// lattice, targetRegion)`).
//
// The composable core is PLACEMENTS: the integer lattice combinations
// i·t1 + j·t2 whose cell bounding box intersects the region. Rendering is the
// caller's business — ExtractedPatternGenerator stamps the tile's paths at
// each placement on both the p5 canvas and the exported SVG, and the Review
// preview does the same in React — so the geometry lives in exactly one
// place and every surface tiles identically.
//
// Pure + serializable end to end. Every lattice is validated on the way in
// (stored rows are attacker-writable; a NaN/collinear basis must throw, not
// loop). SEAM (v2, PRD decision 10): the deformable path adds a per-cell
// transform field alongside each placement — the placement list is where a
// {x, y, warp} record would grow.

import { validateLattice } from './lattice';

/**
 * Hard cap on placements: a degenerate-but-valid lattice (tiny cell, huge
 * canvas) must never freeze the render loop. 2048 copies is far beyond any
 * legible tiling; beyond it the grid is truncated deterministically (row-major
 * from the region origin).
 */
export const MAX_TILE_PLACEMENTS = 2048;

/**
 * All lattice placements whose cell bbox intersects the region.
 *
 * The grid is ANCHORED at (0,0) — placement {x:0, y:0} is always part of the
 * lattice — and covers [0, width) × [0, height). Order is deterministic:
 * ascending j (rows), then ascending i.
 *
 * @param {{t1:[number,number], t2:[number,number], cell:{width,height}}} lattice
 * @param {{width: number, height: number}} region
 * @returns {{x: number, y: number}[]}
 */
export function tilePlacements(lattice, region) {
  const lat = validateLattice(lattice);
  if (!lat) return [];
  const { t1, t2, cell } = lat;
  const width = Number(region?.width) || 0;
  const height = Number(region?.height) || 0;
  if (width <= 0 || height <= 0) return [];

  // Invert the basis to bound (i, j) over the region corners, padded by one
  // cell so partially-overlapping edge copies are included.
  const det = t1[0] * t2[1] - t1[1] * t2[0]; // non-zero: validated non-collinear
  const corners = [
    [-cell.width, -cell.height],
    [width, -cell.height],
    [-cell.width, height],
    [width, height],
  ];
  let iMin = Infinity;
  let iMax = -Infinity;
  let jMin = Infinity;
  let jMax = -Infinity;
  for (const [x, y] of corners) {
    const i = (x * t2[1] - y * t2[0]) / det;
    const j = (y * t1[0] - x * t1[1]) / det;
    iMin = Math.min(iMin, Math.floor(i));
    iMax = Math.max(iMax, Math.ceil(i));
    jMin = Math.min(jMin, Math.floor(j));
    jMax = Math.max(jMax, Math.ceil(j));
  }

  const placements = [];
  for (let j = jMin; j <= jMax; j++) {
    for (let i = iMin; i <= iMax; i++) {
      const x = i * t1[0] + j * t2[0];
      const y = i * t1[1] + j * t2[1];
      if (x < width && y < height && x + cell.width > 0 && y + cell.height > 0) {
        placements.push({ x, y });
        if (placements.length >= MAX_TILE_PLACEMENTS) return placements;
      }
    }
  }
  return placements;
}
