import { describe, it, expect } from 'vitest';
import { gridAnchorsCentered } from '../gridAnchors.js';
import { makeP5Random } from '../rng.js';
import { toSymmetryCount } from '../symmetryUtils.js';
import { latticeForLayer } from '../../fields/latticeForLayer.js';
import { getSemanticAnchors } from '../../motif/semanticAnchors.js';
import { anchorId } from '../../motif/anchors.js';

// gridAnchorsCentered is the single, pattern-owned source of the Grid's
// role-tagged anchors (crossing/edge/tip/cell), in the CENTRE-RELATIVE frame,
// jittered + symmetry-replicated. It is the seam BOTH the motif path (which
// world-translates by the canvas centre) and the lattice path (which consumes
// centred coords directly) will read from. These tests pin the seam hard:
//   1. BRIDGE INVARIANT — crossings are BYTE-IDENTICAL to latticeForLayer nodes.
//   2. MOTIF PARITY — world-translated crossings match today's getSemanticAnchors.
//   3. Role coverage + counts, warp→null, nothing-drawn→[].
//   4. Symmetry rotation — 4× count and base+θ tangent/normal.
//   5. Determinism.

const HALF_PI = Math.PI / 2;

/** Filter helper — anchors of one role, preserving emission order. */
const byRole = (anchors, role) => anchors.filter((a) => a.role === role);

// ---------------------------------------------------------------------------
// 1. BRIDGE INVARIANT (the safety rail): crossings === latticeForLayer nodes.
//    latticeForLayer already emits centre-relative nodes via the same
//    translate-then-rotate formula; if the core diverges even by one ULP this
//    === (not toBeCloseTo) fails — which means the core's transform drifted
//    from latticeForLayer and MUST be fixed in the core.
// ---------------------------------------------------------------------------
describe('gridAnchorsCentered — bridge invariant (crossings === lattice nodes)', () => {
  const cases = [
    {
      name: 'jitter>0, symmetry>1 (offsets + startAngle)',
      seed: 12345,
      params: {
        cols: 3, rows: 4, spacing: 35, jitter: 6, margin: 10,
        symmetry: 4, startAngle: 27, offsetX: 15, offsetY: -8,
        drawHorizontal: 1, drawVertical: 1,
      },
    },
    {
      name: 'jitter=0, symmetry=1 (baseline)',
      seed: 42,
      params: {
        cols: 2, rows: 2, spacing: 40, jitter: 0, margin: 20,
        symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
        drawHorizontal: 1, drawVertical: 1,
      },
    },
  ];

  for (const { name, seed, params } of cases) {
    it(`crossings byte-identical to latticeForLayer nodes — ${name}`, () => {
      const anchors = gridAnchorsCentered(params, makeP5Random(seed));
      const crossings = byRole(anchors, 'crossing');

      // latticeForLayer builds its OWN fresh makeP5Random(seed) internally.
      const { nodes } = latticeForLayer({ patternType: 'grid', seed, params });

      const n = toSymmetryCount(params.symmetry);
      const expectedCount = n * (params.cols + 1) * (params.rows + 1);
      expect(crossings).toHaveLength(expectedCount);
      expect(nodes).toHaveLength(expectedCount);

      // Same order, same count, EXACT float equality (===).
      crossings.forEach((a, i) => {
        expect(a.x).toBe(nodes[i].x);
        expect(a.y).toBe(nodes[i].y);
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 2. MOTIF PARITY (characterization): world-translated core crossings match
//    today's getSemanticAnchors('grid', …) at jitter=0/sym=1/startAngle=0.
//    Pins that the core reproduces the CURRENT motif geometry before WI-2
//    rewires the motif seam onto it.
// ---------------------------------------------------------------------------
describe('gridAnchorsCentered — motif parity with getSemanticAnchors (jitter=0, sym=1)', () => {
  const canvasW = 800;
  const canvasH = 600;
  const seed = 99;
  const params = {
    cols: 3, rows: 2, spacing: 40, jitter: 0, margin: 20,
    symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
    drawHorizontal: 1, drawVertical: 1,
  };

  // World-translate the centred core anchors to compare with getSemanticAnchors
  // (which emits WORLD coords = centred + canvas centre).
  const toWorld = (a) => ({ ...a, x: a.x + canvasW / 2, y: a.y + canvasH / 2 });

  const core = gridAnchorsCentered(params, makeP5Random(seed));
  const old = getSemanticAnchors('grid', params, canvasW, canvasH);

  it('crossings coincide in world coordinates', () => {
    const coreC = byRole(core, 'crossing').map(toWorld);
    const oldC = byRole(old, 'crossing');
    expect(coreC).toHaveLength(oldC.length);
    coreC.forEach((a, i) => {
      expect(a.x).toBeCloseTo(oldC[i].x, 9);
      expect(a.y).toBeCloseTo(oldC[i].y, 9);
      expect(a.tangent).toBeCloseTo(oldC[i].tangent, 12);
      expect(a.normal).toBeCloseTo(oldC[i].normal, 12);
    });
  });

  it('spot-check edge / tip / cell anchors coincide in world coordinates', () => {
    for (const role of ['edge', 'tip', 'cell']) {
      const coreR = byRole(core, role).map(toWorld);
      const oldR = byRole(old, role);
      expect(coreR.length).toBeGreaterThan(0);
      expect(coreR).toHaveLength(oldR.length);
      // Same emission order ⇒ index-aligned spot checks across the whole role.
      coreR.forEach((a, i) => {
        expect(a.x).toBeCloseTo(oldR[i].x, 9);
        expect(a.y).toBeCloseTo(oldR[i].y, 9);
        expect(a.tangent).toBeCloseTo(oldR[i].tangent, 12);
        expect(a.normal).toBeCloseTo(oldR[i].normal, 12);
        expect(a.s).toBeCloseTo(oldR[i].s, 9);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Role coverage + counts; warp → null; nothing-drawn → [].
// ---------------------------------------------------------------------------
describe('gridAnchorsCentered — role coverage and gating', () => {
  const seed = 5;
  const base = {
    cols: 2, rows: 2, spacing: 40, jitter: 0, margin: 20,
    symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
    drawHorizontal: 1, drawVertical: 1,
  };

  it('emits all four roles with the expected counts (cols=2, rows=2, sym=1)', () => {
    const a = gridAnchorsCentered(base, makeP5Random(seed));
    const nx = base.cols + 1; // 3 vertical lines
    const ny = base.rows + 1; // 3 horizontal lines

    // crossings = nx*ny
    expect(byRole(a, 'crossing')).toHaveLength(nx * ny); // 9
    // edges = vertical-line edges (nx*(ny-1)) + horizontal-line edges (ny*(nx-1))
    expect(byRole(a, 'edge')).toHaveLength(nx * (ny - 1) + ny * (nx - 1)); // 12
    // tips = 2 per vertical line + 2 per horizontal line
    expect(byRole(a, 'tip')).toHaveLength(2 * nx + 2 * ny); // 12
    // cells = (nx-1)*(ny-1)
    expect(byRole(a, 'cell')).toHaveLength((nx - 1) * (ny - 1)); // 4

    // Emission order is crossings, then edges, then tips, then cells.
    const roleOrder = a.map((x) => x.role);
    const firstEdge = roleOrder.indexOf('edge');
    const firstTip = roleOrder.indexOf('tip');
    const firstCell = roleOrder.indexOf('cell');
    expect(roleOrder.lastIndexOf('crossing')).toBeLessThan(firstEdge);
    expect(roleOrder.lastIndexOf('edge')).toBeLessThan(firstTip);
    expect(roleOrder.lastIndexOf('tip')).toBeLessThan(firstCell);
  });

  it('interior crossings are flagged as junctions, boundary ones are not', () => {
    // cols=2,rows=2 ⇒ interior crossing only at (i=1,j=1).
    const a = gridAnchorsCentered(base, makeP5Random(seed));
    const junctions = byRole(a, 'crossing').filter((c) => c.meta.junction);
    expect(junctions).toHaveLength(1);
    expect(junctions[0].meta).toMatchObject({ col: 1, row: 1 });
  });

  it('warp modulation ⇒ null', () => {
    const warp = { ...base, modulation: { channel: 'warp', field: {} } };
    expect(gridAnchorsCentered(warp, makeP5Random(seed))).toBeNull();
  });

  it('nothing drawn (drawVertical & drawHorizontal off) ⇒ []', () => {
    const none = { ...base, drawVertical: 0, drawHorizontal: 0 };
    expect(gridAnchorsCentered(none, makeP5Random(seed))).toEqual([]);
  });

  it('only vertical family drawn ⇒ vertical tips only, no crossings/edges/cells', () => {
    const vOnly = { ...base, drawVertical: 1, drawHorizontal: 0 };
    const a = gridAnchorsCentered(vOnly, makeP5Random(seed));
    expect(byRole(a, 'crossing')).toHaveLength(0);
    expect(byRole(a, 'edge')).toHaveLength(0);
    expect(byRole(a, 'cell')).toHaveLength(0);
    expect(byRole(a, 'tip')).toHaveLength(2 * (base.cols + 1)); // vertical tips only
    expect(a.every((t) => t.meta.orientation === 'v')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3b. Anchor-id convention: NO copy suffix at n===1 (byte-identical to the
//     pre-refactor ids, so id-keyed override persistence is stable); every
//     copy incl. k=0 IS suffixed at n>1 (base copy never collides with sym=1).
// ---------------------------------------------------------------------------
describe('gridAnchorsCentered — anchor id convention (conditional copy suffix)', () => {
  const seed = 5;
  const params = {
    cols: 2, rows: 2, spacing: 40, jitter: 0, margin: 20,
    symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
    drawHorizontal: 1, drawVertical: 1,
  };

  it('symmetry=1: ids are byte-identical to the old (no copy suffix)', () => {
    const a = gridAnchorsCentered(params, makeP5Random(seed));
    const idOf = (role, meta) =>
      a.find((x) => x.role === role && Object.entries(meta).every(([k, v]) => x.meta[k] === v)).id;

    // one crossing, one edge, one tip, one cell — exact old-format ids.
    expect(idOf('crossing', { col: 0, row: 0 })).toBe(anchorId('crossing', 0, 0));
    expect(idOf('edge', { orientation: 'v', line: 0, segment: 0 })).toBe(anchorId('edge', 'v', 0, 0));
    expect(idOf('tip', { orientation: 'h', line: 0, end: 1 })).toBe(anchorId('tip', 'h', 0, 1));
    expect(idOf('cell', { col: 0, row: 0 })).toBe(anchorId('cell', 0, 0));

    // No id carries a trailing copy suffix at n===1.
    expect(a.every((x) => x.id === anchorId(x.role, ...x.id.split(':').slice(1)))).toBe(true);
  });

  it('symmetry>1: every copy incl. k=0 carries the :k suffix and ids are unique', () => {
    const four = gridAnchorsCentered({ ...params, symmetry: 4 }, makeP5Random(seed));
    // k=0 crossing (0,0) is suffixed, NOT the bare old id.
    const k0 = four.find(
      (x) => x.role === 'crossing' && x.meta.col === 0 && x.meta.row === 0 && x.meta.copy === 0,
    );
    expect(k0.id).toBe(anchorId('crossing', 0, 0, 0));
    expect(k0.id).not.toBe(anchorId('crossing', 0, 0));

    // Every id ends with its copy index, and all ids are globally unique.
    for (const x of four) expect(x.id.endsWith(`:${x.meta.copy}`)).toBe(true);
    const ids = four.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ---------------------------------------------------------------------------
// 4. Symmetry rotation: 4× count, and copy-k tangent/normal == base + θ.
// ---------------------------------------------------------------------------
describe('gridAnchorsCentered — symmetry rotation', () => {
  const seed = 7;
  const base = {
    cols: 2, rows: 2, spacing: 40, jitter: 3, margin: 20,
    symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
    drawHorizontal: 1, drawVertical: 1,
  };

  it('symmetry=4 yields exactly 4× the symmetry=1 anchor count', () => {
    const one = gridAnchorsCentered({ ...base, symmetry: 1 }, makeP5Random(seed));
    const four = gridAnchorsCentered({ ...base, symmetry: 4 }, makeP5Random(seed));
    expect(four).toHaveLength(4 * one.length);
  });

  it('copy-k anchors carry tangent/normal == base + θ and meta.copy/theta', () => {
    const four = gridAnchorsCentered({ ...base, symmetry: 4 }, makeP5Random(seed));
    // Crossing base tangent=0, normal=π/2 ⇒ copy k has tangent=θ, normal=π/2+θ.
    const crossings = byRole(four, 'crossing');
    for (const c of crossings) {
      const theta = (2 * Math.PI * c.meta.copy) / 4; // startAngle=0
      expect(c.meta.theta).toBeCloseTo(theta, 12);
      expect(c.tangent).toBeCloseTo(0 + theta, 12);
      expect(c.normal).toBeCloseTo(HALF_PI + theta, 12);
    }

    // A horizontal tip end 0 has base normal=π; check its copy rotation too.
    const hTip0 = byRole(four, 'tip').filter(
      (t) => t.meta.orientation === 'h' && t.meta.end === 0,
    );
    expect(hTip0.length).toBeGreaterThan(0);
    for (const t of hTip0) {
      const theta = (2 * Math.PI * t.meta.copy) / 4;
      expect(t.normal).toBeCloseTo(Math.PI + theta, 12);
    }
  });

  it('startAngle folds into every copy angle (θ = 2π·k/n + startRad)', () => {
    const sym = { ...base, symmetry: 2, startAngle: 30 };
    const a = gridAnchorsCentered(sym, makeP5Random(seed));
    const startRad = (30 * Math.PI) / 180;
    for (const c of byRole(a, 'crossing')) {
      const theta = (2 * Math.PI * c.meta.copy) / 2 + startRad;
      expect(c.meta.theta).toBeCloseTo(theta, 12);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Determinism: two calls with fresh makeP5Random(sameSeed) are identical.
// ---------------------------------------------------------------------------
describe('gridAnchorsCentered — determinism', () => {
  it('two fresh-rng calls with the same seed produce identical arrays', () => {
    const seed = 2024;
    const params = {
      cols: 3, rows: 3, spacing: 30, jitter: 5, margin: 15,
      symmetry: 3, startAngle: 12, offsetX: 7, offsetY: -4,
      drawHorizontal: 1, drawVertical: 1,
    };
    const a = gridAnchorsCentered(params, makeP5Random(seed));
    const b = gridAnchorsCentered(params, makeP5Random(seed));
    expect(a).toEqual(b);
    // Byte-identical positions, not merely deep-equal-with-tolerance.
    a.forEach((anchor, i) => {
      expect(anchor.x).toBe(b[i].x);
      expect(anchor.y).toBe(b[i].y);
    });
  });

  it('sanity: gridLinePositions is consumed once (jitter arrays reused)', () => {
    // If the core drew jitter more than once, a second core call sharing ONE
    // rng would desync. We prove single-consumption by feeding ONE rng to the
    // core and separately to gridLinePositions after — the core must have left
    // the stream advanced by exactly (cols+1)+(rows+1) draws.
    const seed = 321;
    const params = { cols: 2, rows: 2, spacing: 40, jitter: 4, symmetry: 5 };

    const rngA = makeP5Random(seed);
    gridAnchorsCentered(params, rngA); // consumes the jitter draws.

    // Fresh rng, consume exactly (cols+1)+(rows+1) draws, then both streams
    // should agree on the next value (proving the core drew exactly that many).
    const rngB = makeP5Random(seed);
    const drawn = (params.cols + 1) + (params.rows + 1);
    for (let d = 0; d < drawn; d++) rngB(-params.jitter, params.jitter);
    expect(rngA()).toBe(rngB());
  });
});
