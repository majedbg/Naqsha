// glyphBounds — the true drawn extent of a glyph, and the viewBox that frames
// it. The bug this guards: preview surfaces derived their viewport from
// `viewRadius` about the local ORIGIN, which blanked/clipped every SVG import
// (art lives in the source document's user space, not around (0,0)).
import { describe, it, expect } from 'vitest';
import { glyphBBox, glyphViewBox } from './glyphBounds.js';
import { MOTIF_GLYPHS } from './glyphs.js';
import { VECTOR_MOTIF_GLYPHS } from './vectorMotifsGlyphs.js';

const box = (d) => glyphBBox({ paths: [{ d }] });

describe('glyphBBox — measured extent', () => {
  it('measures a simple axis-aligned polygon exactly', () => {
    const b = box('M0,0 L10,0 L10,4 L0,4 Z');
    expect(b).toMatchObject({ minX: 0, minY: 0, maxX: 10, maxY: 4, width: 10, height: 4 });
    expect(b.cx).toBe(5);
    expect(b.cy).toBe(2);
  });

  it('spans EVERY path, not just paths[0]', () => {
    const b = glyphBBox({
      paths: [{ d: 'M0,0 L2,0 L2,2 Z' }, { d: 'M50,50 L60,50 L60,60 Z' }],
    });
    expect(b.maxX).toBe(60);
    expect(b.maxY).toBe(60);
  });

  it('follows a curve rather than its control-point hull', () => {
    // A cubic whose controls fly to y=100 but whose swept curve peaks at 75.
    const b = box('M0,0 C0,100 100,100 100,0');
    expect(b.maxY).toBeGreaterThan(70);
    expect(b.maxY).toBeLessThan(80);
  });

  it('returns null for missing / empty / unparseable geometry', () => {
    expect(glyphBBox(null)).toBeNull();
    expect(glyphBBox({ paths: [] })).toBeNull();
    expect(glyphBBox({ paths: [{ d: '' }] })).toBeNull();
  });

  it('is cached per glyph object identity', () => {
    const g = { paths: [{ d: 'M0,0 L1,1' }] };
    expect(glyphBBox(g)).toBe(glyphBBox(g)); // same object, not just equal
  });
});

describe('glyphViewBox — the frame actually drawn', () => {
  it('contains the whole glyph, with headroom clearing half the stroke', () => {
    const g = { paths: [{ d: 'M0,0 L10,0 L10,4 L0,4 Z' }] };
    const b = glyphBBox(g);
    const v = glyphViewBox(g);
    expect(v.x).toBeLessThanOrEqual(b.minX - v.strokeWidth / 2);
    expect(v.y).toBeLessThanOrEqual(b.minY - v.strokeWidth / 2);
    expect(v.x + v.w).toBeGreaterThanOrEqual(b.maxX + v.strokeWidth / 2);
    expect(v.y + v.h).toBeGreaterThanOrEqual(b.maxY + v.strokeWidth / 2);
  });

  it('centres the frame on the art, wherever the art sits', () => {
    const g = { paths: [{ d: 'M100,200 L120,200 L120,240 L100,240 Z' }] };
    const v = glyphViewBox(g);
    expect(v.x + v.w / 2).toBeCloseTo(110, 6); // bbox cx
    expect(v.y + v.h / 2).toBeCloseTo(220, 6); // bbox cy
  });

  it('keeps stroke weight proportional to the long side (1/18 of it)', () => {
    // stroke = long/18 and pad = stroke on each side, so the PADDED long side
    // is long*20/18 and the stroke is exactly 1/20 of it.
    const wide = glyphViewBox({ paths: [{ d: 'M0,0 L90,0 L90,10 Z' }] });
    expect(wide.strokeWidth).toBeCloseTo(90 / 18, 6);
    expect(wide.strokeWidth).toBeCloseTo(Math.max(wide.w, wide.h) / 20, 6);
    // A bigger glyph gets a proportionally bigger stroke, so apparent weight
    // is constant once `meet` scales both to the same pixel size.
    const small = glyphViewBox({ paths: [{ d: 'M0,0 L9,0 L9,1 Z' }] });
    expect(wide.strokeWidth / small.strokeWidth).toBeCloseTo(10, 1);
  });

  it('survives a degenerate axis without collapsing or dividing by zero', () => {
    const flat = glyphViewBox({ paths: [{ d: 'M0,0 L20,0' }], viewRadius: 10 });
    expect(flat.w).toBeGreaterThan(0);
    expect(flat.h).toBeGreaterThan(0);
    expect(Number.isFinite(flat.strokeWidth)).toBe(true);
  });

  it('falls back to the origin-centered viewRadius box when there is no geometry', () => {
    const v = glyphViewBox({ paths: [], viewRadius: 10 });
    expect(v).toEqual({ x: -12, y: -12, w: 24, h: 24, strokeWidth: 12 / 9 });
  });
});

describe('the regression itself — every shipped glyph is framed', () => {
  const all = { ...MOTIF_GLYPHS, ...VECTOR_MOTIF_GLYPHS };

  it.each(Object.keys(all))('%s is fully inside its viewBox', (id) => {
    const g = all[id];
    const b = glyphBBox(g);
    const v = glyphViewBox(g);
    expect(b).not.toBeNull();
    expect(b.minX).toBeGreaterThanOrEqual(v.x);
    expect(b.minY).toBeGreaterThanOrEqual(v.y);
    expect(b.maxX).toBeLessThanOrEqual(v.x + v.w);
    expect(b.maxY).toBeLessThanOrEqual(v.y + v.h);
  });

  it('the imported built-ins are NOT origin-centered — the reason this exists', () => {
    // Pins the false invariant that caused the bug. If a future normalization
    // pass recentres them, this test should be deleted deliberately, not
    // silently loosened.
    const offOrigin = Object.values(VECTOR_MOTIF_GLYPHS).filter((g) => {
      const b = glyphBBox(g);
      return Math.hypot(b.cx, b.cy) > 5;
    });
    expect(offOrigin).toHaveLength(Object.keys(VECTOR_MOTIF_GLYPHS).length);
  });

  it('the old origin-centered box really did clip them (guards the fix direction)', () => {
    const clipped = Object.values(VECTOR_MOTIF_GLYPHS).filter((g) => {
      const b = glyphBBox(g);
      const oldHalf = g.viewRadius * 1.2; // the pre-fix viewBox half-extent
      const maxFromOrigin = Math.max(
        Math.hypot(b.minX, b.minY),
        Math.hypot(b.maxX, b.maxY),
        Math.hypot(b.minX, b.maxY),
        Math.hypot(b.maxX, b.minY)
      );
      return maxFromOrigin > oldHalf;
    });
    expect(clipped.length).toBeGreaterThan(50);
  });
});
