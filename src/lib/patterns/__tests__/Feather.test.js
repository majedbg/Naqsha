import { describe, it, expect } from 'vitest';
import Feather from '../Feather.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of Feather. Pins svgElements + toSVGGroup for a
// fixed seed+params. Under RecordingContext the draw sequence is deterministic
// — this locks the LOGIC, not production bytes.
const SEED = 42;
const PARAMS = {
  curveType: 'hypotrochoid',
  R: 180,
  r: 60,
  d: 80,
  sampleCount: 50,       // small count for fast test; still exercises full loop
  harmonicK: 6,
  innerBase: 2,
  innerAmp: 10,
  outerBase: 2,
  outerAmp: 14,
  strokeWeight: 0.6,
  symmetry: 2,
  startAngle: 30,
  offsetX: 5,
  offsetY: 10,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new Feather();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Feather (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Feather()).toBeInstanceOf(Pattern);
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

  it('emits line draw calls through the context', () => {
    const { ctx } = run();
    const lineCalls = ctx.calls.filter((c) => c.op === 'line');
    expect(lineCalls.length).toBeGreaterThan(0);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });
});
