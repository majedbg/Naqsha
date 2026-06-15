import { describe, it, expect } from 'vitest';
import CirclePacking from '../CirclePacking.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of CirclePacking. Under RecordingContext, ctx.random
// is a deterministic mulberry32 stream, so the packed circle set is reproducible.
// This locks the LOGIC (determinism, in-boundary + non-overlap construction,
// monotone density, render-mode element types, valid SVG) — not p5 bytes.
const SEED = 7;
const W = 800;
const H = 600;
const PARAMS = {
  boundary: 'rectangle',
  render: 'outlines',
  minRadius: 4,
  maxRadius: 60,
  attempts: 2000,
  linkDistance: 40,
  ringCount: 3,
  strokeWeight: 0.6,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#224488';
const OPACITY = 80;

function run(params = PARAMS, seed = SEED) {
  const inst = new CirclePacking();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, COLOR, OPACITY);
  return { inst, ctx };
}

// Parse <circle> elements (origin-centered) into {x,y,r}.
function circlesOf(svgElements) {
  const out = [];
  for (const el of svgElements) {
    const m = el.match(/^<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/);
    if (m) out.push({ x: +m[1], y: +m[2], r: +m[3] });
  }
  return out;
}

function count(svgElements, tag) {
  return svgElements.filter((el) => el.startsWith(`<${tag}`)).length;
}

describe('CirclePacking (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new CirclePacking()).toBeInstanceOf(Pattern);
  });

  it('emits circles and draws via ellipse', () => {
    const { inst, ctx } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(count(inst.svgElements, 'circle')).toBeGreaterThan(0);
    expect(ctx.calls.some((c) => c.op === 'ellipse')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'noFill')).toBe(true);
  });

  it('produces valid SVG strings', () => {
    const { inst } = run();
    for (const el of inst.svgElements) {
      expect(el).toMatch(
        /^<(circle cx="[-\d.]+" cy="[-\d.]+" r="[-\d.]+" stroke=".*" stroke-width=".*" fill="none"|line x1="[-\d.]+" y1="[-\d.]+" x2="[-\d.]+" y2="[-\d.]+" stroke=".*" stroke-width=".*")\/>$/
      );
    }
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('different seeds change the output', () => {
    expect(run(PARAMS, 7).inst.svgElements).not.toEqual(run(PARAMS, 99).inst.svgElements);
  });

  it('more attempts yields more (or equal) circles — monotone density', () => {
    const few = circlesOf(run({ ...PARAMS, attempts: 500 }).inst.svgElements).length;
    const many = circlesOf(run({ ...PARAMS, attempts: 4000 }).inst.svgElements).length;
    expect(many).toBeGreaterThan(few);
  });

  it('keeps all circles inside a CIRCLE boundary disc', () => {
    const discR = Math.min(W, H) / 2;
    const circles = circlesOf(run({ ...PARAMS, boundary: 'circle' }).inst.svgElements);
    expect(circles.length).toBeGreaterThan(0);
    // SVG cx/cy/r are each rounded to 2dp; the compounded error can reach ~0.03.
    const TOL = 0.05;
    for (const c of circles) {
      expect(Math.hypot(c.x, c.y) + c.r).toBeLessThanOrEqual(discR + TOL);
    }
  });

  it('keeps all circles inside a RECTANGLE boundary', () => {
    const halfW = W / 2;
    const halfH = H / 2;
    const circles = circlesOf(run({ ...PARAMS, boundary: 'rectangle' }).inst.svgElements);
    const TOL = 0.05;
    for (const c of circles) {
      expect(Math.abs(c.x) + c.r).toBeLessThanOrEqual(halfW + TOL);
      expect(Math.abs(c.y) + c.r).toBeLessThanOrEqual(halfH + TOL);
    }
  });

  it('no two packed circles overlap (outlines mode)', () => {
    const circles = circlesOf(run(PARAMS).inst.svgElements);
    expect(circles.length).toBeGreaterThan(1);
    // Circles are constructed to be at worst tangent; the SVG coords (cx,cy,r)
    // are each rounded to 2dp, so a tangent pair can read up to ~0.03 short of
    // touching. A real overlap would be many units deep, so this tolerance still
    // catches it while accommodating the rounding.
    const TOL = 0.05;
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i];
        const b = circles[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        expect(dist + TOL).toBeGreaterThanOrEqual(a.r + b.r);
      }
    }
  });

  it('respects minRadius / maxRadius bounds (outlines mode)', () => {
    const circles = circlesOf(run({ ...PARAMS, minRadius: 6, maxRadius: 30 }).inst.svgElements);
    const TOL = 1e-6;
    for (const c of circles) {
      expect(c.r).toBeGreaterThanOrEqual(6 - TOL);
      expect(c.r).toBeLessThanOrEqual(30 + TOL);
    }
  });

  it('packs the IDENTICAL circle set across render modes (mode only changes emit)', () => {
    const base = circlesOf(run({ ...PARAMS, render: 'outlines' }).inst.svgElements);
    const linksCircles = circlesOf(run({ ...PARAMS, render: 'links' }).inst.svgElements);
    // Links mode emits the same outline circles plus connector lines.
    expect(linksCircles).toEqual(base);
  });

  it('links mode adds <line> connectors at the default link distance', () => {
    const out = run({ ...PARAMS, render: 'outlines' }).inst.svgElements;
    const links = run({ ...PARAMS, render: 'links' }).inst.svgElements;
    expect(count(out, 'line')).toBe(0);
    expect(count(links, 'line')).toBeGreaterThan(0);
  });

  it('nested mode emits more circles than outlines (concentric rings)', () => {
    const out = count(run({ ...PARAMS, render: 'outlines' }).inst.svgElements, 'circle');
    const nested = count(run({ ...PARAMS, render: 'nested', ringCount: 4 }).inst.svgElements, 'circle');
    expect(nested).toBeGreaterThan(out);
  });

  it('the wrapped SVG group uses symmetry=1 (no symmetry param)', () => {
    const { inst } = run();
    const svg = inst.toSVGGroup('L1', COLOR, OPACITY);
    expect(svg).toContain('<g id="layer-L1"');
    const groups = (svg.match(/<g transform="translate/g) || []).length;
    expect(groups).toBe(1);
  });
});
