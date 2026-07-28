// Motif host-geometry capture for CirclePacking (the CELL-CONTAINER seam, #146).
//
// CirclePacking stashes its ACCEPTED circle set on `instance.motifHostGeometry`
// during generate(), in CANVAS-PIXEL (top-left origin) frame:
//   motifHostGeometry = { circles: [{x, y, r}, …] }
//
// ACCEPTED, NOT EMITTED. The pattern keeps two collections: `placed` (one entry
// per packing SITE, radius = the outer ring the maker sees) and `outCircles`
// (what is drawn — in the `nested` render that is `ringCount` CONCENTRIC circles
// per site, all sharing one centre). Stashing `outCircles` would hand the
// extractor several coincident anchors per site, which the placement engine's
// empty-circle test silently reduces to one glyph. The stash is `placed`.
//
// FRAME. The pattern builds origin-centred and paints through
// applySymmetryDraw(ctx, 1, cx, cy, drawBase, startAngle, offsetX, offsetY),
// i.e. translate(cx+offsetX, cy+offsetY) then rotate(startAngle). So
//   world = R(startAngle)·centred + (canvasW/2 + offsetX, canvasH/2 + offsetY)
// Symmetry is HARDCODED to 1 here, so there are no copies to replicate — but the
// start-angle rotation is real and IS applied (unlike Voronoi's stash, which
// documents that it matches no visible copy at a nonzero start angle). The frame
// math below is HAND-AUTHORED, never reusing the implementation's conversion.
//
// RNG. Adding the stash must consume NO RNG — the packing loop's "exactly two
// ctx.random calls per attempt" contract is documented in the class header and a
// stray draw desynchronises every circle after it. The digests below were
// captured by running THIS FILE against the unmodified pattern (main @ 170f5a7)
// before the stash existed; they are the byte-identical proof.

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import CirclePacking from './CirclePacking.js';
import { RecordingContext } from './drawingContext.js';

const W = 800;
const H = 600;
const CX = W / 2;
const CY = H / 2;

const BASE = { attempts: 400, minRadius: 6, maxRadius: 40 };

function gen(params = {}, seed = 7) {
  const inst = new CirclePacking();
  const ctx = new RecordingContext({ seed: 1 });
  inst.generate(ctx, seed, { ...BASE, ...params }, W, H, '#000000', 100);
  return { inst, ctx };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

describe('CirclePacking motif host-geometry capture (accepted circles)', () => {
  it('stashes circles as a non-empty array of {x,y,r}', () => {
    const { circles } = gen().inst.motifHostGeometry;
    expect(Array.isArray(circles)).toBe(true);
    expect(circles.length).toBeGreaterThan(0);
    for (const c of circles) {
      expect(typeof c.x).toBe('number');
      expect(typeof c.y).toBe('number');
      expect(typeof c.r).toBe('number');
      expect(c.r).toBeGreaterThan(0);
    }
  });

  it('emits circle centres in CANVAS-PIXEL frame (all within [0,W]x[0,H])', () => {
    // A centred-frame bug would put coordinates at negative values. Circles are
    // packed inside the canvas rectangle by construction.
    const { circles } = gen().inst.motifHostGeometry;
    for (const c of circles) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(W);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(H);
    }
  });

  it('stashes the ACCEPTED set — one entry per site, NOT one per drawn ring', () => {
    // The nested render draws `ringCount` concentric circles per site. The stash
    // must not grow with ringCount, and must carry no coincident centres.
    const outlines = gen({ render: 'outlines' }).inst.motifHostGeometry.circles;
    const nested3 = gen({ render: 'nested', ringCount: 3 }).inst.motifHostGeometry.circles;
    const nested6 = gen({ render: 'nested', ringCount: 6 }).inst.motifHostGeometry.circles;
    expect(nested3.length).toBe(outlines.length);
    expect(nested6.length).toBe(outlines.length);
    // No two stashed circles share a centre.
    const keys = new Set(nested6.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(nested6.length);
    // And the drawn ellipse count really IS ringCount× bigger — proving the
    // emitted set is the thing we deliberately did not stash.
    const drawn = (render, ringCount) =>
      gen({ render, ringCount }).ctx.calls.filter((c) => c.op === 'ellipse').length;
    expect(drawn('nested', 3)).toBe(3 * outlines.length);
  });

  it('each stashed radius is the OUTER ring the maker sees', () => {
    // In nested mode the outermost drawn ring (s=0) is exactly c.r.
    const { inst, ctx } = gen({ render: 'nested', ringCount: 3 });
    const ellipses = ctx.calls
      .filter((c) => c.op === 'ellipse')
      .map(({ args }) => ({ x: args[0] + CX, y: args[1] + CY, r: args[2] / 2 }));
    for (const c of inst.motifHostGeometry.circles) {
      const sameCentre = ellipses.filter(
        (e) => Math.abs(e.x - c.x) < 1e-9 && Math.abs(e.y - c.y) < 1e-9
      );
      expect(sameCentre.length).toBe(3);
      const maxDrawn = Math.max(...sameCentre.map((e) => e.r));
      expect(c.r).toBeCloseTo(maxDrawn, 9);
    }
  });

  it('the stash is render-mode independent — links === outlines === nested', () => {
    const outlines = gen({ render: 'outlines' }).inst.motifHostGeometry;
    const links = gen({ render: 'links' }).inst.motifHostGeometry;
    const nested = gen({ render: 'nested' }).inst.motifHostGeometry;
    expect(links).toEqual(outlines);
    expect(nested).toEqual(outlines);
  });

  it('circle centres match the DRAWN ellipses (frame-shifted) in outlines mode', () => {
    const { inst, ctx } = gen({ render: 'outlines' });
    const ellipses = ctx.calls.filter((c) => c.op === 'ellipse').map((c) => c.args);
    const { circles } = inst.motifHostGeometry;
    expect(ellipses.length).toBe(circles.length);
    ellipses.forEach(([x, y, dw], i) => {
      expect(circles[i].x).toBeCloseTo(x + CX, 9);
      expect(circles[i].y).toBeCloseTo(y + CY, 9);
      expect(circles[i].r).toBeCloseTo(dw / 2, 9);
    });
  });

  it('applies the offsetX/offsetY term', () => {
    const D = 37;
    const E = -19;
    const base = gen().inst.motifHostGeometry.circles;
    const shifted = gen({ offsetX: D, offsetY: E }).inst.motifHostGeometry.circles;
    expect(shifted.length).toBe(base.length);
    base.forEach((c, i) => {
      expect(shifted[i].x).toBeCloseTo(c.x + D, 9);
      expect(shifted[i].y).toBeCloseTo(c.y + E, 9);
      expect(shifted[i].r).toBeCloseTo(c.r, 9);
    });
  });

  it('applies the startAngle rotation about the pattern origin (hand-authored)', () => {
    // world = R(a)·centred + (CX+offsetX, CY+offsetY). Derive the expected
    // rotated stash from the UNROTATED stash rather than from the implementation.
    const A = 33;
    const a = (A * Math.PI) / 180;
    const base = gen().inst.motifHostGeometry.circles;
    const rotated = gen({ startAngle: A }).inst.motifHostGeometry.circles;
    expect(rotated.length).toBe(base.length);
    base.forEach((c, i) => {
      const px = c.x - CX;
      const py = c.y - CY;
      expect(rotated[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + CX, 6);
      expect(rotated[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + CY, 6);
      expect(rotated[i].r).toBeCloseTo(c.r, 9);
    });
  });

  it('start angle AND offsets compose in the painted order (rotate, then translate)', () => {
    const A = 33;
    const D = 21;
    const E = -14;
    const a = (A * Math.PI) / 180;
    const base = gen().inst.motifHostGeometry.circles;
    const both = gen({ startAngle: A, offsetX: D, offsetY: E }).inst.motifHostGeometry.circles;
    base.forEach((c, i) => {
      const px = c.x - CX;
      const py = c.y - CY;
      expect(both[i].x).toBeCloseTo(px * Math.cos(a) - py * Math.sin(a) + CX + D, 6);
      expect(both[i].y).toBeCloseTo(px * Math.sin(a) + py * Math.cos(a) + CY + E, 6);
    });
  });

  it('re-seeding the packing moves the circles (the host seed drives the anchors)', () => {
    const a = gen({}, 7).inst.motifHostGeometry.circles;
    const b = gen({}, 8).inst.motifHostGeometry.circles;
    expect(b).not.toEqual(a);
  });

  it('is deterministic — repeated generation yields identical geometry', () => {
    expect(gen().inst.motifHostGeometry).toEqual(gen().inst.motifHostGeometry);
  });

  it('an unreachable packing yields an empty stash rather than throwing', () => {
    // minRadius larger than the canvas half-extent: nothing can ever be placed.
    const { circles } = gen({ minRadius: 5000, maxRadius: 6000 }).inst.motifHostGeometry;
    expect(circles).toEqual([]);
  });

  it('adding the stash consumed NO RNG — the draw stream is byte-identical', () => {
    // Digests captured by running this file against the UNMODIFIED pattern
    // (main @ 170f5a7, before motifHostGeometry existed). Both the recorded draw
    // stream and the emitted SVG are hashed: a single stray ctx.random() call
    // shifts every subsequent candidate point and both digests change.
    const CASES = [
      ['outlines', { render: 'outlines' }, '3ec22442c09e6c83', '39dd828cc1c983d3'],
      ['nested', { render: 'nested', ringCount: 3 }, 'f3208c90f9fcce7c', 'c836ddb7a548f123'],
      ['links', { render: 'links' }, '3a601f5d60dff4ab', 'e45350b9b654cbee'],
      [
        'disc+angle+offset',
        { boundary: 'circle', startAngle: 33, offsetX: 21, offsetY: -14 },
        '8f83f5cf425f0d3a',
        'a5b245428e848f89',
      ],
    ];
    for (const [name, params, callDigest, svgDigest] of CASES) {
      const { inst, ctx } = gen(params);
      expect(`${name}:${sha(JSON.stringify(ctx.calls))}`).toBe(`${name}:${callDigest}`);
      expect(`${name}:${sha(inst.svgElements.join('\n'))}`).toBe(`${name}:${svgDigest}`);
    }
  });
});
