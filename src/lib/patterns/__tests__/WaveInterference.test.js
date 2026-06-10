import { describe, it, expect } from 'vitest';
import WaveInterference from '../WaveInterference.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterisation of WaveInterference.
// svgElements are objects ({ pathD, strokeWeight }), so WaveInterference
// must override contentFor() to serialise them into <path> tags.
// symmetry:4 exercises the multi-group branch in both applySymmetryDraw
// and wrapSVGSymmetry, making the golden more representative.
const SEED = 42;
const PARAMS = {
  waveCount: 4,
  frequency: 5,
  amplitude: 40,
  lineSpacing: 15,
  strokeWeight: 1.5,
  symmetry: 4,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new WaveInterference();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('WaveInterference (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new WaveInterference()).toBeInstanceOf(Pattern);
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

  it('contentFor override serialises objects into <path> elements with color', () => {
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
