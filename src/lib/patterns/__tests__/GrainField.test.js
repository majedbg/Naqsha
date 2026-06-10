import { describe, it, expect } from 'vitest';
import GrainField from '../GrainField.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of GrainField.
// Uses ctx.random for point placement; under RecordingContext that's deterministic
// via mulberry32 so the dash layout is fully reproducible.
// svgElements are plain strings (<line ... />) with 6-space indent baked in,
// so GrainField overrides contentFor to join them without extra indentation.
const SEED = 42;
const PARAMS = {
  pointCount: 20,
  relaxPasses: 2,
  neighborK: 3,
  minDashLen: 6,
  maxDashLen: 28,
  strokeWeight: 1.5,
  symmetry: 3,
  startAngle: 15,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new GrainField();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('GrainField (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new GrainField()).toBeInstanceOf(Pattern);
  });

  it('produces ≥1 svgElements after generateWithContext', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(inst.svgElements).toMatchSnapshot();
  });

  it('toSVGGroup returns valid SVG with correct color and opacity', () => {
    const { inst } = run();
    const out = inst.toSVGGroup('L1', COLOR, OPACITY);
    expect(out).toContain('<line ');
    expect(out).toContain(`stroke="${COLOR}"`);
    expect(out).toMatchSnapshot();
  });

  it('emits line draw calls through the recording context', () => {
    const { ctx } = run();
    const lineCalls = ctx.calls.filter((c) => c.op === 'line');
    expect(lineCalls.length).toBeGreaterThan(0);
  });
});
