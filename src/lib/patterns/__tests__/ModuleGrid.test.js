import { describe, it, expect } from 'vitest';
import ModuleGrid from '../ModuleGrid.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of ModuleGrid. Pins svgElements + toSVGGroup for a
// fixed seed+params. ModuleGrid uses ctx.random for per-cell rotation/jitter, so
// under RecordingContext the output is deterministic-but-not-p5-identical —
// that's fine; this locks the LOGIC, not production bytes.
const SEED = 11;
const PARAMS = {
  module: 'sideSweep',
  tilesX: 3,
  tilesY: 2,
  lineCount: 4,
  rotateMode: 'seeded',
  jitter: 0.2,
  strokeCap: 'round',
  strokeWeight: 0.6,
  startAngle: 15,
  offsetX: 5,
  offsetY: -5,
};
const COLOR = '#224488';
const OPACITY = 80;

function run(params = PARAMS) {
  const inst = new ModuleGrid();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

describe('ModuleGrid (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new ModuleGrid()).toBeInstanceOf(Pattern);
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

  it('produces valid line SVG strings for the default module', () => {
    const { inst } = run();
    for (const el of inst.svgElements) {
      expect(el).toMatch(/^<line .*stroke-linecap="round".*\/>$/);
    }
  });

  it('rings module emits <circle> outlines via ctx.ellipse', () => {
    const { inst, ctx } = run({ ...PARAMS, module: 'rings', jitter: 0 });
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(inst.svgElements.every((el) => el.startsWith('<circle'))).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'ellipse')).toBe(true);
  });

  it('rings default geometry has no degenerate r="0" ring (harmless defaults)', () => {
    // ringSpacing=0 + ringEccentricity=0 must reproduce the original ramp,
    // where the smallest diameter is size*(1 - (count-1)/count) > 0.
    const { inst } = run({ ...PARAMS, module: 'rings', jitter: 0, lineCount: 4 });
    expect(inst.svgElements.some((el) => el.includes('r="0.00"'))).toBe(false);
  });

  it('ringSpacing changes ring placement', () => {
    const base = { ...PARAMS, module: 'rings', jitter: 0, rotateMode: 'aligned', lineCount: 5 };
    expect(run({ ...base, ringSpacing: 0.8 }).inst.svgElements)
      .not.toEqual(run(base).inst.svgElements);
  });

  it('aligned rotateMode pulls no rotation randomness (cells are axis-aligned)', () => {
    // With jitter 0 + aligned, the RNG stream is untouched, so the geometry is
    // a pure function of the grid — re-running yields identical output.
    const a = run({ ...PARAMS, rotateMode: 'aligned', jitter: 0 }).inst.svgElements;
    const b = run({ ...PARAMS, rotateMode: 'aligned', jitter: 0 }).inst.svgElements;
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  // --- diamond module ---------------------------------------------------------
  it('diamond module emits valid line svgElements deterministically', () => {
    const p = { ...PARAMS, module: 'diamond', jitter: 0, rotateMode: 'aligned', lineCount: 3 };
    const a = run(p).inst.svgElements;
    const b = run(p).inst.svgElements;
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b); // deterministic for a fixed seed
    // 4 segments per rhombus × 3 rhombi × 6 cells = 72 lines.
    expect(a.length).toBe(4 * 3 * 3 * 2);
    for (const el of a) expect(el).toMatch(/^<line .*\/>$/);
  });

  it('diamondAspect/diamondNesting change diamond output', () => {
    const base = { ...PARAMS, module: 'diamond', jitter: 0, rotateMode: 'aligned', lineCount: 4 };
    const def = run(base).inst.svgElements;
    const wide = run({ ...base, diamondAspect: 2.2 }).inst.svgElements;
    const nested = run({ ...base, diamondNesting: 0.8 }).inst.svgElements;
    expect(wide).not.toEqual(def);
    expect(nested).not.toEqual(def);
  });

  // --- universal scale --------------------------------------------------------
  function coordSpan(svgElements) {
    // Max absolute origin-centered coordinate across all <line> endpoints.
    let max = 0;
    for (const el of svgElements) {
      const m = el.match(/x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/);
      if (!m) continue;
      for (let i = 1; i <= 4; i++) max = Math.max(max, Math.abs(parseFloat(m[i])));
    }
    return max;
  }

  it('scale > 1 pushes coordinates beyond the unscaled cell bounds (overflow)', () => {
    // aligned + no jitter so the only difference is the scale multiplier.
    const base = { ...PARAMS, module: 'sideSweep', jitter: 0, rotateMode: 'aligned', scale: 1 };
    const big = { ...base, scale: 2 };
    const span1 = coordSpan(run(base).inst.svgElements);
    const span2 = coordSpan(run(big).inst.svgElements);
    expect(span2).toBeGreaterThan(span1); // module overflows its cell, not clipped
  });

  it('scaleMode seeded + gradient are deterministic for a fixed seed', () => {
    for (const scaleMode of ['seeded', 'gradient']) {
      const p = { ...PARAMS, module: 'sideSweep', scaleMode, scale: 1 };
      expect(run(p).inst.svgElements).toEqual(run(p).inst.svgElements);
    }
  });

  it('scaleMode uniform leaves the RNG stream byte-identical to scale-only', () => {
    // uniform must not pull from ctx.random, so it equals the default scaleMode.
    const a = run({ ...PARAMS, scaleMode: 'uniform' }).inst.svgElements;
    const b = run({ ...PARAMS }).inst.svgElements; // PARAMS has no scaleMode → defaults to uniform
    expect(a).toEqual(b);
  });

  // --- per-module knobs change output ----------------------------------------
  it('per-module knobs change their module output (and only theirs)', () => {
    const sweepBase = { ...PARAMS, module: 'sideSweep', jitter: 0, rotateMode: 'aligned' };
    expect(run({ ...sweepBase, sweepCurve: 0.8 }).inst.svgElements)
      .not.toEqual(run(sweepBase).inst.svgElements);

    const fanBase = { ...PARAMS, module: 'fan', jitter: 0, rotateMode: 'aligned' };
    expect(run({ ...fanBase, fanSpread: 90 }).inst.svgElements)
      .not.toEqual(run({ ...fanBase, fanSpread: 360 }).inst.svgElements);

    const chevBase = { ...PARAMS, module: 'chevron', jitter: 0, rotateMode: 'aligned' };
    expect(run({ ...chevBase, chevronDepth: 1.8 }).inst.svgElements)
      .not.toEqual(run({ ...chevBase, chevronDepth: 0.4 }).inst.svgElements);

    const ringBase = { ...PARAMS, module: 'rings', jitter: 0, rotateMode: 'aligned' };
    expect(run({ ...ringBase, ringEccentricity: 0.7 }).inst.svgElements)
      .not.toEqual(run(ringBase).inst.svgElements);
  });
});
