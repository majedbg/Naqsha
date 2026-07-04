import { describe, it, expect } from 'vitest';
import { getSemanticAnchors } from './semanticAnchors.js';
import { placeMotifs, selectAnchors } from './placementEngine.js';
import Grid from '../patterns/Grid.js';
import { RecordingContext } from '../patterns/drawingContext.js';

const HALF_PI = Math.PI / 2;

// A clean, verifiable lattice: linear spacing (nonLinear=0, gain=0), no jitter,
// no warp, single copy, no offset/rotation — so world coords are exactly
// centered coords + (cx, cy).
function linearParams(overrides = {}) {
  return {
    cols: 4,
    rows: 3,
    spacing: 40,
    margin: 20,
    nonLinear: 0,
    nonLinearGain: 0,
    jitter: 0,
    drawHorizontal: 1,
    drawVertical: 1,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
    ...overrides,
  };
}

const W = 400;
const H = 400;
const CX = W / 2;
const CY = H / 2;

// Collect the REAL drawn grid lines from the pattern's own output by running
// the actual Grid class through a headless RecordingContext, then classify each
// line() call as vertical (x1===x2) or horizontal (y1===y2). Coords are in the
// pattern's CENTERED space; caller adds (cx, cy) to reach world space.
function recordGridLines(params, seed = 7) {
  const grid = new Grid();
  const ctx = new RecordingContext({ seed });
  grid.generateWithContext(ctx, seed, params, W, H, '#000000', 100);
  const vertical = []; // { x, yMin, yMax }
  const horizontal = []; // { y, xMin, xMax }
  for (const { op, args } of ctx.calls) {
    if (op !== 'line') continue;
    const [x1, y1, x2, y2] = args;
    if (Math.abs(x1 - x2) < 1e-9) {
      vertical.push({ x: x1, yMin: Math.min(y1, y2), yMax: Math.max(y1, y2) });
    } else if (Math.abs(y1 - y2) < 1e-9) {
      horizontal.push({ y: y1, xMin: Math.min(x1, x2), xMax: Math.max(x1, x2) });
    }
  }
  return { vertical, horizontal };
}

function uniqSorted(nums, tol = 1e-6) {
  const out = [];
  for (const n of [...nums].sort((a, b) => a - b)) {
    if (out.length === 0 || Math.abs(n - out[out.length - 1]) > tol) out.push(n);
  }
  return out;
}

describe('getSemanticAnchors — non-grid patterns defer to null', () => {
  it('returns null for voronoi / spiral / recursive / unknown', () => {
    const p = linearParams();
    expect(getSemanticAnchors('voronoi', p, W, H)).toBeNull();
    expect(getSemanticAnchors('spiral', p, W, H)).toBeNull();
    expect(getSemanticAnchors('recursive', p, W, H)).toBeNull();
    expect(getSemanticAnchors('unknown-pattern', p, W, H)).toBeNull();
  });
});

describe('getSemanticAnchors — grid role taxonomy', () => {
  it('emits all four roles with the anchors.js shape', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    expect(Array.isArray(anchors)).toBe(true);
    const roles = new Set(anchors.map((a) => a.role));
    expect(roles).toEqual(new Set(['crossing', 'edge', 'tip', 'cell']));
    for (const a of anchors) {
      expect(a).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          role: expect.any(String),
          x: expect.any(Number),
          y: expect.any(Number),
          tangent: expect.any(Number),
          normal: expect.any(Number),
          s: expect.any(Number),
          meta: expect.any(Object),
        })
      );
    }
  });

  it('produces the right crossing / cell counts for a 4x3 lattice', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    const crossings = anchors.filter((a) => a.role === 'crossing');
    const cells = anchors.filter((a) => a.role === 'cell');
    // (cols+1) * (rows+1) crossings, cols * rows cells
    expect(crossings.length).toBe(5 * 4);
    expect(cells.length).toBe(4 * 3);
  });

  it('places crossings at world lattice positions with tangent=+x, normal=+y', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    const c00 = anchors.find((a) => a.id === 'crossing:0:0');
    // xPositions[0] = -totalW/2 = -80, world = 120; yPositions[0] = -60, world = 140
    expect(c00.x).toBeCloseTo(CX - 80, 6);
    expect(c00.y).toBeCloseTo(CY - 60, 6);
    expect(c00.tangent).toBeCloseTo(0, 6);
    expect(c00.normal).toBeCloseTo(HALF_PI, 6);
    expect(c00.meta.col).toBe(0);
    expect(c00.meta.row).toBe(0);
  });

  it('marks only interior crossings as junctions', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    const corner = anchors.find((a) => a.id === 'crossing:0:0');
    const interior = anchors.find((a) => a.id === 'crossing:2:2');
    const boundaryEdge = anchors.find((a) => a.id === 'crossing:2:0'); // top edge
    expect(corner.meta.junction).toBe(false);
    expect(boundaryEdge.meta.junction).toBe(false);
    expect(interior.meta.junction).toBe(true);
  });

  it('centers cell anchors between adjacent lines', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    const cell00 = anchors.find((a) => a.id === 'cell:0:0');
    // between x -80 and -40 => -60 (world 140); between y -60 and -20 => -40 (world 160)
    expect(cell00.x).toBeCloseTo(CX - 60, 6);
    expect(cell00.y).toBeCloseTo(CY - 40, 6);
  });

  it('edge anchors sit at midpoints of inter-crossing segments with line-direction tangents', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    const vEdges = anchors.filter((a) => a.role === 'edge' && a.id.startsWith('edge:v:'));
    const hEdges = anchors.filter((a) => a.role === 'edge' && a.id.startsWith('edge:h:'));
    // cols+1 vertical lines * rows segments each; rows+1 horizontal lines * cols segments
    expect(vEdges.length).toBe(5 * 3);
    expect(hEdges.length).toBe(4 * 4);
    for (const e of vEdges) expect(e.tangent).toBeCloseTo(HALF_PI, 6); // vertical line dir
    for (const e of hEdges) expect(e.tangent).toBeCloseTo(0, 6); // horizontal line dir
  });

  it('tip anchors sit at the actual grid-line endpoints', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    const tips = anchors.filter((a) => a.role === 'tip');
    // 2 endpoints per line: (cols+1) verticals + (rows+1) horizontals
    expect(tips.length).toBe(2 * (5 + 4));
    // vertical line 0 top endpoint: (xPositions[0]=-80, -halfH=-80) => world (120,120)
    const vTop = anchors.find((a) => a.id === 'tip:v:0:0');
    expect(vTop.x).toBeCloseTo(CX - 80, 6);
    expect(vTop.y).toBeCloseTo(CY - 80, 6); // halfH = 60+20 = 80
  });
});

describe('getSemanticAnchors — determinism', () => {
  it('is byte-identical for identical params (toEqual)', () => {
    const a = getSemanticAnchors('grid', linearParams(), W, H);
    const b = getSemanticAnchors('grid', linearParams(), W, H);
    expect(a).toEqual(b);
  });
});

describe('getSemanticAnchors — warp is not verifiable, returns null', () => {
  it('returns null when a warp modulation field is active', () => {
    const p = linearParams({
      modulation: { channel: 'warp', field: { type: 'noise' }, amount: 30 },
    });
    expect(getSemanticAnchors('grid', p, W, H)).toBeNull();
  });
});

// ── DIVERGENCE GUARD (the honesty gate) ─────────────────────────────────────
// Prove the extractor's anchors sit where the REAL Grid class actually draws,
// by pulling truth from the pattern's own recorded line() calls — NOT from a
// re-derivation of the spacing math. Runs for BOTH a linear lattice AND a
// nonlinear one, so the gamma/gain composition is exercised (a linear-only
// guard would let a transcription error in distribute() sail through).
describe('divergence guard — anchors coincide with the pattern real drawing', () => {
  const cases = [
    { name: 'linear', params: linearParams() },
    {
      name: 'nonlinear (gamma+gain)',
      params: linearParams({ nonLinear: 1.5, nonLinearGain: 0.5 }),
    },
  ];

  for (const { name, params } of cases) {
    it(`crossings land on real line intersections; cells fall between (${name})`, () => {
      const { vertical, horizontal } = recordGridLines(params);
      // Real drawn line positions in WORLD space (centered + cx/cy).
      const Vx = uniqSorted(vertical.map((l) => l.x + CX));
      const Hy = uniqSorted(horizontal.map((l) => l.y + CY));
      expect(Vx.length).toBe(params.cols + 1);
      expect(Hy.length).toBe(params.rows + 1);

      const anchors = getSemanticAnchors('grid', params, W, H);
      const crossings = anchors.filter((a) => a.role === 'crossing');
      const cells = anchors.filter((a) => a.role === 'cell');
      const tol = 1e-6;

      const onSet = (v, set) => set.some((s) => Math.abs(s - v) <= tol);

      // Every crossing reproduces exactly Vx x Hy (membership + count).
      expect(crossings.length).toBe(Vx.length * Hy.length);
      for (const c of crossings) {
        expect(onSet(c.x, Vx)).toBe(true);
        expect(onSet(c.y, Hy)).toBe(true);
      }

      // Cell centers lie strictly BETWEEN consecutive drawn lines — never on one.
      const minDist = (v, set) => Math.min(...set.map((s) => Math.abs(s - v)));
      for (const cell of cells) {
        expect(minDist(cell.x, Vx)).toBeGreaterThan(tol);
        expect(minDist(cell.y, Hy)).toBeGreaterThan(tol);
      }
    });

    it(`tips land on real line endpoints (${name})`, () => {
      const { vertical, horizontal } = recordGridLines(params);
      const anchors = getSemanticAnchors('grid', params, W, H);
      const tips = anchors.filter((a) => a.role === 'tip');
      const tol = 1e-6;

      // Build the real endpoint set in world space.
      const realEnds = [];
      for (const l of vertical) {
        realEnds.push({ x: l.x + CX, y: l.yMin + CY });
        realEnds.push({ x: l.x + CX, y: l.yMax + CY });
      }
      for (const l of horizontal) {
        realEnds.push({ x: l.xMin + CX, y: l.y + CY });
        realEnds.push({ x: l.xMax + CX, y: l.y + CY });
      }
      for (const t of tips) {
        const hit = realEnds.some(
          (e) => Math.abs(e.x - t.x) <= tol && Math.abs(e.y - t.y) <= tol
        );
        expect(hit).toBe(true);
      }
    });
  }
});

describe('getSemanticAnchors — feeds the placement engine', () => {
  it('roles are filterable via selectAnchors', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    const { survivors } = selectAnchors(anchors, { roles: ['crossing'] });
    expect(survivors.length).toBeGreaterThan(0);
    expect(survivors.every((a) => a.role === 'crossing')).toBe(true);
  });

  it('produces placements through placeMotifs', () => {
    const anchors = getSemanticAnchors('grid', linearParams(), W, H);
    const { placements } = placeMotifs(
      anchors,
      {
        selection: { roles: ['crossing', 'cell'] },
        placement: { sizing: { mode: 'fixed', size: 4, min: 0 } },
      },
      { canvasW: W, canvasH: H, boundary: { type: 'rect', width: W, height: H } }
    );
    expect(placements.length).toBeGreaterThan(0);
  });
});
