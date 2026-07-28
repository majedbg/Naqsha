// Truchet's MOTIF-HOST STASH (#153, PRD #143) — the pattern-side half.
//
// Truchet publishes `{ cells, arcs }` on `instance.motifHostGeometry`, in the
// PAINTED frame (start angle, offsets AND every radial symmetry copy). Two things
// have to be true of that addition and neither is visible from the anchors:
//
//   1. IT CONSUMES NO RNG. The pattern documents a one-draw-per-tile contract —
//      `ctx.random` is called exactly once per tile, in a single pass, and BOTH
//      renderers derive from that same array. `applySymmetryDraw` runs `drawBase`
//      once per copy, so a single stray draw inside the draw path desynchronises
//      every copy. A DIGEST DOES NOT CATCH THIS: neither RecordingContext nor
//      P5Adapter records `random` in `calls`, so a stray `ctx.random()` after the
//      loop sails straight past a digest-only proof (the finding from #151, and
//      the bug #146 was bitten by). So the assertions here are explicit
//      DRAW-COUNT assertions on a context that DOES record `random`, per tile-set
//      branch, including the literal-zero case.
//
//   2. THE PATTERN'S OUTPUT IS BYTE-IDENTICAL WITH THE STASH ADDED. The digests
//      below were captured from the pre-stash pattern on this branch, BEFORE the
//      stash was written, and embedded verbatim. They cover `svgElements` and the
//      recorded canvas call stream. RecordingContext records `triangle` (unlike
//      P5Adapter's record mode, which is polyline-only), so the triangles tile
//      set is genuinely covered by the calls digest as well as the SVG one.

import { describe, it, expect } from 'vitest';
import Truchet from '../Truchet.js';
import { RecordingContext } from '../../drawingContext.js';

const W = 800;
const H = 600;
const SEED = 11;
const TILES = 7;

/** A RecordingContext that ALSO records every `random()` call, in stream order. */
class RngRecordingContext extends RecordingContext {
  random(a, b) {
    this._record('random', []);
    return super.random(a, b);
  }
}

/** Ops that put ink on the canvas (transform/style ops are not draws). */
const DRAW_OPS = new Set(['line', 'triangle', 'ellipse', 'rect', 'beginShape', 'vertex', 'endShape']);

/** Stable 64-bit-ish digest of a string. Two independent 32-bit mixes. */
function digest(s) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function run(params, Ctx = RecordingContext) {
  const ctx = new Ctx({ seed: 1 });
  const inst = new Truchet();
  inst.generate(ctx, SEED, { tiles: TILES, ...params }, W, H, '#123456', 100);
  return { ctx, inst };
}

/** The pre-stash golden: svg + recorded-call digests and their counts. */
const GOLDEN = {
  'arcs/base': { svg: 'bb9508c19c827db0', calls: '68b03360f610f3cc', nCalls: 1868, nSvg: 98 },
  'arcs/framed': { svg: 'bb9508c19c827db0', calls: '473f343946eb92ba', nCalls: 9345, nSvg: 98 },
  'diagonals/base': { svg: '0d4750d6752c5ebf', calls: '1677ee889a19a83f', nCalls: 202, nSvg: 49 },
  'diagonals/framed': { svg: '0d4750d6752c5ebf', calls: '3719ca9589393c0d', nCalls: 1015, nSvg: 49 },
  'triangles/base': { svg: '091712da8a4d78d0', calls: 'ddbbfce0a01c371e', nCalls: 55, nSvg: 49 },
  'triangles/framed': { svg: '091712da8a4d78d0', calls: '90fa190d2242286c', nCalls: 280, nSvg: 49 },
};

const FRAMES = {
  base: {},
  framed: { symmetry: 5, startAngle: 37, offsetX: 21, offsetY: -13 },
};
const TILE_SETS = ['arcs', 'diagonals', 'triangles'];

describe('Truchet: the motif-host stash consumes NO RNG', () => {
  for (const tileSet of TILE_SETS) {
    it(`${tileSet}: exactly ONE ctx.random per tile, at every symmetry`, () => {
      // The pattern's documented contract, asserted as an exact count rather than
      // a digest — a digest cannot see `random` at all.
      for (const symmetry of [1, 2, 5, 11]) {
        const { ctx } = run({ tileSet, symmetry }, RngRecordingContext);
        const draws = ctx.calls.filter((c) => c.op === 'random').length;
        expect([tileSet, symmetry, draws]).toEqual([tileSet, symmetry, TILES * TILES]);
      }
    });

    it(`${tileSet}: EXACTLY ZERO ctx.random calls once drawing has begun`, () => {
      // The literal-zero case. It covers BOTH hazards at once: applySymmetryDraw
      // replaying drawBase once per copy, and the stash block itself (built after
      // the paint). Anything that pulled RNG in either place would land here.
      for (const symmetry of [1, 5]) {
        const { ctx } = run({ tileSet, symmetry }, RngRecordingContext);
        const firstDraw = ctx.calls.findIndex((c) => DRAW_OPS.has(c.op));
        expect(firstDraw).toBeGreaterThan(-1);
        const after = ctx.calls.slice(firstDraw).filter((c) => c.op === 'random').length;
        expect([tileSet, symmetry, after]).toEqual([tileSet, symmetry, 0]);
      }
    });

    it(`${tileSet}: raising symmetry changes the RNG draw count by exactly ZERO`, () => {
      const one = run({ tileSet, symmetry: 1 }, RngRecordingContext);
      const many = run({ tileSet, symmetry: 7 }, RngRecordingContext);
      const count = (r) => r.ctx.calls.filter((c) => c.op === 'random').length;
      expect(count(many) - count(one)).toBe(0);
    });
  }

  it('the stash exists — so the counts above are about a pattern that really stashes', () => {
    // Guards the whole describe from passing vacuously against a pattern that
    // never grew a stash at all.
    const { inst } = run({ tileSet: 'arcs' });
    expect(Array.isArray(inst.motifHostGeometry?.cells)).toBe(true);
    expect(Array.isArray(inst.motifHostGeometry?.arcs)).toBe(true);
  });
});

describe("Truchet: the pattern's output is byte-identical with the stash added", () => {
  for (const tileSet of TILE_SETS) {
    for (const frame of Object.keys(FRAMES)) {
      it(`${tileSet}/${frame} paints exactly what it painted before the stash`, () => {
        const { ctx, inst } = run({ tileSet, ...FRAMES[frame] });
        const golden = GOLDEN[`${tileSet}/${frame}`];
        const calls = ctx.calls
          .map(
            (c) =>
              `${c.op}(${c.args
                .map((a) => (typeof a === 'number' ? a.toFixed(6) : String(a)))
                .join(',')})`
          )
          .join('\n');
        // COUNTS FIRST — a stray draw call is caught by the count even where a
        // digest of a differently-ordered stream might not be diagnosable.
        expect(ctx.calls.length).toBe(golden.nCalls);
        expect(inst.svgElements.length).toBe(golden.nSvg);
        expect(digest(calls)).toBe(golden.calls);
        expect(digest(inst.svgElements.join('\n'))).toBe(golden.svg);
      });
    }
  }
});

describe('Truchet: the stash lands in the painted frame', () => {
  const centres = (params) => run(params).inst.motifHostGeometry.cells;

  it('one cell per tile per symmetry copy, and one path per drawn shape', () => {
    for (const tileSet of TILE_SETS) {
      const perTile = tileSet === 'arcs' ? 2 : 1;
      for (const symmetry of [1, 3]) {
        const { inst } = run({ tileSet, symmetry });
        expect([tileSet, symmetry, inst.motifHostGeometry.cells.length]).toEqual([
          tileSet,
          symmetry,
          TILES * TILES * symmetry,
        ]);
        expect([tileSet, symmetry, inst.motifHostGeometry.arcs.length]).toEqual([
          tileSet,
          symmetry,
          TILES * TILES * perTile * symmetry,
        ]);
      }
    }
  });

  it('tile centres sit on the canvas-centred lattice at symmetry 1', () => {
    // Hand-authored from the pattern's own layout: cell = min(W,H)/cols, the
    // block is origin-centred, and applySymmetryDraw translates it to the canvas
    // centre.
    const cell = Math.min(W, H) / TILES;
    const cells = centres({ tileSet: 'arcs' });
    cells.forEach((c, i) => {
      const col = i % TILES;
      const row = Math.floor(i / TILES);
      expect(c.x).toBeCloseTo(-(TILES * cell) / 2 + col * cell + cell / 2 + W / 2, 9);
      expect(c.y).toBeCloseTo(-(TILES * cell) / 2 + row * cell + cell / 2 + H / 2, 9);
    });
  });

  it('a start angle and offsets rotate and shift the stash, and every copy is a rotation', () => {
    const A = 37;
    const a = (A * Math.PI) / 180;
    const base = centres({ tileSet: 'arcs' });
    const moved = centres({ tileSet: 'arcs', startAngle: A, offsetX: 21, offsetY: -13 });
    base.forEach((c, i) => {
      const px = c.x - W / 2;
      const py = c.y - H / 2;
      expect(moved[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + W / 2 + 21, 6);
      expect(moved[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + H / 2 - 13, 6);
    });

    // Copy k is the base copy rigidly rotated by 2πk/n about the (offset) centre.
    const n = 4;
    const many = centres({ tileSet: 'arcs', symmetry: n });
    const per = TILES * TILES;
    for (let k = 1; k < n; k++) {
      const theta = (2 * Math.PI * k) / n;
      for (let i = 0; i < per; i++) {
        const px = many[i].x - W / 2;
        const py = many[i].y - H / 2;
        const q = many[k * per + i];
        expect(q.x).toBeCloseTo(px * Math.cos(theta) - py * Math.sin(theta) + W / 2, 6);
        expect(q.y).toBeCloseTo(px * Math.sin(theta) + py * Math.cos(theta) + H / 2, 6);
      }
    }
  });

  it('the stashed paths ARE the painted polylines, vertex for vertex', () => {
    // The strongest anti-drift check available on this channel: the arcs stash is
    // compared against the canvas draw stream itself, in the painted frame.
    // (`arcs` and `diagonals` paint through beginShape/vertex; `triangles` paints
    // through ctx.triangle, which carries its three vertices as args.)
    const { ctx, inst } = run({ tileSet: 'arcs', symmetry: 1 });
    const painted = [];
    let current = null;
    for (const c of ctx.calls) {
      if (c.op === 'beginShape') current = [];
      else if (c.op === 'vertex' && current) current.push({ x: c.args[0], y: c.args[1] });
      else if (c.op === 'endShape' && current) {
        painted.push(current);
        current = null;
      }
    }
    // The draw stream is in the LOCAL frame (applySymmetryDraw translates); the
    // stash is in the painted frame, so translate the painted one to compare.
    expect(painted).toHaveLength(inst.motifHostGeometry.arcs.length);
    painted.forEach((pts, i) => {
      const stashed = inst.motifHostGeometry.arcs[i];
      expect(stashed.points).toHaveLength(pts.length);
      pts.forEach((p, j) => {
        expect(stashed.points[j].x).toBeCloseTo(p.x + W / 2, 9);
        expect(stashed.points[j].y).toBeCloseTo(p.y + H / 2, 9);
      });
    });
  });

  it('the triangle tile set stashes a CLOSED outline per tile, on the painted triangle', () => {
    const { ctx, inst } = run({ tileSet: 'triangles', symmetry: 1 });
    const tris = ctx.calls.filter((c) => c.op === 'triangle');
    expect(tris.length).toBe(TILES * TILES);
    expect(inst.motifHostGeometry.arcs).toHaveLength(tris.length);
    tris.forEach((t, i) => {
      const path = inst.motifHostGeometry.arcs[i];
      expect(path.closed).toBe(true);
      expect(path.points).toHaveLength(3);
      for (let v = 0; v < 3; v++) {
        expect(path.points[v].x).toBeCloseTo(t.args[v * 2] + W / 2, 9);
        expect(path.points[v].y).toBeCloseTo(t.args[v * 2 + 1] + H / 2, 9);
      }
    });
  });

  it('a numeric tileSet (the slider spelling) stashes the same geometry as the string', () => {
    // DEFAULTS.tileSet is the NUMBER 0 for the slider UI while the destructure
    // default is the STRING 'arcs' — both spellings reach this pattern in
    // practice, so both are exercised.
    for (const [num, str] of [[0, 'arcs'], [1, 'diagonals'], [2, 'triangles']]) {
      expect(run({ tileSet: num }).inst.motifHostGeometry).toEqual(
        run({ tileSet: str }).inst.motifHostGeometry
      );
    }
  });

  it('is deterministic: same seed and params ⇒ same stash', () => {
    expect(run({ tileSet: 'arcs', symmetry: 3 }).inst.motifHostGeometry).toEqual(
      run({ tileSet: 'arcs', symmetry: 3 }).inst.motifHostGeometry
    );
  });
});
