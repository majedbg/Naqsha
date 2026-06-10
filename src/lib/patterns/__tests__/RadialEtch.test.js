import { describe, it, expect } from 'vitest';
import RadialEtch from '../RadialEtch.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of RadialEtch. Pins svgElements + toSVGGroup for a
// fixed seed+params. Uses symmetry > 1 to exercise symmetry wrapping.
const SEED = 42;
const PARAMS = {
  lineCount: 24,
  innerRadius: 20,
  outerRadius: 200,
  lengthJitter: 0.3,
  angleJitter: 0.5,
  noiseWarp: 0.2,
  noiseScale: 0.005,
  strokeWeight: 0.8,
  symmetry: 3,
  startAngle: 30,
  offsetX: 5,
  offsetY: -5,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new RadialEtch();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('RadialEtch (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new RadialEtch()).toBeInstanceOf(Pattern);
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
