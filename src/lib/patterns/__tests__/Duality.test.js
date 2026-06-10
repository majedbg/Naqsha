import { describe, it, expect } from 'vitest';
import Duality from '../Duality.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of Duality.
//
// IMPORTANT: Duality sources ALL randomness from its own mulberry32(seed) (now
// the shared rng.js), NEVER from ctx.random/ctx.noise. Its drawBase only issues
// color/stroke/line draw calls. Therefore its svgElements are independent of the
// adapter's RNG — this golden output is byte-identical to production / `main`.
// The verbatim mulberry32 lift is what guarantees that.
const SEED = 123;
const PARAMS = {
  innerRadius: 20, outerRadius: 200, spiralTurns: 5, spiralGrowth: 1.2,
  dashCount: 60, dashLength: 16, dashLenJitter: 0.3, dashSparsity: 0.1,
  angleJitter: 0.2, dashStrokeWeight: 1.2,
  arcCount: 8, arcSpacingNL: 1.6, arcRadiusJitter: 3,
  arcMinAngle: 40, arcMaxAngle: 240, arcMaxLength: 600, arcAngleJitter: 1.0,
  arcStrokeWeight: 0.8, overlapGap: 5, overlapPriority: 0.0,
  originX: 0.5, originY: 0.5, symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
};
const COLOR = '#204060';
const OPACITY = 100;

function run() {
  const inst = new Duality();
  const ctx = new RecordingContext({ seed: 999 }); // adapter seed is irrelevant for Duality
  inst.generateWithContext(ctx, SEED, PARAMS, 600, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Duality (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Duality()).toBeInstanceOf(Pattern);
  });

  it('renders headlessly and pins svgElements (production-identical golden)', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(inst.svgElements).toMatchSnapshot();
  });

  it('output is independent of the adapter RNG seed (uses internal mulberry32)', () => {
    const a = new Duality();
    const b = new Duality();
    a.generateWithContext(new RecordingContext({ seed: 1 }), SEED, PARAMS, 600, 600, COLOR, OPACITY);
    b.generateWithContext(new RecordingContext({ seed: 99999 }), SEED, PARAMS, 600, 600, COLOR, OPACITY);
    expect(a.svgElements).toEqual(b.svgElements);
  });

  it('pins the wrapped SVG group output', () => {
    const { inst } = run();
    expect(inst.toSVGGroup('LD', COLOR, OPACITY)).toMatchSnapshot();
  });

  it('emits line draw calls through the context', () => {
    const { ctx } = run();
    expect(ctx.calls.filter((c) => c.op === 'line').length).toBeGreaterThan(0);
  });
});
