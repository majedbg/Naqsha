import { describe, it, expect } from 'vitest';
import RecursiveGeometry from '../RecursiveGeometry.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of RecursiveGeometry.
// Generation is fully deterministic (Math.cos/sin/pow, no random calls),
// so any fixed seed is fine. svgElements are objects { pathD, strokeWeight }
// requiring a custom contentFor/toSVGGroup.
const SEED = 42;
const PARAMS = {
  shape: 'hexagon',
  depth: 3,
  rotationPerLevel: 15,
  scaleFactor: 0.7,
  scaleNonLinearity: 0.5,
  startScale: 70,
  strokeWeight: 1.5,
  strokeDepthDecay: 0.2,
  symmetry: 3,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new RecursiveGeometry();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('RecursiveGeometry (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new RecursiveGeometry()).toBeInstanceOf(Pattern);
  });

  it('produces object svgElements with pathD + strokeWeight', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    for (const el of inst.svgElements) {
      expect(typeof el.pathD).toBe('string');
      expect(el.pathD.startsWith('M')).toBe(true);
      expect(typeof el.strokeWeight).toBe('number');
    }
    expect(inst.svgElements).toMatchSnapshot();
  });

  it('toSVGGroup serializes objects into <path> elements with color', () => {
    const { inst } = run();
    const out = inst.toSVGGroup('L1', COLOR, OPACITY);
    expect(out).toContain('<path d="M');
    expect(out).toContain(`stroke="${COLOR}"`);
    expect(out).toMatchSnapshot();
  });

  it('emits beginShape/vertex/endShape through the context', () => {
    const { ctx } = run();
    const ops = new Set(ctx.calls.map((c) => c.op));
    expect(ops.has('beginShape')).toBe(true);
    expect(ops.has('vertex')).toBe(true);
    expect(ops.has('endShape')).toBe(true);
  });
});
