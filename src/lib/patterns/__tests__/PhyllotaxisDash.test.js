import { describe, it, expect } from 'vitest';
import PhyllotaxisDash from '../PhyllotaxisDash.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of PhyllotaxisDash. Pins svgElements + toSVGGroup
// for a fixed seed+params (golden master). PhyllotaxisDash uses ctx.noise for
// radial dash offsets; RecordingContext provides deterministic mulberry32 noise
// so the output is reproducible (not p5-identical — that's intentional).
//
// Representative params include symmetry>1 to exercise the full wrapSVGSymmetry
// path. seedCount kept at default (2000) to cover full phyllotaxis spiral.
const SEED = 42;
const PARAMS = {
  seedCount: 2000,
  spacingC: 9,
  innerMax: 8,
  outerMax: 18,
  noiseScale: 0.008,
  strokeWeight: 0.7,
  symmetry: 3,
  startAngle: 30,
  offsetX: 10,
  offsetY: -5,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new PhyllotaxisDash();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('PhyllotaxisDash (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new PhyllotaxisDash()).toBeInstanceOf(Pattern);
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
