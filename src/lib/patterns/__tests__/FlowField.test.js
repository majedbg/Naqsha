import { describe, it, expect } from 'vitest';
import FlowField from '../FlowField.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of FlowField. It uses ctx.random (seed positions)
// and ctx.noise (flow angle); under RecordingContext both are deterministic via
// mulberry32, so trails are reproducible. svgElements here are objects
// ({ pathD, strokeWeight }) so FlowField overrides contentFor.
const SEED = 11;
const PARAMS = {
  particleCount: 20, stepLength: 6, noiseScale: 0.01, curlStrength: 90,
  patternScale: 1, strokeWeight: 1, symmetry: 'none',
  startAngle: 0, offsetX: 0, offsetY: 0,
};
const COLOR = '#aa3300';
const OPACITY = 100;

function run() {
  const inst = new FlowField();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 400, 400, COLOR, OPACITY);
  return { inst, ctx };
}

describe('FlowField (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new FlowField()).toBeInstanceOf(Pattern);
  });

  it('produces object svgElements with pathD + strokeWeight', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    for (const el of inst.svgElements) {
      expect(typeof el.pathD).toBe('string');
      expect(el.pathD.startsWith('M')).toBe(true);
      expect(el.strokeWeight).toBe(1);
    }
    expect(inst.svgElements).toMatchSnapshot();
  });

  it('contentFor override serializes objects into <path> elements with color', () => {
    const { inst } = run();
    const out = inst.toSVGGroup('LF', COLOR, OPACITY);
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
