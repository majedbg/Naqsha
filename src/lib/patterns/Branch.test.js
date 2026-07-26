import { describe, it, expect } from 'vitest';
import Branch from './Branch.js';
import { RecordingContext } from './drawingContext.js';

import { DEFAULT_PARAMS } from '../../constants.js';

const W = 1152;
const H = 1152;
const SEED = 4242;
const COLOR = '#1f2d3d';
const P = () => ({ ...DEFAULT_PARAMS.branch });

/** Run generate() against a headless RecordingContext. */
const run = (params = P(), seed = SEED) => {
  const ctx = new RecordingContext({ seed });
  const inst = new Branch();
  inst.generateWithContext(ctx, seed, params, W, H, COLOR, 100);
  return { ctx, inst };
};

/** Every `points="…"` polyline vertex list the SVG carries. */
const svgPolylines = (svg) =>
  [...svg.matchAll(/<polyline points="([^"]+)"/g)].map((m) =>
    m[1].split(' ').map((pair) => pair.split(',').map(Number))
  );

/** Every beginShape…endShape vertex run recorded on the drawing context. */
const drawnShapes = (ctx) => {
  const shapes = [];
  let cur = null;
  for (const call of ctx.calls) {
    if (call.op === 'beginShape') cur = [];
    else if (call.op === 'vertex' && cur) cur.push([call.args[0], call.args[1]]);
    else if (call.op === 'endShape' && cur) {
      shapes.push({ points: cur, closed: call.args.length > 0 });
      cur = null;
    }
  }
  return shapes;
};

describe('Branch pattern', () => {
  it('draws ONE open polyline per skeleton path — whole stems, not per-segment lines', () => {
    const { ctx } = run();
    const shapes = drawnShapes(ctx);
    // One shape per main-branch stem — a real plant, not a 2-terminus meander.
    expect(shapes.length).toBeGreaterThan(10);
    for (const s of shapes) expect(s.closed).toBe(false);
    // No per-segment ctx.line() confetti (the FractalTree/Dendrite failure mode).
    expect(ctx.calls.filter((c) => c.op === 'line')).toEqual([]);
  });

  it('CANVAS == SVG — the same vertices are drawn and exported', () => {
    const { ctx, inst } = run();
    const shapes = drawnShapes(ctx);
    const polys = svgPolylines(inst.toSVGGroup('layer-1', COLOR, 100));
    expect(polys.length).toBe(shapes.length);
    polys.forEach((poly, i) => {
      expect(poly.length).toBe(shapes[i].points.length);
      poly.forEach(([x, y], j) => {
        // SVG coords are rounded to 2dp; the canvas carries full precision.
        expect(x).toBeCloseTo(shapes[i].points[j][0], 1);
        expect(y).toBeCloseTo(shapes[i].points[j][1], 1);
      });
    });
  });

  it('is deterministic: same seed + params ⇒ identical geometry', () => {
    const a = run();
    const b = run();
    expect(drawnShapes(b.ctx)).toEqual(drawnShapes(a.ctx));
    expect(b.inst.contentFor(COLOR)).toBe(a.inst.contentFor(COLOR));
  });

  it('responds to the seed', () => {
    const a = run(P(), 1);
    const b = run(P(), 2);
    expect(drawnShapes(b.ctx)).not.toEqual(drawnShapes(a.ctx));
  });

  it('RESEEDS at the top of generate() — a second run on a WARM context matches a cold one', () => {
    // The capture/ghost probe re-runs generate() on a context that has already
    // served other work; without the reseed the probe would draw something else.
    const cold = new RecordingContext({ seed: SEED });
    const a = new Branch();
    a.generateWithContext(cold, SEED, P(), W, H, COLOR, 100);

    const warm = new RecordingContext({ seed: SEED });
    warm.random();
    warm.random();
    warm.random();
    const b = new Branch();
    b.generateWithContext(warm, SEED, P(), W, H, COLOR, 100);

    expect(b.contentFor(COLOR)).toBe(a.contentFor(COLOR));
  });

  it('draws in the CENTRED frame under applySymmetryDraw (translate to canvas centre)', () => {
    const { ctx } = run();
    const translates = ctx.calls.filter((c) => c.op === 'translate');
    expect(translates.length).toBeGreaterThan(0);
    expect(translates[0].args).toEqual([W / 2, H / 2]);
    // Centred coords ⇒ vertices straddle the origin.
    const xs = drawnShapes(ctx).flatMap((s) => s.points.map((p) => p[0]));
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
  });

  it('honours symmetry by REPLAYING the base draw (one copy per fold)', () => {
    const one = run(P());
    const three = run({ ...P(), symmetry: 3 });
    expect(drawnShapes(three.ctx).length).toBe(drawnShapes(one.ctx).length * 3);
  });

  it('emits nothing (and does not throw) when no attractors are requested', () => {
    const { ctx, inst } = run({ ...P(), attractorCount: 0 });
    expect(drawnShapes(ctx)).toEqual([]);
    expect(inst.contentFor(COLOR)).toBe('');
  });

  it('produces finite coordinates under the thumbnail RNG (mulberry32, not p5)', () => {
    const { inst } = run();
    expect(inst.contentFor(COLOR)).not.toMatch(/NaN|Infinity/);
  });
});
