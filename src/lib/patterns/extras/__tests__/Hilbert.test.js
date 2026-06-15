import { describe, it, expect } from 'vitest';
import Hilbert from '../Hilbert.js';
import { RecordingContext, Pattern } from '../../drawingContext.js';

// Headless characterization of Hilbert. Pins svgElements + toSVGGroup for a
// fixed seed+params. Under RecordingContext the draw sequence is deterministic
// — this locks the LOGIC, not production bytes. The curve is ONE unbroken
// polyline: a single <path> element and a single beginShape/endShape run with
// exactly 4^order vertices.
const SEED = 42;
const ORDER = 4;
const PARAMS = {
  order: ORDER,
  margin: 20,
  strokeWeight: 0.8,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new Hilbert();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Hilbert (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Hilbert()).toBeInstanceOf(Pattern);
  });

  it('emits exactly ONE svg element (single continuous path) and pins it', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBe(1);
    expect(inst.svgElements).toMatchSnapshot();
  });

  it('pins the wrapped SVG group output', () => {
    const { inst } = run();
    expect(inst.toSVGGroup('L1', COLOR, OPACITY)).toMatchSnapshot();
  });

  it('draws ONE beginShape/endShape with 4^order vertices (single-path invariant)', () => {
    const { ctx } = run();
    const beginCalls = ctx.calls.filter((c) => c.op === 'beginShape');
    const endCalls = ctx.calls.filter((c) => c.op === 'endShape');
    const vertexCalls = ctx.calls.filter((c) => c.op === 'vertex');
    expect(beginCalls.length).toBe(1);
    expect(endCalls.length).toBe(1);
    expect(vertexCalls.length).toBe(Math.pow(4, ORDER));
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });
});
