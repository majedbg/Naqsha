import { describe, it, expect } from 'vitest';
import Phyllotaxis from '../Phyllotaxis.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of Phyllotaxis. Pins svgElements + toSVGGroup for a
// fixed seed+params (golden master). Phyllotaxis uses ctx.random for jitter, so
// under RecordingContext the jitter output is deterministic-but-not-p5-identical —
// that's fine; this locks the LOGIC, not production bytes.
//
// Representative params include symmetry>1, jitter, triangle shape, and
// non-default fillMode so that the full ctx surface (triangle, rectMode) is
// exercised indirectly via the svgElements path and via drawShape().
const SEED = 42;
const PARAMS = {
  count: 50,
  angle: 137.508,
  spacing: 5,
  minSize: 3,
  maxSize: 10,
  sizeGrowth: 0.5,
  shape: 'triangle',
  fillMode: 'both',
  rotation: 15,
  strokeWeight: 1.0,
  jitter: 2,
  symmetry: 3,
  startAngle: 30,
  offsetX: 10,
  offsetY: -5,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new Phyllotaxis();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Phyllotaxis (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Phyllotaxis()).toBeInstanceOf(Pattern);
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
    const drawCalls = ctx.calls.filter(
      (c) => ['ellipse', 'rect', 'triangle', 'beginShape', 'line'].includes(c.op)
    );
    expect(drawCalls.length).toBeGreaterThan(0);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });
});
