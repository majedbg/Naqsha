// Motif host-geometry capture for VoronoiCells (the DRAWN-EDGE seam).
//
// VoronoiCells stashes its FINAL Voronoi geometry on `instance.motifHostGeometry`
// during generate(), in CANVAS-PIXEL (top-left origin) frame, so a Motif layer
// adorning a voronoi host can place glyphs on its real drawn edges/vertices and
// its cell sites. BOUNDARY HARDENING: the stash is now the ACTUAL DRAWN Voronoi
// segments (voronoiEdges) — not clamped/closed cell polygons — so downstream
// crossing/edge anchors sit on visible lines with no phantom outer-ring geometry.
//   motifHostGeometry = { drawnEdges: [{x1,y1,x2,y2}..], sites: [{x,y}..] }
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
const CX = W / 2;
const CY = H / 2;

// Hand-derived, from VoronoiCells' own site-placement formula (jitter=0):
//   cols = ceil(sqrt(cellCount * W/H)); rows = ceil(cellCount/cols)
//   spacingX = W/cols; spacingY = H/rows
//   centeredX(c) = -W/2 + (c + 0.5) * spacingX
//   centeredY(r) = -H/2 + (r + 0.5) * spacingY
// For cellCount=12, W=800, H=600 → cols=4, rows=3, spacingX=200, spacingY=200.
// So the interior seed at (c=1, r=1) sits at centered (-100, 0).
function gen(params) {
  const inst = new VoronoiCells();
  const ctx = new RecordingContext({ seed: 1 });
  inst.generateWithContext(
    ctx,
    42,
    { cellCount: 12, jitter: 0, relaxationSteps: 0, symmetry: 'none', ...params },
    W,
    H,
    '#000000',
    100
  );
  return { inst, ctx };
}

describe('VoronoiCells motif host-geometry capture (DRAWN-EDGE seam)', () => {
  it('stashes drawnEdges as a non-empty array of {x1,y1,x2,y2} and sites of {x,y}', () => {
    const { inst } = gen();
    const { drawnEdges, sites } = inst.motifHostGeometry;
    expect(Array.isArray(drawnEdges)).toBe(true);
    expect(drawnEdges.length).toBeGreaterThan(0);
    for (const e of drawnEdges) {
      for (const k of ['x1', 'y1', 'x2', 'y2']) expect(typeof e[k]).toBe('number');
    }
    expect(Array.isArray(sites)).toBe(true);
    expect(sites.length).toBeGreaterThan(0);
    for (const s of sites) {
      expect(typeof s.x).toBe('number');
      expect(typeof s.y).toBe('number');
    }
  });

  it('emits edge endpoints + sites in CANVAS-PIXEL frame (all within [0,W]x[0,H])', () => {
    // A centered-frame bug would put coords at negative values. Drawn edges are
    // clipped to bounds, so endpoints are within [0,W]x[0,H] (inclusive).
    const { drawnEdges, sites } = gen().inst.motifHostGeometry;
    for (const e of drawnEdges) {
      for (const [x, y] of [[e.x1, e.y1], [e.x2, e.y2]]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(H);
      }
    }
    for (const s of sites) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(W);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(H);
    }
  });

  it('drawnEdges ARE the drawn line() segments (frame-shifted) in outlines mode', () => {
    // The boundary-hardening claim, verified against the recorder: every drawn
    // Voronoi segment in outlines mode has a matching stash entry at world =
    // centered + (CX, CY). This ties the stash to what is actually rendered.
    const { inst, ctx } = gen({ drawMode: 'outlines' });
    const drawnLines = ctx.calls
      .filter((c) => c.op === 'line')
      .map((c) => c.args);
    const { drawnEdges } = inst.motifHostGeometry;
    expect(drawnLines.length).toBe(drawnEdges.length);
    // Order is preserved (both derive from voronoiEdges in order).
    drawnLines.forEach(([x1, y1, x2, y2], i) => {
      const e = drawnEdges[i];
      expect(e.x1).toBeCloseTo(x1 + CX, 6);
      expect(e.y1).toBeCloseTo(y1 + CY, 6);
      expect(e.x2).toBeCloseTo(x2 + CX, 6);
      expect(e.y2).toBeCloseTo(y2 + CY, 6);
    });
  });

  it('a known interior seed lands at its INDEPENDENTLY-derived world coordinate', () => {
    const { sites } = gen().inst.motifHostGeometry;
    // Seed (c=1, r=1): centered (-100, 0). World (offset=0):
    //   worldX = -100 + W/2 = 300 ; worldY = 0 + H/2 = 300
    const EXPECT = { x: -100 + W / 2, y: 0 + H / 2 }; // = (300, 300)
    const match = sites.find(
      (s) => Math.abs(s.x - EXPECT.x) < 1e-6 && Math.abs(s.y - EXPECT.y) < 1e-6
    );
    expect(match).toBeTruthy();
    // Every surviving site must be a grid point in world frame.
    const cols = 4, rows = 3, spacingX = W / cols, spacingY = H / rows;
    const expectX = [];
    for (let c = 0; c < cols; c++) expectX.push(-W / 2 + (c + 0.5) * spacingX + W / 2);
    const expectY = [];
    for (let r = 0; r < rows; r++) expectY.push(-H / 2 + (r + 0.5) * spacingY + H / 2);
    for (const s of sites) {
      expect(expectX.some((x) => Math.abs(s.x - x) < 1e-6)).toBe(true);
      expect(expectY.some((y) => Math.abs(s.y - y) < 1e-6)).toBe(true);
    }
  });

  it('applies the offsetX/offsetY term (differential vs offset=0)', () => {
    const D = 37, E = -19;
    const base = gen().inst.motifHostGeometry.sites;
    const shifted = gen({ offsetX: D, offsetY: E }).inst.motifHostGeometry.sites;
    const findSite = (sites, x, y) =>
      sites.find((s) => Math.abs(s.x - x) < 1e-6 && Math.abs(s.y - y) < 1e-6);
    expect(findSite(base, 300, 300)).toBeTruthy();
    expect(findSite(shifted, 300 + D, 300 + E)).toBeTruthy();
  });

  it('is deterministic — repeated generation yields identical geometry', () => {
    expect(gen().inst.motifHostGeometry).toEqual(gen().inst.motifHostGeometry);
  });

  it('captures geometry for every drawMode (drawMode-independent stash)', () => {
    // voronoiEdges is computed regardless of drawMode, so the stash is stable
    // even when the drawn LINES differ (delaunay/spokes) — the documented v1
    // caveat: anchors follow the Voronoi tessellation, not those drawn lines.
    for (const drawMode of ['outlines', 'both', 'delaunay', 'spokes']) {
      const g = gen({ drawMode }).inst.motifHostGeometry;
      expect(g.drawnEdges.length).toBeGreaterThan(0);
      expect(g.sites.length).toBeGreaterThan(0);
    }
    // The stash is identical across drawModes (it never reads `lines`).
    expect(gen({ drawMode: 'outlines' }).inst.motifHostGeometry).toEqual(
      gen({ drawMode: 'spokes' }).inst.motifHostGeometry
    );
  });
});
