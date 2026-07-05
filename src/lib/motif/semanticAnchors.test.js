import { describe, it, expect } from 'vitest';
import { getSemanticAnchors } from './semanticAnchors.js';
import { placeMotifs, selectAnchors } from './placementEngine.js';
import Grid from '../patterns/Grid.js';
import RecursiveGeometry from '../patterns/RecursiveGeometry.js';
import Spiral from '../patterns/Spiral.js';
import VoronoiCells from '../patterns/VoronoiCells.js';
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

  it('returns null when a warp modulation field is active (unverifiable)', () => {
    const p = recursiveParams({
      modulation: { channel: 'warp', field: { type: 'noise' }, amount: 30 },
    });
    expect(getSemanticAnchors('recursive', p, W, H)).toBeNull();
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
