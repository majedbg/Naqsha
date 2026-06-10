import { describe, it, expect } from 'vitest';
import FractalTree from '../FractalTree.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of FractalTree. svgElements are objects
// ({ pathD, strokeWeight }), so FractalTree must override contentFor.
// symmetry=3 exercises multi-copy toSVGGroup output.
const SEED = 42;
const PARAMS = {
  iterations: 5,
  branchAngle: 25,
  lengthDecay: 0.68,
  initialLength: 100,
  strokeWeight: 1,
  strokeDepthDecay: 0.3,
  symmetry: 3,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new FractalTree();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('FractalTree (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new FractalTree()).toBeInstanceOf(Pattern);
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

  it('emits at least one line draw call', () => {
    const { ctx } = run();
    const lineCalls = ctx.calls.filter((c) => c.op === 'line');
    expect(lineCalls.length).toBeGreaterThan(0);
  });
});
