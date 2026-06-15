import { describe, it, expect } from 'vitest';
import IslamicStar from '../IslamicStar.js';
import { RecordingContext, Pattern } from '../drawingContext.js';

// Headless characterization of IslamicStar (Girih). Under RecordingContext the
// RNG is a deterministic mulberry32 (used only for irregularity jitter), so the
// whole pattern is a pure function of its params for a fixed seed. These lock the
// LOGIC (determinism, each tiling emits output, interlaced > skeleton, valid
// SVG, symmetry hardcoded to 1) — not production p5 bytes. Visual correctness of
// the geometry is verified separately by IslamicStar.verify.test.js (the SVG
// artifacts in /tmp/girih-verify).
const SEED = 7;
const PARAMS = {
  tiling: 'square8',
  contactAngle: 60,
  density: 4,
  render: 'interlaced',
  bandWidth: 4,
  irregularity: 0,
  strokeWeight: 0.8,
  startAngle: 0,
  offsetX: 0,
  offsetY: 0,
};
const COLOR = '#224488';
const OPACITY = 80;

function run(params = PARAMS, seed = SEED) {
  const inst = new IslamicStar();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, 800, 800, COLOR, OPACITY);
  return { inst, ctx };
}

describe('IslamicStar / Girih (headless)', () => {
  it('extends the shared Pattern base', () => {
    expect(new IslamicStar()).toBeInstanceOf(Pattern);
  });

  it('emits stroke elements and issues draw calls via ctx', () => {
    const { inst, ctx } = run();
    expect(inst.svgElements.length).toBeGreaterThan(0);
    // interlaced renders polylines via beginShape/vertex/endShape
    expect(ctx.calls.some((c) => c.op === 'beginShape')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'vertex')).toBe(true);
    expect(ctx.calls.some((c) => c.op === 'endShape')).toBe(true);
  });

  it('is deterministic across runs with the same seed', () => {
    expect(run().inst.svgElements).toEqual(run().inst.svgElements);
  });

  it('irregularity makes the seed actually matter', () => {
    const p = { ...PARAMS, irregularity: 0.5 };
    expect(run(p, 7).inst.svgElements).not.toEqual(run(p, 99).inst.svgElements);
  });

  it('irregularity=0 is seed-independent (no RNG pulled)', () => {
    expect(run(PARAMS, 7).inst.svgElements).toEqual(run(PARAMS, 99).inst.svgElements);
  });

  it('each shipped tiling produces output', () => {
    for (const tiling of ['square8', 'hex12']) {
      const { inst } = run({ ...PARAMS, tiling });
      expect(inst.svgElements.length).toBeGreaterThan(20);
    }
  });

  it('square8 and hex12 produce different patterns', () => {
    const a = run({ ...PARAMS, tiling: 'square8' }).inst.svgElements;
    const b = run({ ...PARAMS, tiling: 'hex12' }).inst.svgElements;
    expect(a).not.toEqual(b);
  });

  it('skeleton emits <line>, interlaced emits <polyline>', () => {
    const sk = run({ ...PARAMS, render: 'skeleton' }).inst.svgElements;
    const il = run({ ...PARAMS, render: 'interlaced' }).inst.svgElements;
    expect(sk.every((el) => el.startsWith('<line'))).toBe(true);
    expect(il.every((el) => el.startsWith('<polyline'))).toBe(true);
  });

  it('interlaced produces more geometry than skeleton (two band edges per strand)', () => {
    // Skeleton emits one short <line> per de-duped edge; interlace emits longer
    // <polyline> runs (two offset band edges per strand, broken at unders). So
    // element COUNT can be lower for interlace (fewer, longer paths) while the
    // total VERTEX count — the real "more geometry" measure — is strictly higher.
    const coords = (els) => els.reduce((n, el) => {
      const ml = el.match(/points="([^"]*)"/);
      if (ml) return n + ml[1].trim().split(/\s+/).length;
      return n + 2; // a <line> contributes 2 endpoints
    }, 0);
    const sk = coords(run({ ...PARAMS, render: 'skeleton' }).inst.svgElements);
    const il = coords(run({ ...PARAMS, render: 'interlaced' }).inst.svgElements);
    expect(il).toBeGreaterThan(sk);
  });

  it('contact angle changes the geometry', () => {
    const lo = run({ ...PARAMS, contactAngle: 25 }).inst.svgElements;
    const hi = run({ ...PARAMS, contactAngle: 65 }).inst.svgElements;
    expect(lo).not.toEqual(hi);
  });

  it('more repeats yields more stroke elements', () => {
    const few = run({ ...PARAMS, density: 2 }).inst.svgElements.length;
    const many = run({ ...PARAMS, density: 8 }).inst.svgElements.length;
    expect(many).toBeGreaterThan(few);
  });

  it('produces valid SVG stroke strings', () => {
    const { inst } = run();
    for (const el of inst.svgElements) {
      expect(el).toMatch(/^<(line|polyline)[^>]*stroke="[^"]*"[^>]*\/>$/);
    }
  });

  it('the wrapped SVG group uses symmetry=1 (no symmetry param)', () => {
    const { inst } = run();
    const svg = inst.toSVGGroup('L1', COLOR, OPACITY);
    expect(svg).toContain('<g id="layer-L1"');
    const groups = (svg.match(/<g transform="translate/g) || []).length;
    expect(groups).toBe(1);
  });
});
