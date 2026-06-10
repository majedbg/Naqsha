import { describe, it, expect } from 'vitest';
import VoronoiCells from '../VoronoiCells.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of VoronoiCells. svgElements are objects
// ({ pathD, strokeWeight }) so VoronoiCells overrides contentFor.
// Small cellCount keeps the test fast while still producing lines.
const SEED = 42;
const PARAMS = {
  cellCount: 12,
  jitter: 40,
  drawMode: 'outlines',
  relaxationSteps: 1,
  strokeWeight: 1.5,
  symmetry: 4,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const PARAMS_NO_SYMMETRY = {
  cellCount: 8,
  jitter: 80,
  drawMode: 'delaunay',
  relaxationSteps: 0,
  strokeWeight: 1,
  // symmetry intentionally omitted to exercise the || 'none' / || 1 fallback
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#3366aa';
const OPACITY = 80;

function run(params = PARAMS) {
  const inst = new VoronoiCells();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('VoronoiCells (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new VoronoiCells()).toBeInstanceOf(Pattern);
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

  it('contentFor override serializes objects into <path> elements with color', () => {
    const { inst } = run();
    const out = inst.toSVGGroup('L1', COLOR, OPACITY);
    expect(out).toContain('<path d="M');
    expect(out).toContain(`stroke="${COLOR}"`);
    expect(out).toMatchSnapshot();
  });

  it('emits line calls through the context', () => {
    const { ctx } = run();
    const ops = ctx.calls.map((c) => c.op);
    expect(ops).toContain('line');
  });

  it('snapshot — no-symmetry fallback path (symmetry omitted)', () => {
    const { inst } = run(PARAMS_NO_SYMMETRY);
    expect(inst.svgElements).toMatchSnapshot();
    expect(inst.toSVGGroup('L2', COLOR, OPACITY)).toMatchSnapshot();
  });
});
