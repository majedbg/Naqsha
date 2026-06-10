import { describe, it, expect } from 'vitest';
import Spirograph from '../Spirograph.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of Spirograph. Pins svgElements + toSVGGroup for a
// fixed seed+params. Under RecordingContext the draw sequence is deterministic
// — this locks the LOGIC, not production bytes.
const SEED = 42;
const PARAMS = {
  R: 100, r: 37, d: 60, revolutions: 5,
  strokeWeight: 1.5, symmetry: 3,
  startAngle: 0, offsetX: 0, offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new Spirograph();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Spirograph (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Spirograph()).toBeInstanceOf(Pattern);
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
    expect(beginCalls.length).toBeGreaterThan(0);
    expect(vertexCalls.length).toBeGreaterThan(0);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });
});
