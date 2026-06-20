import { describe, it, expect } from 'vitest';
import { pathsBBox, centerTransform, parseForPlacement, ghostSvg } from './placement.js';

describe('pathsBBox', () => {
  it('unions the drawn anchor points of every path', () => {
    const bb = pathsBBox(['M 10 20 L 30 20 L 30 50 Z', 'M 0 0 L 5 5']);
    expect(bb).toEqual({ x: 0, y: 0, w: 30, h: 50 });
  });

  it('returns null when there are no points', () => {
    expect(pathsBBox([])).toBeNull();
    expect(pathsBBox(['M Z'])).toBeNull();
  });
});

describe('centerTransform', () => {
  it('translates the bbox centre onto the target point', () => {
    const bbox = { x: 0, y: 0, w: 100, h: 100 }; // centre (50,50)
    const t = centerTransform(bbox, { x: 200, y: 120 });
    expect(t).toEqual({ x: 150, y: 70, rotation: 0, scale: 1 });
  });

  it('centring invariant: applying the translate lands the content centre on the point', () => {
    const bbox = { x: 8, y: -4, w: 40, h: 16 }; // centre (28, 4)
    const point = { x: 333, y: 77 };
    const t = centerTransform(bbox, point);
    // Additive canvas-space translate (svgExport semantics).
    const centre = { x: bbox.x + bbox.w / 2 + t.x, y: bbox.y + bbox.h / 2 + t.y };
    expect(centre).toEqual(point);
  });
});

describe('parseForPlacement', () => {
  it('returns paths + bbox for a real asset svg', () => {
    const svg =
      '<svg viewBox="0 0 100 100"><path d="M 0 0 L 100 0 L 100 100 L 0 100 Z"/></svg>';
    const r = parseForPlacement(svg);
    expect(r.ok).toBe(true);
    expect(r.paths.length).toBe(1);
    expect(r.bbox).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it('propagates parse failure', () => {
    expect(parseForPlacement('not an svg').ok).toBe(false);
  });
});

describe('ghostSvg', () => {
  it('emits a viewBox-sized svg with one polyline per path', () => {
    const bbox = { x: 0, y: 0, w: 100, h: 50 };
    const out = ghostSvg(['M 0 0 L 100 0 L 100 50 Z'], bbox);
    expect(out).toContain('viewBox="0 0 100 50"');
    expect(out).toContain('width="100"');
    expect(out).toContain('height="50"');
    expect(out).toContain('<path');
    expect(out).toContain('Z'); // closed path preserved
  });

  it('skips degenerate paths (fewer than 2 points)', () => {
    const out = ghostSvg(['M 5 5'], { x: 5, y: 5, w: 0, h: 0 });
    expect(out).not.toContain('<path');
  });
});
