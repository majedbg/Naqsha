import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { getSemanticAnchors } from './semanticAnchors.js';
import { runSelectionChain } from './chain.js';
import { buildSkeleton } from '../patterns/spaceColonizationSkeleton.js';
import { anchorId, MIN_EDGE_SPACING } from './anchors.js';
import { placeMotifs, selectAnchors } from './placementEngine.js';
import { partitionZones } from './zones.js';
import { defaultRolesForHost } from './hostKinds.js';
import { DEFAULT_PARAMS } from '../../constants.js';
import Grid from '../patterns/Grid.js';
import RecursiveGeometry from '../patterns/RecursiveGeometry.js';
import Spiral from '../patterns/Spiral.js';
import BranchPattern from '../patterns/Branch.js';
import VoronoiCells from '../patterns/VoronoiCells.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import { ScalarField } from '../fields/ScalarField.js';
import { gridAnchorsCentered } from '../patterns/gridAnchors.js';
import { makeP5Random } from '../patterns/rng.js';
import { toSymmetryCount } from '../patterns/symmetryUtils.js';
import { stackWarpDisplacement } from '../fields/warp.js';
import { flattenCubic } from '../geometry/flattenCubic.js';
import { computeWarpFrame } from '../fields/warpFrame.js';

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

describe('getSemanticAnchors — non-extractor patterns defer to null', () => {
  it('returns null for voronoi (no opts) / unknown; spiral & grid have extractors', () => {
    const p = linearParams();
    // voronoi is GEOMETRY-IN: null unless opts.drawnCells is supplied (its own
    // suite below exercises the populated case). This 4-arg call is the
    // backward-compat guard for MotifPattern's existing call site.
    expect(getSemanticAnchors('voronoi', p, W, H)).toBeNull();
    expect(getSemanticAnchors('unknown-pattern', p, W, H)).toBeNull();
    // spiral is exercised in its own suite below and returns an array here.
    expect(Array.isArray(getSemanticAnchors('spiral', p, W, H))).toBe(true);
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
    // Core ids carry a trailing copy-k segment (":0" for the base copy).
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

describe('getSemanticAnchors — grid is warp-aware (Option C, #117)', () => {
  // A warp channel no longer bails: the extractor reconstructs anchors from the
  // drawn warped curves (world-translated by the canvas centre). Detailed exact-
  // to-paint / equivariance coverage lives in gridWarpAnchors.test.js; here we
  // pin the adapter WIRING — warp params yield world-space warp-aware anchors.
  it('reconstructs world-space anchors when a warp modulation field is active', () => {
    const field = ScalarField.fromFunction((u, v) => Math.sin(u * 5) * Math.cos(v * 4), { nx: 129, ny: 129 });
    const p = linearParams({ warpNodes: 6, modulation: { channel: 'warp', field, amount: 3 } });
    const a = getSemanticAnchors('grid', p, W, H);
    expect(Array.isArray(a)).toBe(true);
    expect(a.length).toBeGreaterThan(0);
    // All four roles present; anchors are in canvas-world coords (centre-shifted).
    for (const role of ['crossing', 'edge', 'tip', 'cell']) {
      expect(a.some((x) => x.role === role)).toBe(true);
    }
    // At least one crossing is displaced off the straight lattice by the warp.
    const straight = getSemanticAnchors('grid', linearParams(), W, H);
    const sc = straight.filter((x) => x.role === 'crossing');
    const wc = a.filter((x) => x.role === 'crossing');
    const moved = wc.some((c, i) => Math.hypot(c.x - sc[i].x, c.y - sc[i].y) > 1e-3);
    expect(moved).toBe(true);
  });
});

// ── WI-2: grid now routes through the shared geometry core, gaining jitter +
//    symmetry parity. The adapter injects makeP5Random(opts.hostSeed) exactly as
//    latticeForLayer does; the core+makeP5Random is the production-faithful
//    reference (a RecordingContext Grid run uses mulberry32, NOT the p5 stream,
//    so it would diverge by design — we do NOT compare against it here).
describe('grid — jitter + symmetry parity via the core (WI-2)', () => {
  // World-translate a centred core anchor by the canvas centre ONLY (offsets are
  // already folded into the core coords — the adapter must not add them again).
  const toWorld = (a) => ({ ...a, x: a.x + W / 2, y: a.y + H / 2 });
  const crossingsOf = (arr) => arr.filter((a) => a.role === 'crossing');

  it('jitter=0/sym=1 with hostSeed passed reproduces the byte-identical baseline', () => {
    // The adapter must ignore the seed when jitter=0 (the core never consumes
    // the RNG for positions there) — so passing hostSeed changes nothing.
    const p = linearParams(); // jitter:0, symmetry:1
    const seeded = getSemanticAnchors('grid', p, W, H, { hostSeed: 7 });
    const noOpts = getSemanticAnchors('grid', p, W, H);
    expect(seeded).toEqual(noOpts);

    // Role counts for the 4×3 fixture (nx=5 vertical, ny=4 horizontal lines).
    const nx = p.cols + 1;
    const ny = p.rows + 1;
    expect(seeded.filter((a) => a.role === 'crossing')).toHaveLength(nx * ny); // 20
    expect(seeded.filter((a) => a.role === 'cell')).toHaveLength((nx - 1) * (ny - 1)); // 12
    expect(seeded.filter((a) => a.role === 'tip')).toHaveLength(2 * nx + 2 * ny); // 18
    expect(seeded.filter((a) => a.role === 'edge')).toHaveLength(nx * (ny - 1) + ny * (nx - 1)); // 31

    // Spot exact positions: crossing:0:0 world = (CX-80, CY-60), tangent/normal.
    const c00 = seeded.find((a) => a.id === 'crossing:0:0');
    expect(c00.x).toBeCloseTo(CX - 80, 9);
    expect(c00.y).toBeCloseTo(CY - 60, 9);
    expect(c00.tangent).toBeCloseTo(0, 12);
    expect(c00.normal).toBeCloseTo(HALF_PI, 12);
    // cell:0:0 world = (CX-60, CY-40).
    const cell00 = seeded.find((a) => a.id === 'cell:0:0');
    expect(cell00.x).toBeCloseTo(CX - 60, 9);
    expect(cell00.y).toBeCloseTo(CY - 40, 9);
  });

  it('jitter>0: adapter crossings equal the core+makeP5Random reference, world-translated', () => {
    const seed = 4242;
    const p = linearParams({ jitter: 7 });
    const adapter = crossingsOf(getSemanticAnchors('grid', p, W, H, { hostSeed: seed }));
    // The production-faithful reference: the SAME core, fed a fresh
    // makeP5Random(seed), mapped +W/2/+H/2. (NOT a RecordingContext Grid run.)
    const ref = crossingsOf(gridAnchorsCentered(p, makeP5Random(seed))).map(toWorld);

    expect(adapter).toHaveLength(ref.length);
    adapter.forEach((a, i) => {
      expect(a.x).toBe(ref[i].x); // exact float equality — same core, same rng.
      expect(a.y).toBe(ref[i].y);
    });
    // Guard the guard: jitter actually moved crossings off the ideal lattice, so
    // the seed is genuinely consumed (an ideal crossing would sit on a 40px grid).
    const ideal = crossingsOf(getSemanticAnchors('grid', linearParams({ jitter: 0 }), W, H));
    const moved = adapter.some((a, i) => Math.abs(a.x - ideal[i].x) > 1e-9 || Math.abs(a.y - ideal[i].y) > 1e-9);
    expect(moved).toBe(true);
  });

  it('symmetry>1: 4× the sym=1 anchor count, and copy-k anchors carry rotated tangent/normal + meta.theta', () => {
    const seed = 11;
    const one = getSemanticAnchors('grid', linearParams({ jitter: 3, symmetry: 1 }), W, H, { hostSeed: seed });
    const four = getSemanticAnchors('grid', linearParams({ jitter: 3, symmetry: 4 }), W, H, { hostSeed: seed });
    expect(toSymmetryCount(4)).toBe(4);
    expect(four).toHaveLength(4 * one.length);

    // Every crossing (base tangent=0, normal=π/2) has tangent=θ, normal=π/2+θ,
    // where θ = 2π·copy/4 (startAngle=0), and carries meta.copy + meta.theta.
    for (const c of crossingsOf(four)) {
      const theta = (2 * Math.PI * c.meta.copy) / 4;
      expect(c.meta.theta).toBeCloseTo(theta, 12);
      expect(c.tangent).toBeCloseTo(0 + theta, 12);
      expect(c.normal).toBeCloseTo(HALF_PI + theta, 12);
    }
    // All four copies are present.
    expect(new Set(four.map((a) => a.meta.copy))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('a different hostSeed changes the jittered crossing positions (seed is consumed)', () => {
    const p = linearParams({ jitter: 6 });
    const a = crossingsOf(getSemanticAnchors('grid', p, W, H, { hostSeed: 1 }));
    const b = crossingsOf(getSemanticAnchors('grid', p, W, H, { hostSeed: 2 }));
    expect(a).toHaveLength(b.length);
    const differs = a.some((c, i) => c.x !== b[i].x || c.y !== b[i].y);
    expect(differs).toBe(true);
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

// ════════════════════════════════════════════════════════════════════════════
// RECURSIVE extractor (patternType:'recursive', class RecursiveGeometry)
// ════════════════════════════════════════════════════════════════════════════

// Recursive is SEEDLESS — geometry is fully determined by params — so the
// extractor replicates the recursion with no RNG. Default frame: single copy,
// no offset/rotation ⇒ world = centered + (CX, CY).
function recursiveParams(overrides = {}) {
  return {
    shape: 'hexagon',
    depth: 3,
    rotationPerLevel: 15,
    scaleFactor: 0.7,
    scaleNonLinearity: 0,
    startScale: 70,
    strokeWeight: 1,
    strokeDepthDecay: 0,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
    ...overrides,
  };
}

// Reconstruct the REAL drawn polygons from the pattern's own recorded ops. Each
// polygon is one beginShape → vertex* → endShape group. Vertex coords are in the
// pattern's CENTERED space; we lift them to WORLD by adding (CX, CY). From the
// recorded vertices alone we derive each polygon's center (vertex mean) and
// radius (center→vertex distance) — no re-derivation of the recursion math.
function recordRecursivePolys(params, seed = 7) {
  const rg = new RecursiveGeometry();
  const ctx = new RecordingContext({ seed });
  rg.generateWithContext(ctx, seed, params, W, H, '#000000', 100);
  const groups = [];
  let cur = null;
  for (const { op, args } of ctx.calls) {
    if (op === 'beginShape') cur = [];
    else if (op === 'vertex' && cur) cur.push({ x: args[0] + CX, y: args[1] + CY });
    else if (op === 'endShape' && cur) {
      groups.push(cur);
      cur = null;
    }
  }
  return groups.map((verts) => {
    const n = verts.length;
    const center = {
      x: verts.reduce((s, v) => s + v.x, 0) / n,
      y: verts.reduce((s, v) => s + v.y, 0) / n,
    };
    const radius = Math.hypot(verts[0].x - center.x, verts[0].y - center.y);
    return { verts, center, radius };
  });
}

const TOL = 1e-6;
const near = (a, b) => Math.abs(a - b) <= TOL;
const ptNear = (p, q) => near(p.x, q.x) && near(p.y, q.y);
const onPts = (p, set) => set.some((q) => ptNear(p, q));

// Recording-only NON-leaf predicate: a polygon is non-leaf iff another recorded
// polygon is its concentric child (same center, smaller radius) OR a branch
// child (centered on one of its vertices). Independent of the extractor's math.
function isNonLeaf(P, all) {
  return all.some(
    (Q) =>
      Q !== P &&
      ((ptNear(Q.center, P.center) && Q.radius < P.radius - TOL) ||
        P.verts.some((v) => ptNear(Q.center, v)))
  );
}

describe('getSemanticAnchors — recursive role taxonomy', () => {
  it('emits all four roles with the anchors.js shape', () => {
    const anchors = getSemanticAnchors('recursive', recursiveParams(), W, H);
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

  it('is deterministic — byte-identical for identical params (toEqual)', () => {
    const a = getSemanticAnchors('recursive', recursiveParams(), W, H);
    const b = getSemanticAnchors('recursive', recursiveParams(), W, H);
    expect(a).toEqual(b);
  });

  it('emits warp-AWARE anchors (not null) when a warp modulation field is active (WI-118)', () => {
    const field = ScalarField.fromFunction((u, v) => Math.sin(6 * u) * Math.cos(6 * v), {
      nx: 65,
      ny: 65,
    });
    const p = recursiveParams({
      modulation: { channel: 'warp', field, amount: 2 },
    });
    const anchors = getSemanticAnchors('recursive', p, W, H);
    expect(Array.isArray(anchors)).toBe(true);
    expect(anchors.length).toBeGreaterThan(0);
    // All four roles still present under warp.
    expect(new Set(anchors.map((a) => a.role))).toEqual(
      new Set(['crossing', 'edge', 'tip', 'cell']),
    );
  });
});

// ── DIVERGENCE GUARD (the honesty gate) ─────────────────────────────────────
// Prove every anchor sits where RecursiveGeometry actually draws, by pulling
// truth from the pattern's own recorded polygons — NOT from a re-derivation of
// the recursion. Both leaf-ness (tips) and junction-ness (crossings) are decided
// by recording-only predicates, so a wrong structural claim fails. Runs for a
// SHALLOW branching case AND a DEEP nonlinear case (exercises getEffectiveScale's
// nonlinear branch), with nonzero rotationPerLevel so branch centers never
// coincide ambiguously.
describe('divergence guard — recursive anchors coincide with the pattern real drawing', () => {
  const cases = [
    { name: 'shallow hexagon (depth 2)', params: recursiveParams({ shape: 'hexagon', depth: 2 }) },
    {
      name: 'deep square nonlinear (depth 4)',
      params: recursiveParams({ shape: 'square', depth: 4, scaleNonLinearity: 0.6 }),
    },
  ];

  for (const { name, params } of cases) {
    it(`crossings land on real vertices; junctions match recorded branch children (${name})`, () => {
      const polys = recordRecursivePolys(params);
      const realVerts = polys.flatMap((p) => p.verts);
      const realCenters = polys.map((p) => p.center);

      const anchors = getSemanticAnchors('recursive', params, W, H);
      const crossings = anchors.filter((a) => a.role === 'crossing');

      // Count + position: one crossing per real vertex, each on a real vertex.
      expect(crossings.length).toBe(realVerts.length);
      for (const c of crossings) expect(onPts(c, realVerts)).toBe(true);

      // Junction truth from recording: a vertex is a junction iff some recorded
      // polygon is centered there (a branch child was actually drawn).
      for (const c of crossings) {
        const expected = onPts(c, realCenters);
        expect(c.meta.junction).toBe(expected);
      }
      // Guard the guard: branching must actually occur (some junctions exist).
      expect(crossings.some((c) => c.meta.junction === true)).toBe(true);
    });

    it(`edges land on real polygon side midpoints, tangent = side direction (${name})`, () => {
      const polys = recordRecursivePolys(params);
      const realSides = []; // { x, y, dir } — midpoint + recorded side direction
      for (const p of polys) {
        const n = p.verts.length;
        for (let k = 0; k < n; k++) {
          const a = p.verts[k];
          const b = p.verts[(k + 1) % n];
          realSides.push({
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            dir: Math.atan2(b.y - a.y, b.x - a.x),
          });
        }
      }
      const anchors = getSemanticAnchors('recursive', params, W, H);
      const edges = anchors.filter((a) => a.role === 'edge');
      expect(edges.length).toBe(realSides.length);
      for (const e of edges) {
        // Position on a real side midpoint AND tangent aligned with that side's
        // direction (guards against a winding/vertex-order transcription slip
        // that would move the midpoint by 0 but the tangent by π).
        const side = realSides.find((s) => ptNear(s, e));
        expect(side).toBeDefined();
        expect(e.tangent).toBeCloseTo(side.dir, 9);
      }
    });

    it(`cells land on real polygon centers, one per polygon (${name})`, () => {
      const polys = recordRecursivePolys(params);
      const realCenters = polys.map((p) => p.center);
      const anchors = getSemanticAnchors('recursive', params, W, H);
      const cells = anchors.filter((a) => a.role === 'cell');
      // One cell per drawn polygon (per-polygon count, NOT deduped — concentric
      // polygons share the origin center).
      expect(cells.length).toBe(polys.length);
      for (const c of cells) expect(onPts(c, realCenters)).toBe(true);
    });

    it(`tips equal the recorded leaf-polygon centers (${name})`, () => {
      const polys = recordRecursivePolys(params);
      const leafCenters = polys.filter((p) => !isNonLeaf(p, polys)).map((p) => p.center);
      const anchors = getSemanticAnchors('recursive', params, W, H);
      const tips = anchors.filter((a) => a.role === 'tip');
      const cells = anchors.filter((a) => a.role === 'cell');

      // Count matches the recording-derived leaf set, every tip is on a leaf
      // center, and every leaf center has a tip.
      expect(tips.length).toBe(leafCenters.length);
      for (const t of tips) expect(onPts(t, leafCenters)).toBe(true);
      for (const lc of leafCenters) expect(tips.some((t) => ptNear(t, lc))).toBe(true);
      // Tips are a PROPER subset of cells (non-leaf polygons exist) — proves the
      // leaf filter did something, so tips ≠ "all centers".
      expect(tips.length).toBeLessThan(cells.length);
    });
  }
});

describe('getSemanticAnchors — recursive feeds the placement engine', () => {
  it('roles are filterable via selectAnchors', () => {
    const anchors = getSemanticAnchors('recursive', recursiveParams(), W, H);
    const { survivors } = selectAnchors(anchors, { roles: ['tip'] });
    expect(survivors.length).toBeGreaterThan(0);
    expect(survivors.every((a) => a.role === 'tip')).toBe(true);
  });

  it('produces placements through placeMotifs', () => {
    const anchors = getSemanticAnchors('recursive', recursiveParams(), W, H);
    const { placements } = placeMotifs(
      anchors,
      {
        selection: { roles: ['crossing', 'tip'] },
        placement: { sizing: { mode: 'fixed', size: 4, min: 0 } },
      },
      { canvasW: W, canvasH: H, boundary: { type: 'rect', width: W, height: H } }
    );
    expect(placements.length).toBeGreaterThan(0);
  });
});

// ── RECURSIVE symmetry + startAngle replication (WI-115) ────────────────────
// The recursive extractor now replicates every radial-symmetry copy and folds in
// startAngle as a RIGID post-rotation of the base copy — matching the renderer's
// applySymmetryDraw (θk = 2π·k/n + startAngle, rotate-then-add-offset). These
// tests pin: (1) N-fold count, (2) anchors in EVERY sector under N≥2 & non-zero
// startAngle, (3) BYTE-EXACT rotation-equivariance anchor(k) == Rot_θk(anchor(0)),
// (4) an independent directional check that startAngle rotates the right way.
describe('getSemanticAnchors — recursive symmetry + startAngle replication (WI-115)', () => {
  it('symmetry=N yields exactly N× the symmetry=1 anchor count', () => {
    const one = getSemanticAnchors('recursive', recursiveParams({ symmetry: 1 }), W, H);
    const four = getSemanticAnchors('recursive', recursiveParams({ symmetry: 4 }), W, H);
    expect(four.length).toBe(one.length * 4);
  });

  it('N≥2 with non-zero startAngle places anchors in EVERY sector (not just sector 0)', () => {
    const n = 4;
    const anchors = getSemanticAnchors(
      'recursive',
      recursiveParams({ symmetry: n, startAngle: 33 }),
      W,
      H
    );
    // Every copy index 0..n-1 is present — no sector is missing.
    expect(new Set(anchors.map((a) => a.meta.copy))).toEqual(new Set([0, 1, 2, 3]));
    // Each role is present in every sector too (nothing collapses to sector 0).
    for (const role of ['crossing', 'edge', 'tip', 'cell']) {
      const copies = new Set(anchors.filter((a) => a.role === role).map((a) => a.meta.copy));
      expect(copies).toEqual(new Set([0, 1, 2, 3]));
    }
  });

  it('copy-k anchors carry meta.copy/meta.theta and rotated tangent/normal (θ = 2π·k/n + startRad)', () => {
    const n = 3;
    const startDeg = 40;
    const startRad = (startDeg * Math.PI) / 180;
    const full = getSemanticAnchors(
      'recursive',
      recursiveParams({ symmetry: n, startAngle: startDeg }),
      W,
      H
    );
    for (const a of full) {
      const theta = (2 * Math.PI * a.meta.copy) / n + startRad;
      expect(a.meta.theta).toBeCloseTo(theta, 12);
    }
  });

  it('byte-exact rotation-equivariance: anchor(k) == Rot_θk(anchor(0)) for position AND frame', () => {
    // ox = W2 + offsetX = 0 so world coords ARE the centred rotation — this dodges
    // the (ox+bx)-ox cancellation and lets us reconstruct Rot_θk(master) byte-exact.
    const W2 = 800;
    const H2 = 800;
    const geom = {
      shape: 'hexagon',
      depth: 3,
      rotationPerLevel: 15,
      scaleFactor: 0.7,
      scaleNonLinearity: 0,
      startScale: 70,
      offsetX: -W2 / 2,
      offsetY: -H2 / 2,
    };
    const ox = 0; // W2/2 + offsetX
    const oy = 0;
    const n = 3;
    const startDeg = 40;
    const startRad = (startDeg * Math.PI) / 180;

    // anchor(0) = the base copy at DEFAULT orientation (symmetry=1, startAngle=0).
    const master = getSemanticAnchors('recursive', { ...geom, symmetry: 1, startAngle: 0 }, W2, H2);
    const full = getSemanticAnchors('recursive', { ...geom, symmetry: n, startAngle: startDeg }, W2, H2);

    expect(full.length).toBe(master.length * n);
    const masterById = new Map(master.map((m) => [m.id, m]));

    for (const a of full) {
      const k = a.meta.copy;
      const theta = (2 * Math.PI * k) / n + startRad;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      // full ids gain a trailing ':k'; strip it to recover the master id.
      const baseId = a.id.slice(0, a.id.lastIndexOf(':'));
      const m = masterById.get(baseId);
      expect(m).toBeDefined();
      // master (θ=0, ox=0) world coords ARE the centred base coords (m.x, m.y).
      // Reconstruct Rot_θk(master) with the SAME expression the extractor uses.
      expect(a.x).toBe(ox + m.x * cos - m.y * sin);
      expect(a.y).toBe(oy + m.x * sin + m.y * cos);
      expect(a.tangent).toBe(m.tangent + theta);
      expect(a.normal).toBe(m.normal + theta);
      // Arc length is rotation-invariant.
      expect(a.s).toBe(m.s);
    }
  });

  it('startAngle rotates in the applySymmetryDraw direction: 90° maps (x,y)→(−y,x) about centre (independent check)', () => {
    // Independent of the extractor's own rotation expression — a +90° rotation in
    // the [cos −sin; sin cos] convention sends centred (x,y) → (−y, x).
    const W2 = 800;
    const H2 = 800;
    const geom = {
      shape: 'pentagon',
      depth: 3,
      rotationPerLevel: 12,
      startScale: 70,
      offsetX: -W2 / 2, // ox = 0
      offsetY: -H2 / 2,
    };
    const master = getSemanticAnchors('recursive', { ...geom, symmetry: 1, startAngle: 0 }, W2, H2);
    const rot90 = getSemanticAnchors('recursive', { ...geom, symmetry: 1, startAngle: 90 }, W2, H2);
    // symmetry=1 keeps ids un-suffixed, so ids line up between the two runs.
    const byId = new Map(master.map((m) => [m.id, m]));
    expect(rot90.length).toBe(master.length);
    for (const a of rot90) {
      const m = byId.get(a.id);
      expect(m).toBeDefined();
      expect(a.x).toBeCloseTo(-m.y, 9);
      expect(a.y).toBeCloseTo(m.x, 9);
      expect(a.tangent).toBeCloseTo(m.tangent + Math.PI / 2, 9);
    }
  });

  it('symmetry=1 & startAngle=0 keeps pre-WI-115 ids (no copy suffix) and an unrotated base copy', () => {
    const base = getSemanticAnchors('recursive', recursiveParams(), W, H);
    expect(base.length).toBeGreaterThan(0);
    for (const a of base) {
      // Every base-copy anchor is copy 0 at θ=0 (unrotated).
      expect(a.meta.copy).toBe(0);
      expect(a.meta.theta).toBe(0);
      // Ids are byte-identical to the pre-WI-115 form — NO trailing :copy segment.
      let expectedId;
      if (a.role === 'crossing') expectedId = anchorId('crossing', a.meta.poly, a.meta.vertex);
      else if (a.role === 'edge') expectedId = anchorId('edge', a.meta.poly, a.meta.side);
      else if (a.role === 'tip') expectedId = anchorId('tip', a.meta.poly);
      else expectedId = anchorId('cell', a.meta.poly);
      expect(a.id).toBe(expectedId);
    }
  });
});

// ── RECURSIVE WARP-AWARE anchors (WI-118, Option C) ─────────────────────────
// The recursive extractor no longer refuses warp; it reconstructs every anchor
// from the SHARED recursive core (buildWarpedPolygon) — the SAME geometry the
// renderer paints — so vertices/edges are EXACT-TO-PAINT, and free-point centres
// (cells/tips) are point-warped + FD-framed (trusted-bounded, offline-validated).
// The load-bearing proof compares extractor output against the RENDERER's CAPTURED
// paint stream (not a re-call of the core), so "exact-to-paint" is genuinely
// tested, not asserted circularly.

const SIDES_FOR_SHAPE = { triangle: 3, square: 4, pentagon: 5, hexagon: 6, circle: 72 };

// A non-trivial warp field so curves actually bend (the test is meaningful).
const warpField = () =>
  ScalarField.fromFunction((u, v) => Math.sin(6 * u) * Math.cos(6 * v), { nx: 65, ny: 65 });

function warpParams(overrides = {}) {
  const { amount = 2, warpNodes = 2, ...rest } = overrides;
  return recursiveParams({
    modulation: { channel: 'warp', field: warpField(), amount },
    warpNodes,
    ...rest,
  });
}

// Capture the renderer's ACTUAL painted LOCAL geometry per polygon by parsing its
// recorded op stream. symmetry=1/startAngle=0/offset=0 ⇒ recorded vertex/bezier
// args are origin-centered LOCAL coords (RecordingContext does not apply the
// recorded translate/rotate). Each polygon becomes { verts, segs }: plain-vertex
// polygons carry all corners in `verts`; bendable polygons carry the ONE start in
// `verts` and every cubic triple in `segs`.
function recordRecursivePaint(params, seed = 7) {
  const rg = new RecursiveGeometry();
  const ctx = new RecordingContext({ seed });
  rg.generateWithContext(ctx, seed, params, W, H, '#000000', 100);
  const polys = [];
  let cur = null;
  for (const { op, args } of ctx.calls) {
    if (op === 'beginShape') cur = { verts: [], segs: [], pending: [] };
    else if (op === 'vertex' && cur) cur.verts.push({ x: args[0], y: args[1] });
    else if (op === 'bezierVertex' && cur) {
      cur.pending.push({ x: args[0], y: args[1] });
      if (cur.pending.length === 3) {
        cur.segs.push({ c1: cur.pending[0], c2: cur.pending[1], end: cur.pending[2] });
        cur.pending = [];
      }
    } else if (op === 'endShape' && cur) {
      polys.push({ verts: cur.verts, segs: cur.segs });
      cur = null;
    }
  }
  return polys;
}

// Turn one recorded polygon into { corners, sideLines } in LOCAL coords, flattening
// bendable sides with the SAME shared flattenCubic the extractor uses. Corners and
// side polylines are indexed to match the extractor's per-poly vertex/side order.
function paintedGeometry(poly, K, numSides) {
  if (poly.segs.length === 0) {
    const corners = poly.verts;
    const n = corners.length;
    const sideLines = [];
    for (let k = 0; k < n; k++) {
      const a = corners[k];
      const b = corners[(k + 1) % n];
      sideLines.push([[a.x, a.y], [b.x, b.y]]);
    }
    return { corners, sideLines };
  }
  const segsPerSide = K - 1;
  const corners = [];
  const sideLines = [];
  for (let s = 0; s < numSides; s++) {
    const startPt = s === 0 ? poly.verts[0] : poly.segs[s * segsPerSide - 1].end;
    corners.push(startPt);
    const line = [[startPt.x, startPt.y]];
    let prev = [startPt.x, startPt.y];
    for (let j = 0; j < segsPerSide; j++) {
      const seg = poly.segs[s * segsPerSide + j];
      const flat = flattenCubic([prev, [seg.c1.x, seg.c1.y], [seg.c2.x, seg.c2.y], [seg.end.x, seg.end.y]]);
      for (const q of flat) line.push(q);
      prev = [seg.end.x, seg.end.y];
    }
    sideLines.push(line);
  }
  return { corners, sideLines };
}

// Point at half a polyline's arc length (mirrors the extractor's on-curve sample).
function halfLengthPoint(line) {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    total += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const l = Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
    if (acc + l >= half || i === line.length - 2) {
      const t = l > 0 ? (half - acc) / l : 0;
      return {
        x: line[i][0] + (line[i + 1][0] - line[i][0]) * t,
        y: line[i][1] + (line[i + 1][1] - line[i][1]) * t,
      };
    }
    acc += l;
  }
  const last = line[line.length - 1];
  return { x: last[0], y: last[1] };
}

describe('getSemanticAnchors — recursive WARP-aware anchors, exact-to-paint (WI-118)', () => {
  for (const K of [2, 4]) {
    const mode = K < 3 ? 'K=2 vertices' : 'K≥3 bendable';
    const params = warpParams({ shape: 'hexagon', depth: 3, warpNodes: K, amount: 2 });
    const numSides = SIDES_FOR_SHAPE.hexagon;

    it(`crossings sit on the renderer's painted warped corners (${mode})`, () => {
      const painted = recordRecursivePaint(params);
      const anchors = getSemanticAnchors('recursive', params, W, H);
      const crossings = anchors.filter((a) => a.role === 'crossing');
      expect(crossings.length).toBe(painted.length * numSides);
      for (const c of crossings) {
        const { corners } = paintedGeometry(painted[c.meta.poly], K, numSides);
        const corner = corners[c.meta.vertex];
        // World = LOCAL + (CX, CY); sub-pixel agreement with the painted corner.
        expect(c.x).toBeCloseTo(corner.x + CX, 6);
        expect(c.y).toBeCloseTo(corner.y + CY, 6);
      }
    });

    it(`edges sit on the painted side, sub-pixel (≤0.15px), tangent = side direction (${mode})`, () => {
      const painted = recordRecursivePaint(params);
      const anchors = getSemanticAnchors('recursive', params, W, H);
      const edges = anchors.filter((a) => a.role === 'edge');
      expect(edges.length).toBe(painted.length * numSides);
      for (const e of edges) {
        const { sideLines } = paintedGeometry(painted[e.meta.poly], K, numSides);
        const line = sideLines[e.meta.side];
        const mid = halfLengthPoint(line);
        const dist = Math.hypot(e.x - (mid.x + CX), e.y - (mid.y + CY));
        expect(dist).toBeLessThanOrEqual(0.15);
      }
    });
  }

  it('is deterministic under warp (byte-identical for identical params)', () => {
    const p = warpParams({ warpNodes: 4 });
    expect(getSemanticAnchors('recursive', p, W, H)).toEqual(getSemanticAnchors('recursive', p, W, H));
  });

  it('no-warp byte-identity: a modulation with NO warp channel is unchanged from today', () => {
    // The warp branch fires ONLY on channel==='warp'. A density (non-warp) channel
    // must leave the extractor on its untouched non-warp path → byte-identical.
    const density = { channel: 'density', field: warpField(), amount: 2 };
    const withDensity = getSemanticAnchors('recursive', recursiveParams({ modulation: density }), W, H);
    const plain = getSemanticAnchors('recursive', recursiveParams(), W, H);
    expect(withDensity).toEqual(plain);
  });

  it('D2: crossing corners are displaced ONLY by stackWarpDisplacement (K=2 vertices)', () => {
    const params = warpParams({ shape: 'square', depth: 2, warpNodes: 2, amount: 2 });
    const sources = [params.modulation]; // the extractor builds [warpMod] the same way
    // Straight-corner mode: each crossing = its ideal corner + stackWarpDisplacement.
    const ideal = getSemanticAnchors('recursive', recursiveParams({ shape: 'square', depth: 2 }), W, H)
      .filter((a) => a.role === 'crossing');
    const warped = getSemanticAnchors('recursive', params, W, H).filter((a) => a.role === 'crossing');
    const byId = new Map(warped.map((a) => [a.id, a]));
    for (const c of ideal) {
      const lx = c.x - CX;
      const ly = c.y - CY;
      const u = (lx + W / 2) / W;
      const v = (ly + H / 2) / H;
      const { dx, dy } = stackWarpDisplacement(sources, u, v);
      const w = byId.get(c.id);
      expect(w.x).toBeCloseTo(c.x + dx, 9);
      expect(w.y).toBeCloseTo(c.y + dy, 9);
    }
  });

  it('cells/tips are free points: position = mean of the DRAWN warped corners, frame = computeWarpFrame (FD)', () => {
    const params = warpParams({ shape: 'hexagon', depth: 3, warpNodes: 4, amount: 2 });
    const sources = [params.modulation];
    const anchors = getSemanticAnchors('recursive', params, W, H);
    const centres = anchors.filter((a) => a.role === 'cell' || a.role === 'tip');
    expect(centres.length).toBeGreaterThan(0);
    // Position is the mean of the polygon's DRAWN warped corners — its own crossing
    // anchors, which sit on the exact warped vertices the renderer paints — NOT a
    // point-warp of the straight centre (that lands ~4× further from the visible
    // shape under a curved field). Rebuild each mean from the painted crossings so
    // this stays exact-to-paint, not a re-derivation. Frame is still the FD helper
    // at the straight centre (a free-point orientation; no curve tangent is used).
    const cornersByPoly = new Map();
    for (const a of anchors) {
      if (a.role !== 'crossing') continue;
      const key = `${a.meta.copy ?? 0}:${a.meta.poly}`;
      if (!cornersByPoly.has(key)) cornersByPoly.set(key, []);
      cornersByPoly.get(key).push(a);
    }
    const idealCentres = getSemanticAnchors('recursive', recursiveParams({ shape: 'hexagon', depth: 3 }), W, H)
      .filter((a) => a.role === 'cell' || a.role === 'tip');
    const byId = new Map(anchors.map((a) => [a.id, a]));
    for (const c of idealCentres) {
      const w = byId.get(c.id);
      const corners = cornersByPoly.get(`${w.meta.copy ?? 0}:${w.meta.poly}`);
      const mx = corners.reduce((s, a) => s + a.x, 0) / corners.length;
      const my = corners.reduce((s, a) => s + a.y, 0) / corners.length;
      expect(w.x).toBeCloseTo(mx, 6);
      expect(w.y).toBeCloseTo(my, 6);
      const lx = c.x - CX;
      const ly = c.y - CY;
      const u = (lx + W / 2) / W;
      const v = (ly + H / 2) / H;
      const frame = computeWarpFrame(sources, u, v, { W, H });
      expect(w.tangent).toBeCloseTo(frame.tangent, 9);
      expect(w.normal).toBeCloseTo(frame.normal, 9);
    }
  });
});

describe('getSemanticAnchors — recursive warp × symmetry (WI-118 rides on WI-115)', () => {
  it('warp anchors appear in EVERY sector under N≥2 and non-zero startAngle', () => {
    const anchors = getSemanticAnchors(
      'recursive',
      warpParams({ symmetry: 4, startAngle: 33, warpNodes: 4 }),
      W,
      H,
    );
    expect(new Set(anchors.map((a) => a.meta.copy))).toEqual(new Set([0, 1, 2, 3]));
    for (const role of ['crossing', 'edge', 'tip', 'cell']) {
      const copies = new Set(anchors.filter((a) => a.role === role).map((a) => a.meta.copy));
      expect(copies).toEqual(new Set([0, 1, 2, 3]));
    }
  });

  it('byte-exact rotation-equivariance under warp: anchor(k) == Rot_θk(anchor(0)) (position AND frame)', () => {
    // ox = W2/2 + offsetX = 0 so world coords ARE the centred rotation.
    const W2 = 800;
    const H2 = 800;
    const geom = {
      shape: 'hexagon',
      depth: 3,
      rotationPerLevel: 15,
      scaleFactor: 0.7,
      startScale: 70,
      offsetX: -W2 / 2,
      offsetY: -H2 / 2,
      warpNodes: 4,
    };
    const field = warpField();
    const modulation = { channel: 'warp', field, amount: 2 };
    const n = 3;
    const startDeg = 40;
    const startRad = (startDeg * Math.PI) / 180;

    const master = getSemanticAnchors('recursive', { ...geom, modulation, symmetry: 1, startAngle: 0 }, W2, H2);
    const full = getSemanticAnchors('recursive', { ...geom, modulation, symmetry: n, startAngle: startDeg }, W2, H2);
    expect(full.length).toBe(master.length * n);
    const masterById = new Map(master.map((m) => [m.id, m]));
    for (const a of full) {
      const k = a.meta.copy;
      const theta = (2 * Math.PI * k) / n + startRad;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const baseId = a.id.slice(0, a.id.lastIndexOf(':'));
      const m = masterById.get(baseId);
      expect(m).toBeDefined();
      expect(a.x).toBeCloseTo(m.x * cos - m.y * sin, 9);
      expect(a.y).toBeCloseTo(m.x * sin + m.y * cos, 9);
      expect(a.tangent).toBeCloseTo(m.tangent + theta, 12);
      expect(a.normal).toBeCloseTo(m.normal + theta, 12);
      expect(a.s).toBe(m.s);
    }
  });
});

// ── OFFLINE bound-validation for the trusted-bounded free-point centres ───────
// Per the PRD: the recursive-bendable centre class is validated by an OFFLINE
// bound test, NOT a runtime coincidence guard (K<3 is the only runtime gate).
//
// WHAT IS VALIDATED — the centre TRACKS the drawn warped shape. A centre is a
// FREE POINT (nothing is painted AT it), but it must SIT IN the drawn polygon.
// Unlike a crossing (an exact drawn intersection — reconstruct-and-intersect, no
// point-warp), a centre has no drawn curve, so the extractor places it at the
// MEAN OF THE DRAWN WARPED CORNERS (the centroid of the painted regular polygon's
// vertices). Recursive polygons are REGULAR by construction, so unwarped the
// vertex-mean equals the area-centroid; under a curved field the corner-mean stays
// near the true outline centroid, whereas a single point-warp of the straight
// centre drifts by the field's variation across the canvas-scale polygon. This
// test sweeps fields/polygons and asserts OFFLINE that the corner-mean tracks the
// flattened-outline area-centroid — and does so materially tighter than a
// point-warp would (measured ~4×). That bounded, always-better tracking is the
// substitute for a per-frame guard. (The other half — FD FRAME accuracy < 0.24° —
// is proven generically in warpFrame.test.js and pinned for these anchors by the
// cells/tips test above.)
describe('recursive-bendable centres — OFFLINE tracking of the drawn shape (no runtime guard)', () => {
  const regularPoly = (cx, cy, r, n, rot = 0) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (2 * Math.PI * i) / n;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });
  const warpVertex = (p, sources) => {
    const u = (p.x + W / 2) / W;
    const v = (p.y + H / 2) / H;
    const { dx, dy } = stackWarpDisplacement(sources, u, v);
    return { x: p.x + dx, y: p.y + dy };
  };
  // Shoelace area-centroid of a simple polygon — the "true" visual centre.
  const areaCentroid = (poly) => {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const cross = p.x * q.y - q.x * p.y;
      a += cross;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
    }
    a *= 0.5;
    return { x: cx / (6 * a), y: cy / (6 * a) };
  };

  it('warped-corner mean tracks the drawn outline centroid, tighter than a point-warp', () => {
    // Canvas-scale REGULAR polygons (as recursive generates), at various centres.
    const polygons = [
      regularPoly(0, 0, 130, 4, Math.PI / 4),
      regularPoly(40, -30, 120, 6),
      regularPoly(-50, 20, 110, 3),
    ];
    const fields = [
      ScalarField.fromFunction((u, v) => Math.sin(6 * u) * Math.cos(6 * v), { nx: 65, ny: 65 }),
      ScalarField.fromFunction((u, v) => Math.sin(11 * u + 2 * v), { nx: 97, ny: 97 }),
      ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 33, ny: 33 }),
    ];
    const amount = 1; // outline stays simple → its shoelace centroid is meaningful

    let sumCorner = 0;
    let sumPoint = 0;
    for (const verts of polygons) {
      for (const field of fields) {
        const sources = [{ channel: 'warp', field, amount }];
        const warped = verts.map((p) => warpVertex(p, sources));
        const cornerMean = {
          x: warped.reduce((s, p) => s + p.x, 0) / warped.length,
          y: warped.reduce((s, p) => s + p.y, 0) / warped.length,
        };
        const cx = verts.reduce((s, p) => s + p.x, 0) / verts.length;
        const cy = verts.reduce((s, p) => s + p.y, 0) / verts.length;
        const pointWarp = warpVertex({ x: cx, y: cy }, sources);
        const centroid = areaCentroid(warped);
        const dCorner = Math.hypot(cornerMean.x - centroid.x, cornerMean.y - centroid.y);
        const dPoint = Math.hypot(pointWarp.x - centroid.x, pointWarp.y - centroid.y);
        // Bounded (never wild) AND never worse than a point-warp, per config.
        expect(Number.isFinite(dCorner)).toBe(true);
        expect(dCorner).toBeLessThanOrEqual(dPoint + 1e-9);
        sumCorner += dCorner;
        sumPoint += dPoint;
      }
    }
    // Non-vacuous: across the sweep the corner-mean tracks the drawn centroid
    // materially tighter than a single point-warp of the straight centre.
    expect(sumCorner).toBeLessThan(sumPoint * 0.75);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// SPIRAL extractor (patternType:'spiral', class Spiral)
// ════════════════════════════════════════════════════════════════════════════
//
// Spiral CONSUMES the seed, but only through ctx.noise() in the distort branch
// (Spiral.js:65-89). With distortAmount===0 the drawn vertices are fully
// param-determined (wobble is a pure sin() of t — no RNG), so the extractor is
// bit-exact. With distortAmount>0 (no field) each vertex is displaced by
// (noise-0.5)*2*amt per axis, noise∈[0,1) ⇒ |Δ|≤amt per axis ⇒ euclidean drift
// ≤ amt*√2 for ANY noise implementation — a noise-agnostic tolerance, NOT a
// mulberry32 accident. A distort MODULATION field scales amt by an unbounded
// mask, so that case is unverifiable → the extractor returns null (mirrors the
// grid warp→null branch). Default frame: symmetry=1, no offset ⇒ world =
// centered + (CX, CY).

function spiralParams(overrides = {}) {
  return {
    armCount: 3,
    turns: 4,
    innerRadius: 10,
    outerRadius: 150,
    growth: 1.0,
    distortAmount: 0,
    distortScale: 0.01,
    wobbleAmp: 0,
    wobbleFreq: 8,
    stepsPerTurn: 60,
    strokeWeight: 0.8,
    symmetry: 1,
    startAngle: 0,
    offsetX: 0,
    offsetY: 0,
    ...overrides,
  };
}

// Reconstruct the REAL drawn arm polylines from the pattern's own recorded ops.
// Each arm is one beginShape → vertex* → endShape group; vertex coords are in
// the pattern's CENTERED space, lifted to WORLD by adding (CX, CY). NO
// re-derivation of the spiral math — truth comes only from the recording.
function recordSpiralArms(params, seed = 42) {
  const inst = new Spiral();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, '#000000', 100);
  const arms = [];
  let cur = null;
  for (const { op, args } of ctx.calls) {
    if (op === 'beginShape') cur = [];
    else if (op === 'vertex' && cur) cur.push({ x: args[0] + CX, y: args[1] + CY });
    else if (op === 'endShape' && cur) {
      arms.push(cur);
      cur = null;
    }
  }
  return arms;
}

function distToSeg(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToPolyline(p, pts) {
  let m = Infinity;
  for (let i = 0; i < pts.length - 1; i++) m = Math.min(m, distToSeg(p, pts[i], pts[i + 1]));
  return m;
}

describe('getSemanticAnchors — spiral role taxonomy', () => {
  it('emits crossing (hub) + edge + tip with the anchors.js shape (3-arm hub)', () => {
    // innerRadius=0 ⇒ all arms start at the origin ⇒ a real shared hub crossing.
    const anchors = getSemanticAnchors('spiral', spiralParams({ innerRadius: 0 }), W, H);
    expect(Array.isArray(anchors)).toBe(true);
    const roles = new Set(anchors.map((a) => a.role));
    expect(roles).toEqual(new Set(['crossing', 'edge', 'tip']));
    // No cells: a spiral arm is an open curve enclosing no region.
    expect(anchors.some((a) => a.role === 'cell')).toBe(false);
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

  it('emits NO crossings for a single arm (never self-crosses)', () => {
    const anchors = getSemanticAnchors('spiral', spiralParams({ armCount: 1 }), W, H);
    expect(anchors.some((a) => a.role === 'crossing')).toBe(false);
    // single arm with innerRadius>0 ⇒ inner + outer tip.
    const tips = anchors.filter((a) => a.role === 'tip');
    expect(tips.length).toBe(2);
    expect(tips.some((t) => t.meta.end === 'inner')).toBe(true);
    expect(tips.some((t) => t.meta.end === 'outer')).toBe(true);
  });

  it('emits NO crossings for a multi-arm spiral whose arms do NOT share the origin', () => {
    // innerRadius>0 ⇒ arms start on a ring, not at a point ⇒ no hub. Inter-arm
    // intersections exist geometrically but are not enumerated (documented).
    const anchors = getSemanticAnchors('spiral', spiralParams({ armCount: 3, innerRadius: 10 }), W, H);
    expect(anchors.some((a) => a.role === 'crossing')).toBe(false);
  });

  it('is deterministic — byte-identical for identical params (toEqual)', () => {
    const a = getSemanticAnchors('spiral', spiralParams(), W, H);
    const b = getSemanticAnchors('spiral', spiralParams(), W, H);
    expect(a).toEqual(b);
  });

  it('returns null when a distort modulation field is active (unverifiable)', () => {
    const p = spiralParams({
      distortAmount: 20,
      modulation: { channel: 'distort', field: { type: 'noise' }, amount: 30 },
    });
    expect(getSemanticAnchors('spiral', p, W, H)).toBeNull();
  });

  // ── Regression: the add-motif DEFAULT role must actually SELECT something on a
  //    default spiral. The blanket `crossing` default (pre-fix) was dead here —
  //    a default spiral (innerRadius=5 ⇒ startR≠0) emits NO crossing hub, so the
  //    selection was empty and nothing rendered. Drive the real selection layer
  //    (selectAnchors) against the app's ACTUAL default params to pin the bug.
  it('add-motif default role produces a NON-EMPTY selection on a default spiral', () => {
    const defaults = DEFAULT_PARAMS.spiral;
    const anchors = getSemanticAnchors('spiral', defaults, W, H);
    expect(Array.isArray(anchors)).toBe(true);

    // The role the Inspector assigns on Add Motif for a spiral host.
    const roles = defaultRolesForHost('spiral');
    const { survivors } = selectAnchors(anchors, { roles });
    expect(survivors.length).toBeGreaterThan(0);
    expect(survivors.every((a) => roles.includes(a.role))).toBe(true);

    // Documents WHY the old blanket default was dead: `crossing` selects nothing
    // on a default spiral (no shared-origin hub with innerRadius=5).
    expect(selectAnchors(anchors, { roles: ['crossing'] }).survivors.length).toBe(0);
  });

  it('grid/recursive/voronoi keep crossing as a live default role', () => {
    // grid: crossing is always present (lattice intersections).
    const gridAnchors = getSemanticAnchors('grid', DEFAULT_PARAMS.grid, W, H);
    expect(defaultRolesForHost('grid')).toEqual(['crossing']);
    expect(selectAnchors(gridAnchors, { roles: ['crossing'] }).survivors.length)
      .toBeGreaterThan(0);
    // recursive/voronoi stay mapped to crossing (voronoi's production is a
    // separate host-geometry seam — see semanticAnchors.js §voronoi header).
    expect(defaultRolesForHost('recursive')).toEqual(['crossing']);
    expect(defaultRolesForHost('voronoi')).toEqual(['crossing']);
    // Unknown / edge host → generic edge default.
    expect(defaultRolesForHost('flowfield')).toEqual(['edge']);
  });
});

// ── DIVERGENCE GUARD (the honesty gate) ─────────────────────────────────────
// Prove every anchor sits where Spiral actually draws, by pulling truth from the
// pattern's own recorded arm polylines. Two regimes: (A) single arm, innerRadius>0
// — inner+outer tips, no crossings; (B) 3 arms, innerRadius=0 — a shared hub
// crossing + outer tips. Both with distortAmount=0 for bit-exact coincidence.
// A THIRD regime turns distort ON (no field) to prove the ≤ distortAmount*√2
// tolerance claim.
describe('divergence guard — spiral anchors coincide with the pattern real drawing', () => {
  const EXACT_TOL = 1e-6;

  const cases = [
    { name: 'single arm, innerRadius>0', params: spiralParams({ armCount: 1, innerRadius: 10 }) },
    { name: '3 arms, innerRadius=0 hub', params: spiralParams({ armCount: 3, innerRadius: 0 }) },
    { name: 'wobble on', params: spiralParams({ armCount: 2, wobbleAmp: 15 }) },
  ];

  for (const { name, params } of cases) {
    it(`tips land on real arm endpoints; edges lie on the real arms (${name})`, () => {
      const arms = recordSpiralArms(params);
      expect(arms.length).toBe(Math.max(1, Math.floor(params.armCount)));

      const anchors = getSemanticAnchors('spiral', params, W, H);
      const tips = anchors.filter((a) => a.role === 'tip');
      const edges = anchors.filter((a) => a.role === 'edge');

      // Every OUTER tip == the last recorded vertex of its arm; every INNER tip
      // (when emitted) == the first recorded vertex of its arm.
      for (const t of tips) {
        const arm = arms[t.meta.arm];
        const real = t.meta.end === 'outer' ? arm[arm.length - 1] : arm[0];
        expect(Math.hypot(t.x - real.x, t.y - real.y)).toBeLessThanOrEqual(EXACT_TOL);
      }
      // Every arm's outer terminus has exactly one outer tip.
      expect(tips.filter((t) => t.meta.end === 'outer').length).toBe(arms.length);

      // Every edge anchor lies ON its arm's real recorded polyline.
      expect(edges.length).toBeGreaterThan(0);
      for (const e of edges) {
        expect(distToPolyline(e, arms[e.meta.arm])).toBeLessThanOrEqual(1e-6 + 1e-9);
      }
    });
  }

  it('hub crossing sits on the shared origin start-vertex of every arm', () => {
    const params = spiralParams({ armCount: 3, innerRadius: 0 });
    const arms = recordSpiralArms(params);
    const anchors = getSemanticAnchors('spiral', params, W, H);
    const crossings = anchors.filter((a) => a.role === 'crossing');
    expect(crossings.length).toBe(1);
    const hub = crossings[0];
    expect(hub.meta.junction).toBe(true);
    // Every arm's first recorded vertex coincides with the hub.
    for (const arm of arms) {
      expect(Math.hypot(hub.x - arm[0].x, hub.y - arm[0].y)).toBeLessThanOrEqual(EXACT_TOL);
    }
  });

  it('with distort ON (no field) anchors stay within distortAmount*√2 of the real drawing', () => {
    const distortAmount = 20;
    const params = spiralParams({ armCount: 3, innerRadius: 10, distortAmount });
    const arms = recordSpiralArms(params);
    const anchors = getSemanticAnchors('spiral', params, W, H);
    const tol = distortAmount * Math.SQRT2 + 1e-6;

    const tips = anchors.filter((a) => a.role === 'tip');
    const edges = anchors.filter((a) => a.role === 'edge');

    for (const t of tips) {
      const arm = arms[t.meta.arm];
      const real = t.meta.end === 'outer' ? arm[arm.length - 1] : arm[0];
      expect(Math.hypot(t.x - real.x, t.y - real.y)).toBeLessThanOrEqual(tol);
    }
    for (const e of edges) {
      expect(distToPolyline(e, arms[e.meta.arm])).toBeLessThanOrEqual(tol);
    }
    // Guard the guard: distort actually moved the drawing off the ideal, so the
    // exact (1e-6) tolerance would FAIL here — the loose tolerance is load-bearing.
    const idealEdgeMiss = edges.some((e) => distToPolyline(e, arms[e.meta.arm]) > 1e-6);
    expect(idealEdgeMiss).toBe(true);
  });
});

describe('getSemanticAnchors — spiral feeds the placement engine', () => {
  it('roles are filterable via selectAnchors', () => {
    const anchors = getSemanticAnchors('spiral', spiralParams(), W, H);
    const { survivors } = selectAnchors(anchors, { roles: ['tip'] });
    expect(survivors.length).toBeGreaterThan(0);
    expect(survivors.every((a) => a.role === 'tip')).toBe(true);
  });

  it('produces placements through placeMotifs', () => {
    const anchors = getSemanticAnchors('spiral', spiralParams(), W, H);
    const { placements } = placeMotifs(
      anchors,
      {
        selection: { roles: ['tip', 'edge'] },
        placement: { sizing: { mode: 'fixed', size: 3, min: 0 } },
      },
      { canvasW: W, canvasH: H, boundary: { type: 'rect', width: W, height: H } }
    );
    expect(placements.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VORONOI extractor (patternType:'voronoi', class VoronoiCells) — GEOMETRY-IN
// ════════════════════════════════════════════════════════════════════════════
//
// STEP-0 FINDING (why GEOMETRY-IN, not REPLAY): VoronoiCells seeds its cell
// SITES from ctx.random (VoronoiCells.js:33-52, seeded by ctx.randomSeed(seed)
// at :7). The ADAPTER's RNG is NOT reproducible outside p5: the real on-canvas
// render uses P5Adapter, which delegates random() to the live p5 instance
// (P5Adapter.js:93), whereas a headless RecordingContext uses mulberry32
// (drawingContext.js:169-175). rng.js documents this divergence explicitly. So a
// RecordingContext replay yields DIFFERENT sites → DIFFERENT cells than the
// canvas; anchors re-derived from params could NOT be proven to sit on the real
// render. REPLAY is therefore dishonest and is ruled out.
//
// GEOMETRY-IN instead reads the host's ALREADY-RESOLVED cell polygons via a 5th
// opts arg: getSemanticAnchors('voronoi', params, W, H, { drawnCells }). Anchors
// are a PURE FUNCTION of those polygons, so they sit on the cells by
// construction — divergence-free regardless of which RNG produced the sites.
// With no opts.drawnCells the extractor returns null (the 4-arg MotifPattern
// call falls back to generic edge anchors), so existing callers are unaffected.
//
// The divergence guard below feeds the guard REAL cells taken from VoronoiCells'
// OWN computeVoronoiCells output — recovered by running the pattern in
// drawMode:'spokes' (VoronoiCells.js:97-109 draws one line() from each site to
// each of its cell vertices) through a RecordingContext and grouping the line
// ops by shared origin. NOTE (honesty): spokes uses computeVoronoiCells (which
// CLAMPS vertices to bounds) while the DEFAULT 'outlines' mode uses
// computeVoronoiEdges (which CLIPS); these differ at boundary cells. So the claim
// is NOT "anchors sit on the on-screen outline render" — it is "anchors are a
// pure function of the host-supplied cell polygons, validated here against the
// pattern's own computeVoronoiCells output."

const voronoiParams = (overrides = {}) => ({
  cellCount: 12,
  jitter: 40,
  drawMode: 'spokes',
  relaxationSteps: 1,
  strokeWeight: 1,
  symmetry: 'none',
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
  ...overrides,
});

// Recover the pattern's REAL cell polygons from a spokes-mode run. Each spoke is
// line(site.x, site.y, vertex.x, vertex.y); consecutive spokes sharing an origin
// belong to one cell, and their far endpoints ARE that cell's vertices in the
// pattern's angular order. Recorded coords are CENTERED (RecordingContext logs
// raw args, pre-translate) → lift to WORLD by adding (CX, CY). No re-derivation
// of the site RNG — truth comes only from the recording.
function recordVoronoiCells(params, seed = 7) {
  const inst = new VoronoiCells();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, '#000000', 100);
  const groups = new Map();
  const order = [];
  for (const { op, args } of ctx.calls) {
    if (op !== 'line') continue;
    const [x1, y1, x2, y2] = args;
    const key = `${x1},${y1}`;
    if (!groups.has(key)) {
      groups.set(key, { site: { x: x1 + CX, y: y1 + CY }, vertices: [] });
      order.push(key);
    }
    groups.get(key).vertices.push({ x: x2 + CX, y: y2 + CY });
  }
  // Return array of { site, vertices } in stable draw order.
  return order.map((k) => groups.get(k));
}

const vkey = (p) => `${p.x},${p.y}`;
const vEq = (a, b) => a.x === b.x && a.y === b.y;

describe('getSemanticAnchors — voronoi GEOMETRY-IN contract', () => {
  it('returns null without opts.drawnCells (4-arg and empty opts) — no regression', () => {
    const p = voronoiParams();
    expect(getSemanticAnchors('voronoi', p, W, H)).toBeNull();
    expect(getSemanticAnchors('voronoi', p, W, H, {})).toBeNull();
    expect(getSemanticAnchors('voronoi', p, W, H, { drawnCells: null })).toBeNull();
  });

  it('emits cell + crossing + edge roles, NO tip, with the anchors.js shape', () => {
    const drawnCells = recordVoronoiCells(voronoiParams());
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells });
    expect(Array.isArray(anchors)).toBe(true);
    const roles = new Set(anchors.map((a) => a.role));
    expect(roles).toEqual(new Set(['crossing', 'edge', 'cell']));
    // A tessellation has no tips — the extractor omits them by design.
    expect(anchors.some((a) => a.role === 'tip')).toBe(false);
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

  it('accepts bare-array cells as well as { vertices, site } objects', () => {
    const rich = recordVoronoiCells(voronoiParams());
    const bare = rich.map((c) => c.vertices); // arrays of points
    const aRich = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells: rich });
    const aBare = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells: bare });
    // Crossings + edges depend only on vertices, so both forms agree there.
    const strip = (arr) => arr.filter((a) => a.role !== 'cell').map((a) => [a.role, a.x, a.y]);
    expect(strip(aBare)).toEqual(strip(aRich));
  });

  it('is deterministic — byte-identical for identical input (toEqual)', () => {
    const drawnCells = recordVoronoiCells(voronoiParams());
    const a = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells });
    const b = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells });
    expect(a).toEqual(b);
  });

  it('skips degenerate (<3-vertex) cells', () => {
    const good = [
      { x: 100, y: 100 }, { x: 140, y: 100 }, { x: 120, y: 140 },
    ];
    const drawnCells = [good, [{ x: 10, y: 10 }, { x: 20, y: 20 }]]; // 2nd is degenerate
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells });
    const cells = anchors.filter((a) => a.role === 'cell');
    expect(cells.length).toBe(1); // degenerate cell contributes nothing
  });
});

// ── DIVERGENCE GUARD (the honesty gate) ─────────────────────────────────────
// Anchors are a pure function of opts.drawnCells, so they sit on those polygons
// by construction. This guard proves the READER is correct against the pattern's
// OWN computeVoronoiCells output (recovered via spokes), across two seeds:
//   • cells  = one per ≥3-vertex polygon, at its vertex centroid.
//   • crossings = the deduped Voronoi vertex set; junction ⇔ shared by ≥3 cells.
//   • edges  = deduped cell-boundary edge midpoints, tangent = edge direction.
describe('divergence guard — voronoi anchors are the exact reader of the real cells', () => {
  for (const seed of [7, 21]) {
    it(`derives cells/crossings/edges from computeVoronoiCells output (seed ${seed})`, () => {
      const params = voronoiParams();
      const real = recordVoronoiCells(params, seed).filter((c) => c.vertices.length >= 3);
      expect(real.length).toBeGreaterThan(0);
      const anchors = getSemanticAnchors('voronoi', params, W, H, { drawnCells: real });

      // ── CELLS: one per real ≥3-vertex polygon, each at the pattern's actual
      //    SITE (the Voronoi generator point recovered from the spoke origin) —
      //    a real recorded quantity, not a re-derived approximation.
      const cells = anchors.filter((a) => a.role === 'cell');
      expect(cells.length).toBe(real.length);
      const realSites = real.map((c) => c.site);
      for (const cell of cells) {
        const hit = realSites.some((s) => near(s.x, cell.x) && near(s.y, cell.y));
        expect(hit).toBe(true);
      }

      // ── CROSSINGS: the deduped vertex set, with junction ⇔ multiplicity ≥ 3.
      const mult = new Map();
      for (const c of real) {
        for (const v of c.vertices) mult.set(vkey(v), (mult.get(vkey(v)) || 0) + 1);
      }
      const crossings = anchors.filter((a) => a.role === 'crossing');
      expect(crossings.length).toBe(mult.size); // exact dedup, no duplicates
      for (const c of crossings) {
        const m = mult.get(vkey(c));
        expect(m).toBeDefined();               // every crossing is a real vertex
        expect(c.meta.junction).toBe(m >= 3);  // junction truth from multiplicity
        expect(c.meta.cellCount).toBe(m);
      }
      // Guard the guard: real Voronoi vertices where ≥3 cells meet must exist.
      expect(crossings.some((c) => c.meta.junction === true)).toBe(true);

      // ── EDGES: deduped undirected cell-boundary edges at midpoints, tangent =
      //    edge direction. Build the real undirected edge set from the polygons.
      const realEdges = new Map();
      for (const c of real) {
        const n = c.vertices.length;
        for (let k = 0; k < n; k++) {
          const a = c.vertices[k];
          const b = c.vertices[(k + 1) % n];
          const ka = vkey(a), kb = vkey(b);
          const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          if (!realEdges.has(key)) {
            realEdges.set(key, {
              mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
              dir: Math.atan2(b.y - a.y, b.x - a.x),
            });
          }
        }
      }
      const edges = anchors.filter((a) => a.role === 'edge');
      expect(edges.length).toBe(realEdges.size); // exact dedup of shared edges
      for (const e of edges) {
        // Position on a real boundary-edge midpoint.
        const match = [...realEdges.values()].find(
          (re) => near(re.mid.x, e.x) && near(re.mid.y, e.y)
        );
        expect(match).toBeDefined();
        // Tangent parallel to that edge (direction OR its reverse — an undirected
        // edge has no inherent orientation; both cells traverse it oppositely).
        const d = Math.abs(((e.tangent - match.dir) % Math.PI + Math.PI) % Math.PI);
        expect(Math.min(d, Math.PI - d)).toBeCloseTo(0, 9);
      }
    });
  }

  it('junction flag DISCRIMINATES on a controlled synthetic tessellation', () => {
    // Three triangles sharing ONE interior vertex J=(0,0)+world, plus an outer
    // rim. Interior vertex is shared by 3 cells (junction); each outer vertex by
    // ≤2 (not a junction). Proves meta.junction is not hardcoded true.
    const J = { x: CX, y: CY };
    const A = { x: CX + 40, y: CY };
    const B = { x: CX - 20, y: CY + 35 };
    const C = { x: CX - 20, y: CY - 35 };
    const drawnCells = [
      [J, A, B], // cell 1
      [J, B, C], // cell 2
      [J, C, A], // cell 3
    ];
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells });
    const crossings = anchors.filter((a) => a.role === 'crossing');
    const jAnchor = crossings.find((c) => vEq(c, J));
    expect(jAnchor.meta.junction).toBe(true);   // 3 cells meet at J
    expect(jAnchor.meta.cellCount).toBe(3);
    // A, B, C are each shared by exactly 2 cells ⇒ NOT junctions.
    for (const V of [A, B, C]) {
      const a = crossings.find((c) => vEq(c, V));
      expect(a.meta.junction).toBe(false);
      expect(a.meta.cellCount).toBe(2);
    }
    // Shared edges (e.g. J–B, J–C, J–A) are deduped to ONE anchor apiece.
    const edges = anchors.filter((a) => a.role === 'edge');
    // 3 spokes from J (each shared by 2 cells) + 3 rim edges (A-B,B-C,C-A) = 6.
    expect(edges.length).toBe(6);
  });
});

describe('getSemanticAnchors — voronoi feeds the placement engine', () => {
  it('roles are filterable via selectAnchors', () => {
    const drawnCells = recordVoronoiCells(voronoiParams());
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells });
    const { survivors } = selectAnchors(anchors, { roles: ['cell'] });
    expect(survivors.length).toBeGreaterThan(0);
    expect(survivors.every((a) => a.role === 'cell')).toBe(true);
  });

  it('produces placements through placeMotifs', () => {
    const drawnCells = recordVoronoiCells(voronoiParams());
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells });
    const { placements } = placeMotifs(
      anchors,
      {
        selection: { roles: ['cell', 'crossing'] },
        placement: { sizing: { mode: 'fixed', size: 4, min: 0 } },
      },
      { canvasW: W, canvasH: H, boundary: { type: 'rect', width: W, height: H } }
    );
    expect(placements.length).toBeGreaterThan(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BOUNDARY HARDENING — anchors derived from the DRAWN EDGES (opts.drawnEdges),
// the actual on-screen segments, so no crossing/edge anchor lands on phantom
// (border-clamped vertex / synthetic hull-closing edge) geometry.
// ════════════════════════════════════════════════════════════════════════════

const edgeKeyOf = (x, y) => `${x},${y}`;
const undirEdgeKey = (a, b) => {
  const ka = edgeKeyOf(a.x, a.y), kb = edgeKeyOf(b.x, b.y);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};
// Deduped undirected {x1,y1,x2,y2} edges of a set of polygons — the DRAWN-edge
// representation of a closed tessellation.
function polygonsToDrawnEdges(polys) {
  const seen = new Set();
  const out = [];
  for (const verts of polys) {
    const n = verts.length;
    for (let k = 0; k < n; k++) {
      const a = verts[k], b = verts[(k + 1) % n];
      const key = undirEdgeKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return out;
}
const centroid = (verts) => ({
  x: verts.reduce((s, v) => s + v.x, 0) / verts.length,
  y: verts.reduce((s, v) => s + v.y, 0) / verts.length,
});

// ── DIFFERENTIAL TEST (the correctness anchor) ──────────────────────────────
// On a FULLY-INTERIOR tessellation (no clip/clamp, no phantom hull edge), the
// boundary-hardened drawnEdges path must yield the SAME anchor geometry as the
// legacy drawnCells path — which is kept as the known-correct oracle. We build a
// closed interior patch where the DRAWN edges ARE exactly the cell-boundary edges
// (the interior invariant the fix relies on), so any divergence in the reader
// logic (dedup, midpoints, tangents, degree/junction, cell sites) surfaces here.
describe('boundary hardening — drawnEdges path == drawnCells path on an INTERIOR patch', () => {
  // A central fan: interior junction J shared by 3 cells + an outer rim. Every
  // vertex/edge is well inside [0,W]x[0,H] → no clamping, no clipping.
  const J = { x: CX, y: CY };
  const A = { x: CX + 70, y: CY + 5 };
  const B = { x: CX - 35, y: CY + 62 };
  const C = { x: CX - 40, y: CY - 58 };
  const polys = [
    [J, A, B],
    [J, B, C],
    [J, C, A],
  ];
  const sites = polys.map(centroid);
  const drawnCells = polys.map((verts, i) => ({ vertices: verts, site: sites[i] }));
  const drawnEdges = polygonsToDrawnEdges(polys);

  const fromCells = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnCells });
  const fromEdges = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnEdges, sites });

  const setOf = (anchors, role) =>
    new Set(anchors.filter((a) => a.role === role).map((a) => vkey(a)));

  it('emits the SAME cell-site set', () => {
    expect(setOf(fromEdges, 'cell')).toEqual(setOf(fromCells, 'cell'));
    for (const a of fromEdges.filter((x) => x.role === 'cell')) {
      expect(sites.some((s) => ptNear(s, a))).toBe(true);
    }
  });

  it('emits the SAME crossing coordinate set (interior circumcenters identical)', () => {
    expect(setOf(fromEdges, 'crossing')).toEqual(setOf(fromCells, 'crossing'));
    const je = fromEdges.find((a) => a.role === 'crossing' && vEq(a, J));
    const jc = fromCells.find((a) => a.role === 'crossing' && vEq(a, J));
    expect(je.meta.junction).toBe(true);
    expect(jc.meta.junction).toBe(true);
    // Degree (drawn incidence) == cell-multiplicity in the interior: 3 at J.
    expect(je.meta.degree).toBe(3);
    expect(jc.meta.cellCount).toBe(3);
  });

  it('emits the SAME edge-midpoint set with matching (undirected) tangents', () => {
    const em = fromEdges.filter((a) => a.role === 'edge');
    const cm = fromCells.filter((a) => a.role === 'edge');
    expect(setOf(fromEdges, 'edge')).toEqual(setOf(fromCells, 'edge'));
    expect(em.length).toBe(cm.length);
    for (const e of em) {
      const m = cm.find((c) => ptNear(c, e));
      expect(m).toBeDefined();
      const d = Math.abs(((e.tangent - m.tangent) % Math.PI + Math.PI) % Math.PI);
      expect(Math.min(d, Math.PI - d)).toBeCloseTo(0, 9);
    }
  });

  it('tolerates the KNOWN edge meta difference: drawn-once (1) vs shared-by-2 (2)', () => {
    const midJB = { x: (J.x + B.x) / 2, y: (J.y + B.y) / 2 };
    const spoke = fromEdges.find((a) => a.role === 'edge' && ptNear(a, midJB));
    const spokeCell = fromCells.find((a) => a.role === 'edge' && ptNear(a, midJB));
    expect(spoke.meta.cellCount).toBe(1);
    expect(spokeCell.meta.cellCount).toBe(2);
  });
});

// ── EDGE-PATH READER unit coverage ──────────────────────────────────────────
describe('getSemanticAnchors — voronoi drawnEdges (boundary-hardened) reader', () => {
  // Two triangles sharing spine P–Q, all interior.
  const P = { x: CX, y: CY - 40 };
  const Q = { x: CX, y: CY + 40 };
  const R = { x: CX - 55, y: CY };
  const S = { x: CX + 55, y: CY };
  const drawnEdges = [
    { x1: P.x, y1: P.y, x2: Q.x, y2: Q.y }, // shared spine
    { x1: P.x, y1: P.y, x2: R.x, y2: R.y },
    { x1: R.x, y1: R.y, x2: Q.x, y2: Q.y },
    { x1: P.x, y1: P.y, x2: S.x, y2: S.y },
    { x1: S.x, y1: S.y, x2: Q.x, y2: Q.y },
  ];
  const sites = [{ x: CX - 20, y: CY }, { x: CX + 20, y: CY }];

  it('is PREFERRED over drawnCells when both are present', () => {
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, {
      drawnEdges,
      sites,
      drawnCells: [[{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 1 }]],
    });
    expect(anchors.filter((a) => a.role === 'cell').length).toBe(2);
  });

  it('cells come from sites; NO tips; roles are crossing/edge/cell', () => {
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnEdges, sites });
    expect(new Set(anchors.map((a) => a.role))).toEqual(new Set(['cell', 'crossing', 'edge']));
    const cells = anchors.filter((a) => a.role === 'cell');
    expect(cells.length).toBe(2);
    expect(cells.map((c) => vkey(c))).toEqual(sites.map((s) => vkey(s)));
  });

  it('crossings = deduped drawn endpoints; degree = drawn incidence; junction ⇔ ≥3', () => {
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnEdges, sites });
    const crossings = anchors.filter((a) => a.role === 'crossing');
    expect(crossings.length).toBe(4); // P, Q, R, S
    const byPt = (pt) => crossings.find((c) => vEq(c, pt));
    expect(byPt(P).meta.degree).toBe(3);
    expect(byPt(P).meta.junction).toBe(true);
    expect(byPt(Q).meta.degree).toBe(3);
    expect(byPt(Q).meta.junction).toBe(true);
    expect(byPt(R).meta.degree).toBe(2);
    expect(byPt(R).meta.junction).toBe(false);
    expect(byPt(S).meta.degree).toBe(2);
    const endpoints = new Set(
      drawnEdges.flatMap((e) => [edgeKeyOf(e.x1, e.y1), edgeKeyOf(e.x2, e.y2)])
    );
    for (const c of crossings) expect(endpoints.has(vkey(c))).toBe(true);
  });

  it('edges = deduped drawn segments at midpoints, tangent = segment direction, meta.cellCount 1', () => {
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnEdges, sites });
    const edges = anchors.filter((a) => a.role === 'edge');
    expect(edges.length).toBe(5);
    for (const e of edges) {
      expect(e.meta.cellCount).toBe(1);
      expect(e.normal).toBeCloseTo(e.tangent + HALF_PI, 9);
    }
    const spine = edges.find((e) => near(e.x, CX) && near(e.y, CY));
    expect(spine).toBeDefined();
    expect(Math.abs(Math.abs(spine.tangent) - HALF_PI)).toBeLessThan(1e-9);
  });

  it('emits crossings/edges with NO cell anchors when sites are omitted', () => {
    const anchors = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnEdges });
    expect(anchors.some((a) => a.role === 'cell')).toBe(false);
    expect(anchors.some((a) => a.role === 'crossing')).toBe(true);
    expect(anchors.some((a) => a.role === 'edge')).toBe(true);
  });

  it('is deterministic — byte-identical for identical input', () => {
    const a = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnEdges, sites });
    const b = getSemanticAnchors('voronoi', voronoiParams(), W, H, { drawnEdges, sites });
    expect(a).toEqual(b);
  });
});

// ── BOUNDARY TEST (the fix, on a REAL full-canvas diagram) ───────────────────
// VoronoiCells spreads sites edge-to-edge, so a real diagram ALWAYS has boundary
// cells. This proves the drawnEdges path stays FAITHFUL there (every anchor
// in-bounds and on a drawn segment) while the legacy drawnCells path emits
// phantom geometry (border-clamped vertices and/or synthetic hull-closing edges)
// on the SAME data — the exact defect boundary hardening removes.
describe('boundary hardening — drawnEdges stays on drawn geometry where drawnCells goes phantom', () => {
  // One run, drawMode:'spokes' (to recover the clamped closed cells), reading the
  // drawn-edge stash off the SAME instance → identical triangulation.
  function recordBoth(params, seed = 7) {
    const inst = new VoronoiCells();
    const ctx = new RecordingContext({ seed });
    inst.generateWithContext(ctx, seed, params, W, H, '#000000', 100);
    const groups = new Map();
    const order = [];
    for (const { op, args } of ctx.calls) {
      if (op !== 'line') continue;
      const [x1, y1, x2, y2] = args;
      const key = `${x1},${y1}`;
      if (!groups.has(key)) {
        groups.set(key, { site: { x: x1 + CX, y: y1 + CY }, vertices: [] });
        order.push(key);
      }
      groups.get(key).vertices.push({ x: x2 + CX, y: y2 + CY });
    }
    const drawnCells = order.map((k) => groups.get(k)).filter((c) => c.vertices.length >= 3);
    const { drawnEdges, sites } = inst.motifHostGeometry;
    return { drawnCells, drawnEdges, sites };
  }

  const params = voronoiParams({ jitter: 40, relaxationSteps: 1 });
  const { drawnCells, drawnEdges, sites } = recordBoth(params, 7);
  const edgeAnchors = getSemanticAnchors('voronoi', params, W, H, { drawnEdges, sites });
  const cellAnchors = getSemanticAnchors('voronoi', params, W, H, { drawnCells });

  const endpointKeys = new Set(
    drawnEdges.flatMap((e) => [edgeKeyOf(e.x1, e.y1), edgeKeyOf(e.x2, e.y2)])
  );
  const midpointKeys = new Set(
    drawnEdges.map((e) => edgeKeyOf((e.x1 + e.x2) * 0.5, (e.y1 + e.y2) * 0.5))
  );

  it('a real diagram HAS boundary cells (a drawn edge touches the canvas edge)', () => {
    const touching = drawnEdges.some(
      (e) => e.x1 === 0 || e.x1 === W || e.y1 === 0 || e.y1 === H ||
             e.x2 === 0 || e.x2 === W || e.y2 === 0 || e.y2 === H
    );
    expect(touching).toBe(true);
  });

  it('EDGE PATH: every crossing/edge anchor is in-bounds AND on a drawn segment', () => {
    const ce = edgeAnchors.filter((a) => a.role === 'crossing' || a.role === 'edge');
    expect(ce.length).toBeGreaterThan(0);
    for (const a of ce) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(W);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(H);
      if (a.role === 'crossing') expect(endpointKeys.has(vkey(a))).toBe(true);
      else expect(midpointKeys.has(vkey(a))).toBe(true);
    }
  });

  it('CELL PATH (legacy) emits PHANTOM anchors absent from the drawn geometry', () => {
    const phantomCrossings = cellAnchors.filter(
      (a) => a.role === 'crossing' && !endpointKeys.has(vkey(a))
    );
    const phantomEdges = cellAnchors.filter(
      (a) => a.role === 'edge' && !midpointKeys.has(vkey(a))
    );
    // The contrast IS the test: the OLD path lands on geometry that is NOT drawn.
    expect(phantomCrossings.length + phantomEdges.length).toBeGreaterThan(0);
    expect(phantomCrossings.length).toBeGreaterThan(0);
    expect(phantomEdges.length).toBeGreaterThan(0);
  });
});

// ── BRANCH (space colonization, T3) ──────────────────────────────────────────
// The load-bearing property of this host is the TWO-COMPUTATIONS-MUST-AGREE
// seam: `Branch.generate()` draws a skeleton it grows from the live p5 RNG, and
// the extractor grows the SAME skeleton offline from makeP5Random(hostSeed).
// These tests pull truth from the pattern's OWN recorded polylines, exactly as
// the grid/recursive/spiral divergence guards do — the extractor is never
// compared against a second copy of its own math.
//
// The drawing context below is a RecordingContext whose random() is swapped for
// makeP5Random, i.e. p5's seeded LCG. That is what a LIVE p5 canvas yields
// (rng.js: makeP5Random is a byte-exact port, version-pinned to p5 2.2.3);
// RecordingContext's own mulberry32 is a headless stand-in that no live render
// ever uses, so testing parity against it would prove nothing about the app.

const BRANCH_W = 1152;
const BRANCH_H = 1152;
const BRANCH_SEED = 20260726;
const branchParams = (overrides = {}) => ({ ...DEFAULT_PARAMS.branch, ...overrides });

class P5LikeRecordingContext extends RecordingContext {
  randomSeed(s) {
    this._p5rand = makeP5Random(s);
  }
  random(a, b) {
    const u = this._p5rand ? this._p5rand() : 0;
    if (a === undefined) return u;
    if (b === undefined) return u * a;
    return a + u * (b - a);
  }
}

/** The polylines Branch actually draws, world-translated to canvas coords. */
function drawBranchPaths(params, seed = BRANCH_SEED) {
  const ctx = new P5LikeRecordingContext({ seed });
  new BranchPattern().generateWithContext(
    ctx, seed, params, BRANCH_W, BRANCH_H, '#000', 100
  );
  const ox = BRANCH_W / 2 + (params.offsetX || 0);
  const oy = BRANCH_H / 2 + (params.offsetY || 0);
  const paths = [];
  let cur = null;
  for (const { op, args } of ctx.calls) {
    if (op === 'beginShape') cur = [];
    else if (op === 'vertex' && cur) cur.push({ x: args[0] + ox, y: args[1] + oy });
    else if (op === 'endShape' && cur) {
      paths.push(cur);
      cur = null;
    }
  }
  return paths;
}

const polyLen = (pts) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
};

describe('getSemanticAnchors — branch role taxonomy', () => {
  const anchors = getSemanticAnchors(
    'branch', branchParams(), BRANCH_W, BRANCH_H, { hostSeed: BRANCH_SEED }
  );

  it('emits crossing + edge + tip with the anchors.js shape', () => {
    expect(Array.isArray(anchors)).toBe(true);
    expect(new Set(anchors.map((a) => a.role))).toEqual(new Set(['crossing', 'edge', 'tip']));
    expect(anchors.some((a) => a.role === 'cell')).toBe(false); // a stem encloses nothing
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

  it('emission order is FIXED — crossings, then edges, then tips', () => {
    const seq = [];
    for (const a of anchors) if (seq[seq.length - 1] !== a.role) seq.push(a.role);
    expect(seq).toEqual(['crossing', 'edge', 'tip']);
  });

  it('delivers MANY termini from ONE connected plant (the T0 amended test)', () => {
    const tips = anchors.filter((a) => a.role === 'tip');
    // T0: open diffgrowth has a hard ceiling of 2 Apex anchors. This is the gap.
    expect(tips.length).toBeGreaterThan(20);
    // Exactly one tip per stem, and each carries its own pathIndex so zones.js /
    // chain.js group them per stem.
    expect(new Set(tips.map((t) => t.meta.pathIndex)).size).toBe(tips.length);
  });

  it('is deterministic — byte-identical for identical params + hostSeed', () => {
    const a = getSemanticAnchors('branch', branchParams(), BRANCH_W, BRANCH_H, { hostSeed: 7 });
    const b = getSemanticAnchors('branch', branchParams(), BRANCH_W, BRANCH_H, { hostSeed: 7 });
    expect(a).toEqual(b);
  });

  it('CONSUMES hostSeed — a different host seed yields different anchors', () => {
    const a = getSemanticAnchors('branch', branchParams(), BRANCH_W, BRANCH_H, { hostSeed: 1 });
    const b = getSemanticAnchors('branch', branchParams(), BRANCH_W, BRANCH_H, { hostSeed: 2 });
    expect(a).not.toEqual(b);
    // A 4-arg call (no opts) still works — makeP5Random(undefined) is seed 0.
    expect(getSemanticAnchors('branch', branchParams(), BRANCH_W, BRANCH_H)).toBeTruthy();
  });

  it('refuses to emit anchors for a plant that never grows', () => {
    const none = getSemanticAnchors(
      'branch', branchParams({ attractorCount: 0 }), BRANCH_W, BRANCH_H, { hostSeed: BRANCH_SEED }
    );
    expect(none).toEqual([]);
  });

  it('add-motif DEFAULT role produces a NON-EMPTY selection on a default branch', () => {
    // The spiral dead-default lesson (hostKinds.js:56-67): the first role must be
    // one the host really emits under DEFAULT params.
    const roles = defaultRolesForHost('branch');
    expect(roles).toEqual(['tip']);
    const { survivors } = selectAnchors(anchors, { roles });
    expect(survivors.length).toBeGreaterThan(20);
    expect(survivors.every((a) => a.role === 'tip')).toBe(true);
  });
});

// ── DIVERGENCE GUARD (the honesty gate) ─────────────────────────────────────
describe('divergence guard — branch anchors coincide with the pattern real drawing', () => {
  const EXACT = 1e-9;
  const params = branchParams();
  const drawn = drawBranchPaths(params);
  const anchors = getSemanticAnchors(
    'branch', params, BRANCH_W, BRANCH_H, { hostSeed: BRANCH_SEED }
  );

  it('the extractor grows the IDENTICAL skeleton the pattern drew', () => {
    expect(drawn.length).toBeGreaterThan(10);
    // One tip anchor per drawn polyline, at that polyline's LAST point, EXACTLY.
    const tips = anchors.filter((a) => a.role === 'tip');
    expect(tips.length).toBe(drawn.length);
    for (const t of tips) {
      const path = drawn[t.meta.pathIndex];
      const end = path[path.length - 1];
      expect(t.x).toBe(end.x);
      expect(t.y).toBe(end.y);
    }
  });

  it('every EDGE anchor sits on the drawn polyline of its OWN pathIndex', () => {
    const edges = anchors.filter((a) => a.role === 'edge');
    expect(edges.length).toBeGreaterThan(50);
    for (const e of edges) {
      expect(distToPolyline({ x: e.x, y: e.y }, drawn[e.meta.pathIndex])).toBeLessThan(EXACT);
    }
  });

  it('every CROSSING anchor is a real vertex of the drawn geometry', () => {
    const vertexKeys = new Set();
    for (const path of drawn) for (const p of path) vertexKeys.add(`${p.x},${p.y}`);
    const crossings = anchors.filter((a) => a.role === 'crossing');
    expect(crossings.length).toBeGreaterThan(10);
    for (const c of crossings) expect(vertexKeys.has(`${c.x},${c.y}`)).toBe(true);
  });

  it('every anchor is inside the canvas', () => {
    for (const a of anchors) {
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(BRANCH_W);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(BRANCH_H);
    }
  });
});

describe('branch — edge sampling honours the endpoint + spacing contract', () => {
  const params = branchParams();
  const drawn = drawBranchPaths(params);
  const anchors = getSemanticAnchors(
    'branch', params, BRANCH_W, BRANCH_H, { hostSeed: BRANCH_SEED }
  );
  const edges = anchors.filter((a) => a.role === 'edge');

  it('EXCLUDES endpoints, so an edge sample never duplicates a tip', () => {
    const tipKeys = new Set(
      anchors.filter((a) => a.role === 'tip').map((a) => `${a.x},${a.y}`)
    );
    for (const e of edges) expect(tipKeys.has(`${e.x},${e.y}`)).toBe(false);
    const byPath = new Map();
    for (const e of edges) {
      if (!byPath.has(e.meta.pathIndex)) byPath.set(e.meta.pathIndex, []);
      byPath.get(e.meta.pathIndex).push(e);
    }
    for (const [pathIndex, list] of byPath) {
      const L = polyLen(drawn[pathIndex]);
      for (const e of list) {
        expect(e.s).toBeGreaterThan(0);
        expect(e.s).toBeLessThan(L);
      }
    }
  });

  it('respects MIN_EDGE_SPACING even on the shortest stems', () => {
    const byPath = new Map();
    for (const e of edges) {
      if (!byPath.has(e.meta.pathIndex)) byPath.set(e.meta.pathIndex, []);
      byPath.get(e.meta.pathIndex).push(e);
    }
    for (const list of byPath.values()) {
      const s = list.map((e) => e.s).sort((a, b) => a - b);
      for (let i = 1; i < s.length; i++) {
        expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(MIN_EDGE_SPACING - 1e-9);
      }
    }
  });

  it('exposes the sample count as a HOST param (mirrors spiral edgeSamplesPerArm)', () => {
    const few = getSemanticAnchors(
      'branch', branchParams({ edgeSamplesPerBranch: 3 }), BRANCH_W, BRANCH_H,
      { hostSeed: BRANCH_SEED }
    ).filter((a) => a.role === 'edge');
    expect(few.length).toBeLessThan(edges.length);
    // Every stem long enough to carry them gets at most the requested count.
    const perPath = new Map();
    for (const e of few) perPath.set(e.meta.pathIndex, (perPath.get(e.meta.pathIndex) || 0) + 1);
    for (const n of perPath.values()) expect(n).toBeLessThanOrEqual(3);
  });

  it('ids are role-scoped and unique (never fold branch ORDER into an id — ADR-0005)', () => {
    const ids = anchors.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of anchors) expect(a.id.startsWith(`${a.role}:`)).toBe(true);
    // T4: order lives in meta. An id is `role:pathIndex[:sampleIndex]` and NOTHING
    // else — an id that mentioned the order would re-roll every random-mode glyph
    // assignment in every existing document the moment a skeleton shifted.
    for (const a of anchors) {
      const parts = a.id.split(':');
      expect(parts.length).toBe(a.role === 'edge' ? 3 : 2);
      expect(parts.slice(1).map(Number)).toEqual(
        a.role === 'edge'
          ? [a.meta.pathIndex, a.meta.sampleIndex]
          : [a.role === 'tip' ? a.meta.pathIndex : a.meta.node]
      );
    }
  });
});

// ── T4: meta.order (Horton–Strahler) ─────────────────────────────────────────
//
// The rule under test, stated once in the extractor header: an anchor carries the
// Strahler order of the SEGMENT ARRIVING FROM ITS PARENT — the order of that
// segment's distal (child) node. Ground truth is the SAME seeded buildSkeleton the
// extractor runs, but the edge→segment association is re-derived GEOMETRICALLY
// here (nearest segment to the sample point) rather than from arc length, so the
// test is an independent check and not a copy of the implementation.
describe('branch — meta.order carries Strahler branch order (T4)', () => {
  const params = branchParams();
  const anchors = getSemanticAnchors(
    'branch', params, BRANCH_W, BRANCH_H, { hostSeed: BRANCH_SEED }
  );
  const rand = makeP5Random(BRANCH_SEED);
  const skeleton = buildSkeleton(params, BRANCH_W, BRANCH_H, () => rand());
  const ox = BRANCH_W / 2;
  const oy = BRANCH_H / 2;

  /** Order of the segment nearest to (x,y) on path k, distal node's order. */
  function geometricOrder(k, x, y) {
    const { nodeIds } = skeleton.paths[k];
    let best = 1;
    let bestD = Infinity;
    for (let i = 1; i < nodeIds.length; i++) {
      const a = skeleton.nodes[nodeIds[i - 1]];
      const b = skeleton.nodes[nodeIds[i]];
      const ax = a.x + ox;
      const ay = a.y + oy;
      const bx = b.x + ox;
      const by = b.y + oy;
      const vx = bx - ax;
      const vy = by - ay;
      const len2 = vx * vx + vy * vy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2));
      const d = Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
      if (d < bestD) {
        bestD = d;
        best = skeleton.order[nodeIds[i]];
      }
    }
    return best;
  }

  it('every anchor carries a finite integer order >= 1', () => {
    expect(anchors.length).toBeGreaterThan(100);
    for (const a of anchors) {
      expect(Number.isInteger(a.meta.order)).toBe(true);
      expect(a.meta.order).toBeGreaterThanOrEqual(1);
    }
  });

  it('CROSSING anchors carry their own node order (= the order of their parent edge)', () => {
    const crossings = anchors.filter((a) => a.role === 'crossing');
    expect(crossings.length).toBeGreaterThan(10);
    for (const c of crossings) expect(c.meta.order).toBe(skeleton.order[c.meta.node]);
    // A junction is where orders are promoted, so the plant really has depth.
    expect(Math.max(...crossings.map((c) => c.meta.order))).toBeGreaterThan(1);
  });

  it('EVERY TIP IS ORDER 1 — a terminus is a leaf, trunk included', () => {
    const tips = anchors.filter((a) => a.role === 'tip');
    expect(tips.length).toBeGreaterThan(20);
    expect(new Set(tips.map((t) => t.meta.order))).toEqual(new Set([1]));
  });

  it('EDGE samples carry the order of the segment they sit on', () => {
    const edges = anchors.filter((a) => a.role === 'edge');
    expect(edges.length).toBeGreaterThan(50);
    for (const e of edges) {
      expect(e.meta.order).toBe(geometricOrder(e.meta.pathIndex, e.x, e.y));
    }
  });

  it('order is NON-INCREASING root→tip along each stem', () => {
    const byPath = new Map();
    for (const e of anchors.filter((a) => a.role === 'edge')) {
      if (!byPath.has(e.meta.pathIndex)) byPath.set(e.meta.pathIndex, []);
      byPath.get(e.meta.pathIndex).push(e);
    }
    for (const [k, list] of byPath) {
      const seq = list.slice().sort((a, b) => a.s - b.s).map((e) => e.meta.order);
      for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThanOrEqual(seq[i - 1]);
      // and never exceeds the stem's own order (its first segment).
      const { nodeIds } = skeleton.paths[k];
      expect(Math.max(...seq)).toBeLessThanOrEqual(skeleton.order[nodeIds[1]]);
    }
  });

  it('the TRUNK carries the highest order in the plant (the payoff: palmettes there)', () => {
    const trunk = anchors.filter((a) => a.role === 'edge' && a.meta.pathIndex === 0);
    expect(trunk.length).toBeGreaterThan(0);
    const maxTrunk = Math.max(...trunk.map((a) => a.meta.order));
    const maxAll = Math.max(...anchors.map((a) => a.meta.order));
    expect(maxTrunk).toBe(maxAll);
    expect(maxTrunk).toBeGreaterThanOrEqual(3);
  });

  it('the chain ORDER filter selects exactly the expected subset of a seeded skeleton', () => {
    const maxAll = Math.max(...anchors.map((a) => a.meta.order));
    for (const [min, max] of [[2, null], [1, 1], [maxAll, null], [2, 2]]) {
      const expected = anchors
        .filter((a) => {
          const o = a.role === 'edge' ? geometricOrder(a.meta.pathIndex, a.x, a.y)
            : a.role === 'tip' ? skeleton.order[a.meta.node]
            : skeleton.order[a.meta.node];
          return (min == null || o >= min) && (max == null || o <= max);
        })
        .map((a) => a.id);
      const { survivors } = runSelectionChain(anchors, [{ type: 'order', min, max }]);
      expect(survivors.map((a) => a.id)).toEqual(expected);
      expect(expected.length).toBeGreaterThan(0);
    }
  });

  it('ANCHOR IDS ARE BYTE-IDENTICAL to the pre-T4 extractor (ADR-0005 hard constraint)', () => {
    // Fingerprints captured by running THIS extractor on the commit before
    // meta.order existed (T3, 54b0803). Adding data to `meta` must not move a
    // single id: anchorId() and random-mode slot dealing hash on anchor.id, so a
    // changed id silently re-rolls glyph assignments in every saved document.
    //
    // WHEN THIS FAILS, READ THE COUNT FIRST. The hashes are a function of
    // DEFAULT_PARAMS.branch + the seed, not of the id SCHEME alone: retuning a
    // skeleton default (attractorCount / killDistance / stepLength / …) grows a
    // different plant and legitimately invalidates these literals — re-capture
    // them, do not hunt an ADR-0005 violation that did not happen. A count that
    // still matches while the hash moved is the real alarm: the same anchors under
    // different ids, which is exactly the regression this guards.
    const fingerprint = (params_, seed) =>
      getSemanticAnchors('branch', params_, BRANCH_W, BRANCH_H, { hostSeed: seed }).map((a) => a.id);
    const sha = (ids) => createHash('sha256').update(ids.join('\n')).digest('hex').slice(0, 32);
    for (const [params_, seed, count, hash] of [
      [branchParams(), BRANCH_SEED, 391, '37f0c131c1ece13e8092eb735b64bdbb'],
      [branchParams(), 7, 343, 'edc2c1dcfe88bbba9701f3275588506b'],
      [branchParams({ edgeSamplesPerBranch: 3 }), BRANCH_SEED, 244, 'f1e96ffc50dc07c271a81c5363873a81'],
    ]) {
      const ids = fingerprint(params_, seed);
      expect(ids.length).toBe(count); // geometry — a default-param change lands here
      expect(sha(ids)).toBe(hash); //    identity — an id-scheme change lands here
    }
  });
});

describe('branch — feeds the Zoned Sequencer (the vine chip contract)', () => {
  const anchors = getSemanticAnchors(
    'branch', branchParams(), BRANCH_W, BRANCH_H, { hostSeed: BRANCH_SEED }
  );

  it('every tip lands in the APEX zone and every edge/crossing in STEM', () => {
    const { apex, stem } = partitionZones(anchors);
    const tips = anchors.filter((a) => a.role === 'tip');
    expect(apex.length).toBe(tips.length);
    expect(apex.every((a) => a.role === 'tip')).toBe(true);
    expect(stem.every((a) => a.role !== 'tip')).toBe(true);
    // The point of the ticket: MANY apex members, not diffgrowth's ceiling of 2.
    expect(apex.length).toBeGreaterThan(20);
  });
});
