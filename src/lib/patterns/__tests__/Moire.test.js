import { describe, it, expect } from 'vitest';
import Moire from '../Moire.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of Moire. The fields are pure functions of the
// params (no ctx.random/noise), so output is fully deterministic. We lock the
// LOGIC: each fieldType emits, role B ≠ role A, and the field/role/transform
// knobs change output.
const SEED = 7;
const W = 800;
const H = 800;
const COLOR = '#1a1a2e';
const OPACITY = 100;

const BASE = {
  fieldType: 'parallelLines',
  density: 40,
  moireRotation: 5,
  moireOffsetX: 0,
  moireOffsetY: 0,
  moireScale: 1,
  strokeWeight: 0.5,
  moireRole: 'A',
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};

function run(params = BASE) {
  const inst = new Moire();
  const ctx = new RecordingContext({ seed: SEED });
  inst.generateWithContext(ctx, SEED, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

describe('Moire (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Moire()).toBeInstanceOf(Pattern);
  });

  it('instantiates and renders headlessly with non-empty output', () => {
    const { inst } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
  });

  it('is deterministic across runs with the same params', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('each fieldType produces output', () => {
    for (const fieldType of ['parallelLines', 'concentricRings', 'radialLines']) {
      const { inst } = run({ ...BASE, fieldType });
      expect(inst.svgElements.length).toBeGreaterThan(0);
    }
  });

  it('parallelLines emits <line> primitives and draws via ctx.line', () => {
    const { inst, ctx } = run({ ...BASE, fieldType: 'parallelLines' });
    expect(inst.svgElements.every((el) => el.startsWith('<line'))).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'line')).toBe(true);
  });

  it('radialLines emits <line> primitives', () => {
    const { inst } = run({ ...BASE, fieldType: 'radialLines' });
    expect(inst.svgElements.every((el) => el.startsWith('<line'))).toBe(true);
  });

  it('concentricRings emits <circle> outlines via ctx.ellipse', () => {
    const { inst, ctx } = run({ ...BASE, fieldType: 'concentricRings' });
    expect(inst.svgElements.every((el) => el.startsWith('<circle'))).toBe(true);
    expect(inst.svgElements.every((el) => el.includes('fill="none"'))).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'ellipse')).toBe(true);
  });

  it('emits the requested number of features per fieldType', () => {
    expect(run({ ...BASE, fieldType: 'parallelLines', density: 40 }).inst.svgElements.length).toBe(40);
    expect(run({ ...BASE, fieldType: 'radialLines', density: 36 }).inst.svgElements.length).toBe(36);
    expect(run({ ...BASE, fieldType: 'concentricRings', density: 25 }).inst.svgElements.length).toBe(25);
  });

  // --- the core moiré contract: role B transforms the field, role A does not ---
  it('role B output differs from role A for the same field params (rotation)', () => {
    const a = run({ ...BASE, moireRole: 'A' }).inst.svgElements;
    const b = run({ ...BASE, moireRole: 'B', moireRotation: 5 }).inst.svgElements;
    expect(b).not.toEqual(a);
  });

  it('role B differs from A via scale, rotation, and offset independently', () => {
    const a = run({ ...BASE, moireRole: 'A' }).inst.svgElements;
    // scale only
    expect(run({ ...BASE, moireRole: 'B', moireRotation: 0, moireScale: 1.1 }).inst.svgElements).not.toEqual(a);
    // rotation only
    expect(run({ ...BASE, moireRole: 'B', moireRotation: 7, moireScale: 1 }).inst.svgElements).not.toEqual(a);
    // offset only
    expect(run({ ...BASE, moireRole: 'B', moireRotation: 0, moireScale: 1, moireOffsetX: 30 }).inst.svgElements).not.toEqual(a);
  });

  it('role A ignores the moire transform params (identity field)', () => {
    // Role A must be identical regardless of moireRotation/Scale/Offset — they
    // only apply to role B.
    const plain = run({ ...BASE, moireRole: 'A', moireRotation: 0, moireScale: 1, moireOffsetX: 0 }).inst.svgElements;
    const withParams = run({ ...BASE, moireRole: 'A', moireRotation: 33, moireScale: 1.5, moireOffsetX: 99 }).inst.svgElements;
    expect(withParams).toEqual(plain);
  });

  it('role B with identity transform equals role A (no-op transform)', () => {
    const a = run({ ...BASE, moireRole: 'A' }).inst.svgElements;
    const bIdentity = run({ ...BASE, moireRole: 'B', moireRotation: 0, moireScale: 1, moireOffsetX: 0, moireOffsetY: 0 }).inst.svgElements;
    expect(bIdentity).toEqual(a);
  });

  it('pins the wrapped SVG group output', () => {
    const { inst } = run();
    expect(inst.toSVGGroup('L1', COLOR, OPACITY)).toMatchSnapshot();
  });
});
