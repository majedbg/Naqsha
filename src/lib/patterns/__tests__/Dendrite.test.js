import { describe, it, expect } from 'vitest';
import Dendrite from '../Dendrite.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of Dendrite (DLA branch skeleton). Under
// RecordingContext, ctx.random() is a deterministic mulberry32 stream, so the
// whole aggregation is reproducible. This locks the LOGIC (determinism,
// seedMode → output, maxNodes → bond count, valid line SVG, real symmetry
// wiring, speed), not production p5 bytes. Counts are kept modest for speed.
const SEED = 7;
const BASE = {
  seedMode: 'center',
  render: 'bonds',
  maxNodes: 400,
  stickiness: 0.8,
  nodeSpacing: 6,
  strokeWeight: 0.7,
  symmetry: 1,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#224488';
const OPACITY = 80;
const W = 800;
const H = 600;

function run(params = BASE, seed = SEED) {
  const inst = new Dendrite();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

const countLines = (els) => els.filter((e) => e.startsWith('<line')).length;

describe('Dendrite (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new Dendrite()).toBeInstanceOf(Pattern);
  });

  it('emits <line> bonds and draws via ctx.line', () => {
    const { inst, ctx } = run();
    expect(countLines(inst.svgElements)).toBeGreaterThan(10);
    expect(ctx.calls.some((c) => c.op === 'line')).toBe(true);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('different seeds change the output', () => {
    expect(run(BASE, 7).inst.svgElements).not.toEqual(run(BASE, 99).inst.svgElements);
  });

  it('larger maxNodes yields more bonds', () => {
    const few = countLines(run({ ...BASE, maxNodes: 300 }).inst.svgElements);
    const many = countLines(run({ ...BASE, maxNodes: 900 }).inst.svgElements);
    expect(many).toBeGreaterThan(few);
  });

  it('each seedMode produces output', () => {
    for (const seedMode of ['center', 'ground', 'ring']) {
      const els = run({ ...BASE, seedMode }).inst.svgElements;
      expect(countLines(els)).toBeGreaterThan(10);
    }
  });

  it('nodesBonds render adds circles on top of the bonds', () => {
    const bonds = run({ ...BASE, render: 'bonds' }).inst.svgElements;
    const both = run({ ...BASE, render: 'nodesBonds' }).inst.svgElements;
    expect(both.some((e) => e.startsWith('<circle'))).toBe(true);
    expect(bonds.some((e) => e.startsWith('<circle'))).toBe(false);
    expect(both.length).toBeGreaterThan(bonds.length);
  });

  it('emits valid line SVG (parseable coords)', () => {
    const el = run().inst.svgElements.find((e) => e.startsWith('<line'));
    expect(el).toMatch(/^<line x1="-?[\d.]+" y1="-?[\d.]+" x2="-?[\d.]+" y2="-?[\d.]+" stroke=".*" stroke-width=".*" stroke-linecap="round"\/>$/);
  });

  it('the wrapped SVG group honors the real symmetry param', () => {
    const single = run({ ...BASE, symmetry: 1 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    const hex = run({ ...BASE, symmetry: 6 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    const singleGroups = (single.match(/<g transform="translate/g) || []).length;
    const hexGroups = (hex.match(/<g transform="translate/g) || []).length;
    expect(singleGroups).toBe(1);
    expect(hexGroups).toBe(6);
    expect(hex).toContain('rotate(60)');
  });

  it('symmetry=4 yields four rotated SVG groups', () => {
    const quad = run({ ...BASE, symmetry: 4 }).inst.toSVGGroup('L1', COLOR, OPACITY);
    expect((quad.match(/<g transform="translate/g) || []).length).toBe(4);
    expect(quad).toContain('rotate(90)');
  });

  it('finishes a large budget without hanging', () => {
    const t0 = Date.now();
    const { inst } = run({ ...BASE, maxNodes: 2000 });
    const ms = Date.now() - t0;
    expect(countLines(inst.svgElements)).toBeGreaterThan(500);
    expect(ms).toBeLessThan(5000); // generous ceiling; real default is far faster
  });
});
