import { describe, it, expect } from 'vitest';
import Chladni from '../Chladni.js';
import { RecordingContext, Pattern } from '../../drawingContext.js';

// Headless characterization of Chladni. Pins svgElements + toSVGGroup for a
// fixed seed+params. The Chladni field is pure trig (deterministic), so under
// RecordingContext the draw sequence is fully reproducible — this locks the
// nodal-line extraction LOGIC.
const SEED = 42;
const PARAMS = {
  m: 4,
  n: 3,
  blend: 0,
  m2: 5,
  n2: 2,
  resolution: 120,
  strokeWeight: 0.6,
  symmetry: 3,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new Chladni();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Chladni (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Chladni()).toBeInstanceOf(Pattern);
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

  it('emits beginShape/vertex/endShape draw calls through the context', () => {
    const { ctx } = run();
    const beginCalls = ctx.calls.filter((c) => c.op === 'beginShape');
    const vertexCalls = ctx.calls.filter((c) => c.op === 'vertex');
    const endCalls = ctx.calls.filter((c) => c.op === 'endShape');
    expect(beginCalls.length).toBeGreaterThan(0);
    expect(vertexCalls.length).toBeGreaterThan(0);
    expect(endCalls.length).toBeGreaterThan(0);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });
});
