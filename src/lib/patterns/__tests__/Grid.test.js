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

  // Regression: positive nonLinear must bunch lines toward center SYMMETRICALLY,
  // not collapse every line onto one half (the old stray double-assignment did).
  it('distributes positive nonLinear symmetrically about center', () => {
    const inst = new Grid();
    const ctx = new RecordingContext({ seed: SEED });
    const p = {
      cols: 8, rows: 8, spacing: 30, nonLinear: 1, jitter: 0,
      drawHorizontal: 0, drawVertical: 1, margin: 0,
      strokeWeight: 0.8, symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
    };
    inst.generateWithContext(ctx, SEED, p, 800, 600, COLOR, OPACITY);
    // Vertical lines have x1 === x2; collect that shared x (local coords, 0 = center).
    const xs = inst.svgElements
      .map((s) => {
        const m = s.match(/x1="([-\d.]+)" y1="[-\d.]+" x2="([-\d.]+)"/);
        return m && m[1] === m[2] ? parseFloat(m[1]) : null;
      })
      .filter((v) => v !== null)
      .sort((a, b) => a - b);
    // Lines must span BOTH sides of center, not pile onto one half.
    expect(xs[0]).toBeLessThan(0);
    expect(xs[xs.length - 1]).toBeGreaterThan(0);
    // And be mirror-symmetric about center.
    expect(xs[0]).toBeCloseTo(-xs[xs.length - 1], 5);
  });

  // The Y axis (nonLinearGain) is an independent gain composed on the power.
  // g=0 must be the identity (backward-compat); g!=0 reshapes the interior while
  // preserving symmetry, monotonicity, and the pinned footprint (+/- cols*spacing/2).
  it('nonLinearGain reshapes spacing yet keeps symmetry, monotonicity, and footprint', () => {
    const base = {
      cols: 8, rows: 8, spacing: 30, jitter: 0,
      drawHorizontal: 0, drawVertical: 1, margin: 0,
      strokeWeight: 0.8, symmetry: 1, startAngle: 0, offsetX: 0, offsetY: 0,
    };
    const xsFor = (gainVal, key = 'present') => {
      const inst = new Grid();
      const ctx = new RecordingContext({ seed: SEED });
      const p = { ...base, nonLinear: 1 };
      if (key === 'present') p.nonLinearGain = gainVal;
      inst.generateWithContext(ctx, SEED, p, 800, 600, COLOR, OPACITY);
      return inst.svgElements
        .map((s) => {
          const m = s.match(/x1="([-\d.]+)" y1="[-\d.]+" x2="([-\d.]+)"/);
          return m && m[1] === m[2] ? parseFloat(m[1]) : null;
        })
        .filter((v) => v !== null)
        .sort((a, b) => a - b);
    };

    const neutral = xsFor(0);
    const omitted = xsFor(0, 'omit'); // param absent entirely
    const sharp = xsFor(0.6);

    // Backward-compat: g=0 (and absent) reproduce the pure-power distribution.
    expect(neutral).toEqual(omitted);
    // The gain actually changes the interior distribution.
    expect(sharp).not.toEqual(neutral);

    for (const xs of [neutral, sharp]) {
      // mirror-symmetric about center
      expect(xs[0]).toBeCloseTo(-xs[xs.length - 1], 5);
      // strictly monotonic — no reordering or overlap
      for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      // footprint pinned at +/- cols*spacing/2 = +/-120 regardless of gain
      expect(xs[xs.length - 1]).toBeCloseTo(120, 5);
      expect(xs[0]).toBeCloseTo(-120, 5);
    }
  });
});
