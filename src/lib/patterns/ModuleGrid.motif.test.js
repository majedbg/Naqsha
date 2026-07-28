// Motif host-geometry capture for ModuleGrid (the CELL-GRID seam, #151).
//
// ModuleGrid stashes its RESOLVED per-cell data on `instance.motifHostGeometry`
// during generate(), in CANVAS-PIXEL (top-left origin) frame:
//   motifHostGeometry = { cells: [{x, y, half, rotation}, …] }
//
// RESOLVED, NOT RE-DERIVED. The pattern already computes, per cell and before it
// builds a single module primitive: the seeded rotation `rot`, the jittered
// centre `(gx, gy)`, and the per-cell `effectiveHalf` (true half × per-cell
// scale). Those three ARE rotation and size inheritance — stashing them means the
// anchors cannot drift from the paint, because they are literally the numbers the
// paint was built from. Recomputing them outside generate() would have to replay
// the RNG stream to get the same answer.
//
// EVERY MODULE SHAPE, NO PARAMS GATING. The stash is written in the cell loop
// BEFORE buildModule is called, so it is module-independent BY CONSTRUCTION —
// asserted below as an equality across all six module values, including `rings`
// (which draws with ctx.ellipse, an operation the record-mode capture ignores).
// That capture-channel blindness is exactly the mistake PRD #143 records having
// made once; on the stash channel the centre, rotation and half are all known.
//
// FRAME. The pattern builds origin-centred and paints through
// applySymmetryDraw(ctx, 1, cx, cy, drawBase, startAngle, offsetX, offsetY),
// i.e. translate(cx+offsetX, cy+offsetY) then rotate(startAngle). So
//   world = R(startAngle)·centred + (canvasW/2 + offsetX, canvasH/2 + offsetY)
// and, because the WHOLE paint is rotated, each module's world orientation is
//   rotation = rot + startAngle
// A stash that applies the start angle to POSITION but not to ORIENTATION passes
// every position-only frame check and paints glyphs turned the wrong way, so the
// orientation term is asserted separately below. Symmetry is HARDCODED to 1, so
// there are no copies to replicate. The frame math here is HAND-AUTHORED, never
// reusing the implementation's conversion.
//
// RNG. Adding the stash must consume NO RNG. ModuleGrid's draw count is
// params-dependent — per cell: 1 draw for rotateMode 'seeded', 2 for jitter > 0,
// 1 for scaleMode 'seeded' — so the count assertion enumerates the branches,
// including the all-off case which must be EXACTLY ZERO draws. A zero
// expectation is the one a stray draw cannot hide in. The digests below were
// captured by running THIS FILE against the unmodified pattern (main @ 03692d7)
// before the stash existed; they are the byte-identical proof.

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import ModuleGrid from './ModuleGrid.js';
import { RecordingContext } from './drawingContext.js';

const W = 800;
const H = 600;
const CX = W / 2;
const CY = H / 2;

// Small grid: the geometry assertions want to be readable, and the RNG contract
// is per-cell so it is proved just as well at 4×3 as at 10×10.
const BASE = { tilesX: 4, tilesY: 3, lineCount: 4 };
const N_CELLS = BASE.tilesX * BASE.tilesY;

function gen(params = {}, seed = 11) {
  const inst = new ModuleGrid();
  const ctx = new RecordingContext({ seed: 1 });
  inst.generate(ctx, seed, { ...BASE, ...params }, W, H, '#000000', 100);
  return { inst, ctx };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Count ctx.random calls for one generate() run. */
function drawCount(params) {
  const inst = new ModuleGrid();
  const ctx = new RecordingContext({ seed: 1 });
  let draws = 0;
  const realRandom = ctx.random.bind(ctx);
  ctx.random = (...a) => {
    draws += 1;
    return realRandom(...a);
  };
  inst.generate(ctx, 11, { ...BASE, ...params }, W, H, '#000000', 100);
  return { draws, inst };
}

const MODULES = ['sideSweep', 'fan', 'rings', 'chevron', 'diamond'];

// ── HAND-AUTHORED cell geometry, derived from the pattern's DOCUMENTED rules and
// never from its implementation. At 800×600 with 4×3 tiles the tiling fits the
// canvas exactly: tileSize = min(800/4, 600/3) = 200, half = 100.
const TILE = Math.min(W / BASE.tilesX, H / BASE.tilesY);
const HALF = TILE / 2;

/**
 * The cells the pattern should stash, in row-major order, for the RNG-free
 * parameter combinations (rotateMode aligned|gradient, jitter 0, scaleMode
 * uniform|gradient). Seeded modes are deliberately NOT modelled here — replaying
 * the RNG in the test would just re-implement the pattern.
 */
function expectedCells({
  rotateMode = 'aligned',
  scaleMode = 'uniform',
  scale = 1,
  startAngle = 0,
  offsetX = 0,
  offsetY = 0,
} = {}) {
  const { tilesX, tilesY } = BASE;
  const a = (startAngle * Math.PI) / 180;
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  const out = [];
  for (let row = 0; row < tilesY; row++) {
    for (let col = 0; col < tilesX; col++) {
      const baseX = (col - (tilesX - 1) / 2) * TILE;
      const baseY = (row - (tilesY - 1) / 2) * TILE;
      const rot = rotateMode === 'gradient' ? (col / tilesX + row / tilesY) * Math.PI : 0;
      const cellScale =
        scaleMode === 'gradient' ? scale * (0.5 + (col / tilesX + row / tilesY) / 2) : scale;
      out.push({
        x: baseX * cosA - baseY * sinA + CX + offsetX,
        y: baseX * sinA + baseY * cosA + CY + offsetY,
        half: HALF * cellScale,
        rotation: rot + a,
      });
    }
  }
  return out;
}

const cellsOf = (params, seed) => gen(params, seed).inst.motifHostGeometry.cells;

function expectCellsClose(actual, expected, digits = 9) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((c, i) => {
    expect(c.x).toBeCloseTo(expected[i].x, digits);
    expect(c.y).toBeCloseTo(expected[i].y, digits);
    expect(c.half).toBeCloseTo(expected[i].half, digits);
    expect(c.rotation).toBeCloseTo(expected[i].rotation, digits);
  });
}

describe('ModuleGrid stashes its RESOLVED per-cell data', () => {
  it('stashes one cell per module, as {x, y, half, rotation}', () => {
    const cells = cellsOf();
    expect(Array.isArray(cells)).toBe(true);
    expect(cells).toHaveLength(N_CELLS);
    for (const c of cells) {
      expect(typeof c.x).toBe('number');
      expect(typeof c.y).toBe('number');
      expect(typeof c.half).toBe('number');
      expect(typeof c.rotation).toBe('number');
      expect(c.half).toBeGreaterThan(0);
    }
  });

  it('cell centres are the CANVAS-PIXEL lattice (hand-authored)', () => {
    expectCellsClose(cellsOf({ rotateMode: 'aligned' }), expectedCells());
  });

  it('EVERY module shape hosts cells — including rings — with identical geometry', () => {
    // The stash is written in the cell loop BEFORE buildModule, so it cannot vary
    // by module. Asserted as an EQUALITY across every module value rather than a
    // non-empty check: `rings` draws with ctx.ellipse, the operation the
    // record-mode capture ignores, and PRD #143 records the mistake of concluding
    // from that that ring modules cannot host cells. They can.
    const reference = cellsOf({ module: 'sideSweep' });
    expect(reference).toHaveLength(N_CELLS);
    for (const module of MODULES) {
      expect([module, cellsOf({ module })]).toEqual([module, reference]);
    }
    // Both ring draw paths — ringEccentricity 0 (ctx.ellipse) and > 0 (polyline).
    expect(cellsOf({ module: 'rings', ringEccentricity: 0 })).toEqual(reference);
    expect(cellsOf({ module: 'rings', ringEccentricity: 0.6 })).toEqual(reference);
  });

  it('carries per-cell ROTATION (gradient mode, hand-authored)', () => {
    const cells = cellsOf({ rotateMode: 'gradient' });
    expectCellsClose(cells, expectedCells({ rotateMode: 'gradient' }));
    // A real spread of distinct rotations, not one shared value.
    expect(new Set(cells.map((c) => c.rotation.toFixed(9))).size).toBeGreaterThan(1);
  });

  it('an ALIGNED grid stashes rotation 0 everywhere', () => {
    for (const c of cellsOf({ rotateMode: 'aligned' })) expect(c.rotation).toBe(0);
  });

  it('carries PER-CELL half-extents under per-cell scale (gradient, hand-authored)', () => {
    const cells = cellsOf({ scaleMode: 'gradient', scale: 1.2, rotateMode: 'aligned' });
    expectCellsClose(
      cells,
      expectedCells({ scaleMode: 'gradient', scale: 1.2 })
    );
    expect(new Set(cells.map((c) => c.half.toFixed(9))).size).toBeGreaterThan(1);
  });

  it('a SEEDED scale gives a spread of distinct half-extents', () => {
    const cells = cellsOf({ scaleMode: 'seeded' });
    const halves = cells.map((c) => c.half);
    expect(new Set(halves.map((h) => h.toFixed(9))).size).toBeGreaterThan(1);
    // Seeded factor is ctx.random(0.5, 1.5) × scale, so every half stays in band.
    for (const h of halves) {
      expect(h).toBeGreaterThanOrEqual(HALF * 0.5 - 1e-9);
      expect(h).toBeLessThanOrEqual(HALF * 1.5 + 1e-9);
    }
  });

  it('a uniform SCALE multiplies every half-extent', () => {
    const base = cellsOf({ rotateMode: 'aligned' });
    const big = cellsOf({ rotateMode: 'aligned', scale: 1.5 });
    base.forEach((c, i) => {
      expect(big[i].half).toBeCloseTo(c.half * 1.5, 9);
      // Grid spacing + jitter stay on the TRUE half, so centres do NOT move.
      expect(big[i].x).toBeCloseTo(c.x, 9);
      expect(big[i].y).toBeCloseTo(c.y, 9);
    });
  });

  it('JITTER moves the stashed centres with their modules, bounded by the true half', () => {
    const base = cellsOf({ rotateMode: 'aligned' });
    const jittered = cellsOf({ rotateMode: 'aligned', jitter: 0.4 });
    let moved = 0;
    base.forEach((c, i) => {
      const dx = jittered[i].x - c.x;
      const dy = jittered[i].y - c.y;
      if (Math.hypot(dx, dy) > 1e-9) moved += 1;
      // gx += random(-jitter, jitter) * half  ⇒ |d| <= jitter * half
      expect(Math.abs(dx)).toBeLessThanOrEqual(0.4 * HALF + 1e-9);
      expect(Math.abs(dy)).toBeLessThanOrEqual(0.4 * HALF + 1e-9);
      // Jitter never changes the cell's size.
      expect(jittered[i].half).toBeCloseTo(c.half, 9);
    });
    expect(moved).toBe(N_CELLS);
  });

  it('cell centres sit inside the canvas and match the DRAWN module they own', () => {
    // A centred-frame bug (stashing origin-centred coords) puts half the grid at
    // negative coordinates. At 4×3 on 800×600 the tiling fills the canvas exactly,
    // so every cell centre is strictly inside it.
    for (const c of cellsOf({ rotateMode: 'aligned' })) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(W);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(H);
    }
    // And the module really is drawn around that centre: the `rings` module at
    // ringEccentricity 0 emits its outermost circle centred exactly on the cell
    // (offset = endOffset × baseT, which is 0 for i = 0).
    const { inst, ctx } = gen({ module: 'rings', rotateMode: 'aligned', lineCount: 3 });
    const ellipses = ctx.calls
      .filter((c) => c.op === 'ellipse')
      .map(({ args }) => ({ x: args[0] + CX, y: args[1] + CY, r: args[2] / 2 }));
    for (const c of inst.motifHostGeometry.cells) {
      const outer = ellipses.find(
        (e) => Math.abs(e.x - c.x) < 1e-9 && Math.abs(e.y - c.y) < 1e-9
      );
      expect(outer).toBeDefined();
      // Outermost ring diameter = size = 2 × effectiveHalf.
      expect(outer.r).toBeCloseTo(c.half, 9);
    }
  });
});

describe('ModuleGrid stash lands in the PAINTED frame', () => {
  it('applies the offsetX/offsetY term', () => {
    const D = 37;
    const E = -19;
    const base = cellsOf({ rotateMode: 'aligned' });
    const shifted = cellsOf({ rotateMode: 'aligned', offsetX: D, offsetY: E });
    base.forEach((c, i) => {
      expect(shifted[i].x).toBeCloseTo(c.x + D, 9);
      expect(shifted[i].y).toBeCloseTo(c.y + E, 9);
      expect(shifted[i].half).toBeCloseTo(c.half, 9);
      expect(shifted[i].rotation).toBeCloseTo(c.rotation, 9);
    });
  });

  it('applies the startAngle rotation to POSITION (hand-authored)', () => {
    const A = 33;
    const a = (A * Math.PI) / 180;
    const base = cellsOf({ rotateMode: 'aligned' });
    const rotated = cellsOf({ rotateMode: 'aligned', startAngle: A });
    base.forEach((c, i) => {
      const px = c.x - CX;
      const py = c.y - CY;
      expect(rotated[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + CX, 6);
      expect(rotated[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + CY, 6);
    });
  });

  it('applies the startAngle rotation to ORIENTATION too', () => {
    // THE TRAP. The whole paint is rotated by startAngle, so each module's WORLD
    // orientation is rot + startAngle. A stash that rotates position but not
    // orientation passes every position-only frame check above and paints every
    // glyph turned the wrong way on canvas.
    const A = 33;
    const a = (A * Math.PI) / 180;
    for (const rotateMode of ['aligned', 'gradient']) {
      const base = cellsOf({ rotateMode });
      const rotated = cellsOf({ rotateMode, startAngle: A });
      base.forEach((c, i) => {
        expect([rotateMode, i, Number((rotated[i].rotation - c.rotation).toFixed(9))]).toEqual([
          rotateMode,
          i,
          Number(a.toFixed(9)),
        ]);
      });
    }
  });

  it('start angle AND offsets compose in the painted order (rotate, then translate)', () => {
    const A = 33;
    const D = 21;
    const E = -14;
    expectCellsClose(
      cellsOf({ rotateMode: 'gradient', startAngle: A, offsetX: D, offsetY: E }),
      expectedCells({ rotateMode: 'gradient', startAngle: A, offsetX: D, offsetY: E }),
      6
    );
  });
});

describe('ModuleGrid stash is deterministic', () => {
  it('the same seed gives identical geometry; a new seed moves the cells', () => {
    expect(cellsOf({}, 11)).toEqual(cellsOf({}, 11));
    // rotateMode defaults to 'seeded', so re-seeding must re-roll the rotations.
    expect(cellsOf({}, 12)).not.toEqual(cellsOf({}, 11));
  });

  it('a grid with no tiles stashes an empty cell list rather than throwing', () => {
    const inst = new ModuleGrid();
    inst.generate(
      new RecordingContext({ seed: 1 }),
      11,
      { tilesX: 0, tilesY: 0, lineCount: 4 },
      W,
      H,
      '#000000',
      100
    );
    expect(inst.motifHostGeometry.cells).toEqual([]);
  });

  it('a 1×1 grid stashes exactly one cell at the canvas centre', () => {
    const inst = new ModuleGrid();
    inst.generate(
      new RecordingContext({ seed: 1 }),
      11,
      { tilesX: 1, tilesY: 1, lineCount: 4, rotateMode: 'aligned' },
      W,
      H,
      '#000000',
      100
    );
    const { cells } = inst.motifHostGeometry;
    expect(cells).toHaveLength(1);
    expect(cells[0].x).toBeCloseTo(CX, 9);
    expect(cells[0].y).toBeCloseTo(CY, 9);
    expect(cells[0].half).toBeCloseTo(Math.min(W, H) / 2, 9);
    expect(cells[0].rotation).toBe(0);
  });
});

describe('ModuleGrid stash consumes NO RNG', () => {
  it('the draw COUNT is exactly the pattern\'s documented per-cell contract', () => {
    // Per cell: rotateMode 'seeded' → 1, jitter > 0 → 2, scaleMode 'seeded' → 1.
    // Counting is the assertion that catches a stray draw ANYWHERE in generate(),
    // including one placed AFTER the cell loop — which leaves this pattern's own
    // output intact but desynchronises the shared live-p5 stream for whatever
    // renders next. (A digest alone survives exactly that bug.)
    const CASES = [
      [{}, 1], // rotateMode defaults to 'seeded'
      [{ rotateMode: 'seeded' }, 1],
      [{ rotateMode: 'seeded', jitter: 0.3 }, 3],
      [{ rotateMode: 'seeded', scaleMode: 'seeded' }, 2],
      [{ rotateMode: 'seeded', jitter: 0.3, scaleMode: 'seeded' }, 4],
      [{ rotateMode: 'gradient' }, 0],
      [{ rotateMode: 'aligned' }, 0],
      // THE STRONGEST CASE: every RNG branch off ⇒ exactly zero draws. Nothing
      // can hide in a zero.
      [{ rotateMode: 'aligned', jitter: 0, scaleMode: 'uniform' }, 0],
      [{ rotateMode: 'gradient', jitter: 0.5, scaleMode: 'gradient' }, 2],
    ];
    for (const [params, perCell] of CASES) {
      const { draws } = drawCount(params);
      expect(`${JSON.stringify(params)}:${draws}`).toBe(
        `${JSON.stringify(params)}:${perCell * N_CELLS}`
      );
    }
  });

  it('every module shape draws the same COUNT — the stash never varies by module', () => {
    for (const module of MODULES) {
      expect(`${module}:${drawCount({ module }).draws}`).toBe(`${module}:${N_CELLS}`);
      expect(`${module}+ecc:${drawCount({ module, ringEccentricity: 0.6 }).draws}`).toBe(
        `${module}+ecc:${N_CELLS}`
      );
    }
  });

  it('the draw stream and emitted SVG are byte-identical to the pre-stash pattern', () => {
    // Digests captured by running this file against the UNMODIFIED pattern
    // (main @ 03692d7, before motifHostGeometry existed). Both the recorded draw
    // stream and the emitted SVG are hashed: a single stray ctx.random() call
    // shifts every subsequent rotation/jitter draw and both digests change.
    const CASES = [
      ['default', {}, '1b704114f59cc47c', '812d47d041f7c9db'],
      ['rings', { module: 'rings' }, 'd7c7d9945b9fb50d', '88693d328567d387'],
      ['rings-ecc', { module: 'rings', ringEccentricity: 0.6 }, '19d3ce4a5b189ef9', 'c2e25d4e30d50c54'],
      ['fan', { module: 'fan' }, 'a80e0637d4abffb4', '0973c666147ab30e'],
      ['chevron', { module: 'chevron' }, 'd307c0029a419a44', '20584953b173d874'],
      ['diamond', { module: 'diamond' }, '169856e15fb263ff', '0bac2c050c2e4b28'],
      [
        'jitter+seededScale',
        { jitter: 0.4, scaleMode: 'seeded', scale: 1.2 },
        '1e0e62a6a378aa35',
        '779f5aaac44ed043',
      ],
      // NOTE the SVG digest here EQUALS the default case's: startAngle/offset are
      // applied by the inherited toSVGGroup wrapper, never by the elements, which
      // are emitted origin-centred. That is the pattern's existing contract, and
      // it is why the stash must apply the frame transform ITSELF.
      [
        'angle+offset',
        { startAngle: 33, offsetX: 21, offsetY: -14 },
        '1470f2fbdaf87fbe',
        '812d47d041f7c9db',
      ],
      [
        'gradient',
        { rotateMode: 'gradient', scaleMode: 'gradient' },
        '7715f16d30105298',
        '0be59d0e113ed1cd',
      ],
    ];
    for (const [name, params, callDigest, svgDigest] of CASES) {
      const { inst, ctx } = gen(params);
      expect(`${name}:${sha(JSON.stringify(ctx.calls))}`).toBe(`${name}:${callDigest}`);
      expect(`${name}:${sha(inst.svgElements.join('\n'))}`).toBe(`${name}:${svgDigest}`);
    }
  });
});
