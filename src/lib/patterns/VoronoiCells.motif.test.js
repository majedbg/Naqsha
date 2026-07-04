// Motif host-geometry capture for VoronoiCells (the drawn-geometry seam).
//
// VoronoiCells stashes its FINAL resolved cells on `instance.motifHostGeometry`
// during generate(), in CANVAS-PIXEL (top-left origin) frame, so a Motif layer
// adorning a voronoi host can place glyphs on its real cells/vertices/edges.
//
// The frame math is HAND-AUTHORED here (never reusing the implementation's
// conversion) so a centered-frame or missing-offset bug is caught:
//   world = centeredVertex + (canvasW/2 + offsetX, canvasH/2 + offsetY)
//
// Determinism lever: jitter:0 + relaxationSteps:0 places sites on an EXACT grid
// (the ctx.random jitter term is multiplied by jitterFactor=0), so a site's
// centered coordinate is a closed-form function of the grid formula — derivable
// independently of the triangulation.

import { describe, it, expect } from 'vitest';
import VoronoiCells from './VoronoiCells.js';
import { RecordingContext } from './drawingContext.js';

const W = 800;
const H = 600;

// Hand-derived, from VoronoiCells' own site-placement formula (jitter=0):
//   cols = ceil(sqrt(cellCount * W/H)); rows = ceil(cellCount/cols)
//   spacingX = W/cols; spacingY = H/rows
//   centeredX(c) = -W/2 + (c + 0.5) * spacingX
//   centeredY(r) = -H/2 + (r + 0.5) * spacingY
// For cellCount=12, W=800, H=600 → cols=4, rows=3, spacingX=200, spacingY=200.
// So the interior seed at (c=1, r=1) sits at centered (-100, 0).
function gen(params) {
  const inst = new VoronoiCells();
  inst.generateWithContext(
    new RecordingContext({ seed: 1 }),
    42,
    { cellCount: 12, jitter: 0, relaxationSteps: 0, symmetry: 'none', ...params },
    W,
    H,
    '#000000',
    100
  );
  return inst;
}

describe('VoronoiCells motif host-geometry capture', () => {
  it('stashes drawnCells as a non-empty array of {vertices:[{x,y}..], site:{x,y}}', () => {
    const inst = gen();
    const dc = inst.motifHostGeometry.drawnCells;
    expect(Array.isArray(dc)).toBe(true);
    expect(dc.length).toBeGreaterThan(0);
    for (const cell of dc) {
      expect(Array.isArray(cell.vertices)).toBe(true);
      expect(cell.vertices.length).toBeGreaterThanOrEqual(3);
      for (const v of cell.vertices) {
        expect(typeof v.x).toBe('number');
        expect(typeof v.y).toBe('number');
      }
      expect(typeof cell.site.x).toBe('number');
      expect(typeof cell.site.y).toBe('number');
    }
  });

  it('emits vertices in CANVAS-PIXEL frame (all within [0,W]x[0,H], NOT centered)', () => {
    // A centered-frame bug would put ~half the vertices at negative coords.
    const dc = gen().motifHostGeometry.drawnCells;
    for (const cell of dc) {
      for (const v of cell.vertices) {
        expect(v.x).toBeGreaterThanOrEqual(0);
        expect(v.x).toBeLessThanOrEqual(W);
        expect(v.y).toBeGreaterThanOrEqual(0);
        expect(v.y).toBeLessThanOrEqual(H);
      }
    }
  });

  it('mean vertex sits near the canvas center (coarse frame sanity)', () => {
    const dc = gen().motifHostGeometry.drawnCells;
    let sx = 0, sy = 0, n = 0;
    for (const cell of dc) for (const v of cell.vertices) { sx += v.x; sy += v.y; n++; }
    // A missing +W/2,+H/2 would center the mean near (0,0); require it near
    // canvas center within a quarter-canvas margin.
    expect(sx / n).toBeGreaterThan(W / 2 - W / 4);
    expect(sx / n).toBeLessThan(W / 2 + W / 4);
    expect(sy / n).toBeGreaterThan(H / 2 - H / 4);
    expect(sy / n).toBeLessThan(H / 2 + H / 4);
  });

  it('a known interior seed lands at its INDEPENDENTLY-derived world coordinate', () => {
    const dc = gen().motifHostGeometry.drawnCells;
    // Seed (c=1, r=1): centered (-100, 0). World (offset=0):
    //   worldX = -100 + W/2 = 300 ; worldY = 0 + H/2 = 300
    const EXPECT = { x: -100 + W / 2, y: 0 + H / 2 }; // = (300, 300)
    const match = dc.find(
      (c) => Math.abs(c.site.x - EXPECT.x) < 1e-6 && Math.abs(c.site.y - EXPECT.y) < 1e-6
    );
    expect(match).toBeTruthy();
    // Every surviving site must also be a grid point in world frame: subtract the
    // hand-written frame shift and confirm it's one of the expected grid values.
    const cols = 4, rows = 3, spacingX = W / cols, spacingY = H / rows;
    const expectX = [];
    for (let c = 0; c < cols; c++) expectX.push(-W / 2 + (c + 0.5) * spacingX + W / 2);
    const expectY = [];
    for (let r = 0; r < rows; r++) expectY.push(-H / 2 + (r + 0.5) * spacingY + H / 2);
    for (const cell of dc) {
      expect(expectX.some((x) => Math.abs(cell.site.x - x) < 1e-6)).toBe(true);
      expect(expectY.some((y) => Math.abs(cell.site.y - y) < 1e-6)).toBe(true);
    }
  });

  it('applies the offsetX/offsetY term (differential vs offset=0)', () => {
    const D = 37, E = -19;
    const base = gen().motifHostGeometry.drawnCells;
    const shifted = gen({ offsetX: D, offsetY: E }).motifHostGeometry.drawnCells;
    // Sites are identical up to the offset translation (same seed/config).
    const findSite = (cells, x, y) =>
      cells.find((c) => Math.abs(c.site.x - x) < 1e-6 && Math.abs(c.site.y - y) < 1e-6);
    const baseInterior = findSite(base, 300, 300);
    expect(baseInterior).toBeTruthy();
    const shiftedInterior = findSite(shifted, 300 + D, 300 + E);
    expect(shiftedInterior).toBeTruthy();
  });

  it('is deterministic — repeated generation yields identical drawnCells', () => {
    expect(gen().motifHostGeometry.drawnCells).toEqual(gen().motifHostGeometry.drawnCells);
  });

  it('captures cells for every drawMode (behaviour-independent stash)', () => {
    for (const drawMode of ['outlines', 'both', 'delaunay', 'spokes']) {
      const dc = gen({ drawMode }).motifHostGeometry.drawnCells;
      expect(dc.length).toBeGreaterThan(0);
    }
  });
});
