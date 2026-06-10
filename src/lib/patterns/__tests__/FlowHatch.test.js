import { describe, it, expect } from 'vitest';
import FlowHatch from '../FlowHatch.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of FlowHatch. svgElements are pre-indented strings
// (4-space indent baked into each element). The current toSVGGroup joins them
// with '\n' only (no extra indent), so a custom contentFor() is needed post-migration.
const SEED = 42;
const PARAMS = {
  particleCount: 30,
  stepsPerParticle: 40,
  stepLength: 5,
  sampleEvery: 3,
  noiseScale: 0.005,
  minDashLen: 8,
  maxDashLen: 24,
  strokeWeight: 0.8,
  symmetry: 2,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run() {
  const inst = new FlowHatch();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, PARAMS, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('FlowHatch (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new FlowHatch()).toBeInstanceOf(Pattern);
  });

  it('produces string svgElements with line tags', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    for (const el of inst.svgElements) {
      expect(typeof el).toBe('string');
      expect(el).toContain('<line ');
      expect(el).toContain(`stroke="${COLOR}"`);
    }
    expect(inst.svgElements).toMatchSnapshot();
  });

  it('toSVGGroup wraps elements in SVG group with correct color and opacity', () => {
    const { inst } = run();
    const out = inst.toSVGGroup('L1', COLOR, OPACITY);
    expect(out).toContain('<line ');
    expect(out).toContain(`stroke="${COLOR}"`);
    expect(out).toMatchSnapshot();
  });

  it('emits at least one line draw call through the context', () => {
    const { ctx } = run();
    const lineCalls = ctx.calls.filter((c) => c.op === 'line');
    expect(lineCalls.length).toBeGreaterThan(0);
  });
});
