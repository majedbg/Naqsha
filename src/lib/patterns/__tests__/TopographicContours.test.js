import { describe, it, expect } from 'vitest';
import TopographicContours from '../TopographicContours.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of TopographicContours. Under RecordingContext,
// ctx.noise() returns a deterministic uniform stream (args ignored), so the
// scalar field is reproducible-but-spatially-incoherent — that's fine: this
// locks the LOGIC (determinism, marching-squares + stitch shape, valid SVG),
// not production p5 bytes. Because the whole field is sampled up front, the
// noise-call order is independent of `levels`, so a fixed seed/resolution gives
// a byte-identical field across different level counts.
const SEED = 7;
const PARAMS = {
  levels: 16,
  noiseScale: 2.5,
  octaves: 3,
  warp: 0,
  levelBias: 0,
  resolution: 80,
  strokeWeight: 0.6,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#224488';
const OPACITY = 80;

function run(params = PARAMS, seed = SEED) {
  const inst = new TopographicContours();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, 800, 600, COLOR, OPACITY);
  return { inst, ctx };
}

// Total vertex count across all emitted polylines (parsed from the SVG).
function totalVertices(svgElements) {
  let n = 0;
  for (const el of svgElements) {
    const m = el.match(/points="([^"]*)"/);
    if (!m) continue;
    n += m[1].trim().split(/\s+/).length;
  }
  return n;
}

describe('TopographicContours (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new TopographicContours()).toBeInstanceOf(Pattern);
  });

  it('emits polylines and draws via beginShape/vertex/endShape', () => {
    const { inst, ctx } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(ctx.calls.some((c) => c.op === 'beginShape')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'vertex')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'endShape')).toBe(true);
  });

  it('produces valid <polyline> SVG strings', () => {
    const { inst } = run();
    for (const el of inst.svgElements) {
      expect(el).toMatch(/^<polyline points="[^"]+" fill="none" stroke=".*" stroke-width=".*"\/>$/);
    }
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('different seeds change the output', () => {
    expect(run(PARAMS, 7).inst.svgElements).not.toEqual(run(PARAMS, 99).inst.svgElements);
  });

  it('more levels yields more polylines (more contour bands)', () => {
    const few = run({ ...PARAMS, levels: 4 }).inst.svgElements;
    const many = run({ ...PARAMS, levels: 40 }).inst.svgElements;
    expect(many.length).toBeGreaterThan(few.length);
  });

  it('changing levels changes the polyline set', () => {
    expect(run({ ...PARAMS, levels: 8 }).inst.svgElements)
      .not.toEqual(run({ ...PARAMS, levels: 16 }).inst.svgElements);
  });

  it('higher resolution yields more/denser vertices', () => {
    const lo = totalVertices(run({ ...PARAMS, resolution: 60 }).inst.svgElements);
    const hi = totalVertices(run({ ...PARAMS, resolution: 200 }).inst.svgElements);
    expect(hi).toBeGreaterThan(lo);
  });

  it('the wrapped SVG group uses symmetry=1 (no symmetry param)', () => {
    const { inst } = run();
    const svg = inst.toSVGGroup('L1', COLOR, OPACITY);
    // symmetry=1 → a single translate group, no rotated copies.
    expect(svg).toContain('<g id="layer-L1"');
    expect(svg).toContain('<polyline');
    const groups = (svg.match(/<g transform="translate/g) || []).length;
    expect(groups).toBe(1);
  });

  it('levelBias changes contour placement', () => {
    const base = run({ ...PARAMS, levelBias: 0 }).inst.svgElements;
    const biased = run({ ...PARAMS, levelBias: 0.8 }).inst.svgElements;
    expect(biased).not.toEqual(base);
  });

  it('domain warp changes the field', () => {
    const flat = run({ ...PARAMS, warp: 0 }).inst.svgElements;
    const warped = run({ ...PARAMS, warp: 0.6 }).inst.svgElements;
    expect(warped).not.toEqual(flat);
  });

  it('stitching keeps fragment count well below the raw segment count', () => {
    // Sanity: polylines should average more than ~3 vertices each, i.e. the
    // hash-join actually merged single-cell segments rather than emitting them
    // one-per-polyline. (A pure 2-pt-per-fragment output would average exactly 2.)
    const { inst } = run();
    const verts = totalVertices(inst.svgElements);
    const polys = inst.svgElements.length;
    expect(verts / polys).toBeGreaterThan(2.5);
  });
});
