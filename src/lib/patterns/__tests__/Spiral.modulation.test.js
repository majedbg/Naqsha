import { describe, it, expect } from 'vitest';
import Spiral from '../Spiral.js';
import { RecordingContext } from '../drawingContext.js';
import { ScalarField } from '../../fields/ScalarField.js';

// Behavioral spec for Spiral's DISTORT modulation. A guide field
// (channel:'distort') spatially SCALES the existing per-point noise jitter:
// `distortAmount` is the CEILING, and the field's transfer output (clamped to
// [0,∞)) is a per-point mask in [0,1] that decides how much of the ceiling
// applies where. Off the distort path, output must be byte-identical to no
// modulation, and the noise stream must not shift (sampleSigned is a pure array
// lookup, never a ctx.noise/random call).

const SEED = 42;
const W = 800;
const H = 600;
const COLOR = '#3366aa';
const OPACITY = 80;

// symmetry:1 keeps the canvas-vs-SVG comparison clean (no mirrored replays).
const BASE = {
  armCount: 3,
  turns: 4,
  innerRadius: 10,
  outerRadius: 200,
  growth: 1.0,
  distortAmount: 35,
  distortScale: 0.01,
  wobbleAmp: 0,
  wobbleFreq: 8,
  stepsPerTurn: 60,
  strokeWeight: 0.8,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

const constField = (c) =>
  ScalarField.fromFunction(() => c, { nx: 33, ny: 33 });

// A spatially-varying field: rises left→right across u ∈ [0,1], range [-1,1].
const risingField = () =>
  ScalarField.fromFunction((u) => 2 * (u - 0.5), { nx: 65, ny: 65 });

function run(params) {
  const inst = new Spiral();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Spiral distort modulation', () => {
  it('a negative-saturated field zeroes distortion (mask=0 → clean spiral)', () => {
    // field = -1 everywhere, {channel:'distort', amount:1}, default range {-1,1}:
    //   applyRange(-1) = -1 → amount*(-1) = -1 → max(0,-1) = 0 → amt = 0.
    // So every point's jitter is scaled to 0 → identical to distortAmount:0.
    const clean = run({ ...BASE, distortAmount: 0 }).inst.svgElements;
    const modulated = run({
      ...BASE,
      modulation: { field: constField(-1), channel: 'distort', amount: 1 },
    }).inst.svgElements;
    expect(modulated).toEqual(clean);
  });

  it('a positive-saturated field applies the full ceiling (mask=1 → unmodulated)', () => {
    // field = +1 everywhere: applyRange(1)=1, shapeEase(1,0)=1, amount*1=1,
    // max(0,1)=1 → amt = distortAmount. Byte-identical to the unmodulated spiral.
    const baseline = run(BASE).inst.svgElements;
    const modulated = run({
      ...BASE,
      modulation: { field: constField(1), channel: 'distort', amount: 1 },
    }).inst.svgElements;
    expect(modulated).toEqual(baseline);
  });

  it('is a no-op for a wrong channel or null modulation', () => {
    const field = risingField();
    const baseline = run(BASE).inst.svgElements;
    expect(
      run({ ...BASE, modulation: { field, channel: 'warp', amount: 3 } }).inst.svgElements
    ).toEqual(baseline);
    expect(run({ ...BASE, modulation: null }).inst.svgElements).toEqual(baseline);
  });

  it('wires distortFrame: polar vs cartesian differ with a varying field', () => {
    const field = risingField();
    const polar = run({
      ...BASE,
      distortFrame: 'polar',
      modulation: { field, channel: 'distort', amount: 1 },
    }).inst.svgElements;
    const cartesian = run({
      ...BASE,
      distortFrame: 'cartesian',
      modulation: { field, channel: 'distort', amount: 1 },
    }).inst.svgElements;
    expect(polar).not.toEqual(cartesian);
  });

  it('keeps canvas draws and SVG byte-identical under distort', () => {
    const field = risingField();
    const { inst, ctx } = run({
      ...BASE,
      modulation: { field, channel: 'distort', amount: 1 },
    });

    // Spiral's SVG formatter is toFixed(2); mirror it on the canvas coords.
    const fmt = (n) => Number(n).toFixed(2);

    const canvasVerts = ctx.calls
      .filter((c) => c.op === 'vertex')
      .map((c) => `${fmt(c.args[0])},${fmt(c.args[1])}`);

    // Extract "x,y" points from each pathD (M x,y L x,y L ...). Keep the literal
    // toFixed(2) tokens the pattern emitted — re-parsing through Number() would
    // collapse a signed-zero "-0.00" to "0.00" and manufacture a false mismatch.
    const svgVerts = [];
    for (const el of inst.svgElements) {
      for (const tok of el.pathD.split(/[ML]/)) {
        const t = tok.trim();
        if (t) svgVerts.push(t);
      }
    }

    expect(canvasVerts).toEqual(svgVerts);
  });
});
