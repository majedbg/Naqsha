import { describe, it, expect } from 'vitest';
import TuringDash from '../TuringDash.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of TuringDash. Pins svgElements + toSVGGroup output
// for a fixed seed + representative params (golden master). TuringDash runs a
// Gray-Scott reaction-diffusion simulation internally using its own local PRNG —
// RecordingContext is only used to record draw calls (the pattern does NOT call
// ctx.random/ctx.noise). The snapshot is therefore deterministic and portable.
//
// symmetry=3 exercises the full wrapSVGSymmetry path.
// simIterations is reduced (20) so the test stays fast while still producing
// visible pattern structure.
const SEED = 42;
const PARAMS = {
  preset: 'spots',
  simIterations: 20,
  gridRes: 50,
  targetPoints: 100,
  minSpacing: 8,
  minDashLen: 4,
  maxDashLen: 20,
  strokeWeight: 0.8,
  symmetry: 3,
  startAngle: 15,
  offsetX: 5,
  offsetY: -5,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new TuringDash();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('TuringDash (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new TuringDash()).toBeInstanceOf(Pattern);
  });

  it('renders headlessly and pins svgElements (golden master)', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(inst.svgElements).toMatchSnapshot();
  });

  it('pins the wrapped SVG group output', () => {
    const { inst } = run();
    expect(inst.toSVGGroup('L1', COLOR, OPACITY)).toMatchSnapshot();
  });

  it('emits draw calls through the context', () => {
    const { ctx } = run();
    const drawCalls = ctx.calls.filter((c) => c.op === 'line');
    expect(drawCalls.length).toBeGreaterThan(0);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });
});
