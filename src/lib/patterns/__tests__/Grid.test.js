import { describe, it, expect } from 'vitest';
import Grid from '../Grid.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of Grid. Pins svgElements + toSVGGroup for a fixed
// seed+params. Grid uses ctx.random for jitter, so under RecordingContext the
// jittered output is deterministic-but-not-p5-identical — that's fine; this
// locks the LOGIC, not production bytes.
const SEED = 7;
const PARAMS = {
  cols: 4, rows: 3, spacing: 30, nonLinear: 0.5, jitter: 2,
  drawHorizontal: 1, drawVertical: 1, margin: 10,
  strokeWeight: 0.8, symmetry: 2, startAngle: 15, offsetX: 5, offsetY: -5,
};
const COLOR = '#112233';
const OPACITY = 80;

function run() {
  const inst = new Grid();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Grid (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Grid()).toBeInstanceOf(Pattern);
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
