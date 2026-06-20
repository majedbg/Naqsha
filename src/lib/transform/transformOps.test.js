import { describe, it, expect } from 'vitest';
import { applyTransform, inversePoint, transformToSVG, transformBBox } from './transformOps.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

describe('transformOps round-trip', () => {
  it('inversePoint undoes applyTransform about the same pivot (origin pivot)', () => {
    const t = { x: 12, y: -5, rotation: 37, scale: 1.5 };
    const p = { x: 3, y: 8 };
    const fwd = applyTransform(p, t);
    const back = inversePoint(fwd, t, { x: 0, y: 0 });
    expect(close(back.x, p.x)).toBe(true);
    expect(close(back.y, p.y)).toBe(true);
  });
});

describe('transformToSVG', () => {
  it('returns empty string for the identity transform', () => {
    expect(transformToSVG({ x: 0, y: 0, rotation: 0, scale: 1 })).toBe('');
    expect(transformToSVG({})).toBe('');
    expect(transformToSVG(undefined)).toBe('');
  });

  it('emits translate rotate scale for a non-identity transform', () => {
    expect(transformToSVG({ x: 10, y: 20, rotation: 30, scale: 2 })).toBe(
      'translate(10 20) rotate(30) scale(2)'
    );
  });

  it('omits components that are at their identity value', () => {
    expect(transformToSVG({ x: 5, y: 0, rotation: 0, scale: 1 })).toBe('translate(5 0)');
    expect(transformToSVG({ x: 0, y: 0, rotation: 45, scale: 1 })).toBe('rotate(45)');
    expect(transformToSVG({ x: 0, y: 0, rotation: 0, scale: 0.5 })).toBe('scale(0.5)');
  });

  it('ignores pivot for the identity transform (still empty)', () => {
    expect(transformToSVG({ x: 0, y: 0, rotation: 0, scale: 1 }, { x: 50, y: 50 })).toBe('');
  });

  it('ignores pivot for a pure-translate transform', () => {
    expect(transformToSVG({ x: 5, y: 7, rotation: 0, scale: 1 }, { x: 50, y: 50 })).toBe(
      'translate(5 7)'
    );
  });

  it('emits the center-pivot form for rotation with a pivot', () => {
    expect(transformToSVG({ x: 0, y: 0, rotation: 30, scale: 1 }, { x: 50, y: 60 })).toBe(
      'translate(50 60) rotate(30) translate(-50 -60)'
    );
  });

  it('emits the center-pivot form for scale with a pivot (and translate)', () => {
    expect(transformToSVG({ x: 10, y: 20, rotation: 0, scale: 2 }, { x: 50, y: 60 })).toBe(
      'translate(10 20) translate(50 60) scale(2) translate(-50 -60)'
    );
  });

  it('emits the full center-pivot form for rotation+scale+translate with a pivot', () => {
    expect(transformToSVG({ x: 10, y: 20, rotation: 30, scale: 2 }, { x: 50, y: 60 })).toBe(
      'translate(10 20) translate(50 60) rotate(30) scale(2) translate(-50 -60)'
    );
  });

  it('agrees with applyTransform: the SVG matrix and applyTransform map points identically', () => {
    // SVG `translate(x,y) rotate(r) scale(s)` applies scale first, then rotate,
    // then translate (right-to-left). applyTransform must produce the same point.
    const t = { x: 7, y: -3, rotation: 50, scale: 1.3 };
    const p = { x: 4, y: 9 };
    const rad = (50 * Math.PI) / 180;
    const sx = p.x * 1.3;
    const sy = p.y * 1.3;
    const rx = sx * Math.cos(rad) - sy * Math.sin(rad) + 7;
    const ry = sx * Math.sin(rad) + sy * Math.cos(rad) - 3;
    const out = applyTransform(p, t);
    expect(close(out.x, rx)).toBe(true);
    expect(close(out.y, ry)).toBe(true);
  });
});

describe('transformBBox (rotation about bbox center)', () => {
  const square = { x: 0, y: 0, w: 10, h: 10 }; // center (5,5)

  it('returns the identity bbox unchanged', () => {
    expect(transformBBox(square, { x: 0, y: 0, rotation: 0, scale: 1 })).toEqual(square);
  });

  it('rotates 90deg about the bbox center, yielding the same AABB for a square', () => {
    const out = transformBBox(square, { x: 0, y: 0, rotation: 90, scale: 1 });
    expect(close(out.x, 0)).toBe(true);
    expect(close(out.y, 0)).toBe(true);
    expect(close(out.w, 10)).toBe(true);
    expect(close(out.h, 10)).toBe(true);
  });

  it('45deg rotation about center grows the AABB to the diagonal extent', () => {
    const out = transformBBox(square, { x: 0, y: 0, rotation: 45, scale: 1 });
    const diag = 10 * Math.SQRT2; // ~14.14
    expect(close(out.w, diag, 1e-3)).toBe(true);
    expect(close(out.h, diag, 1e-3)).toBe(true);
    // still centered on (5,5)
    expect(close(out.x + out.w / 2, 5, 1e-3)).toBe(true);
    expect(close(out.y + out.h / 2, 5, 1e-3)).toBe(true);
  });

  it('translates the bbox by {x,y}', () => {
    const out = transformBBox(square, { x: 100, y: -20, rotation: 0, scale: 1 });
    expect(out).toEqual({ x: 100, y: -20, w: 10, h: 10 });
  });

  it('round-trips: a corner mapped forward about center, then inverse, returns', () => {
    const t = { x: 3, y: 4, rotation: 25, scale: 1.4 };
    const center = { x: 5, y: 5 };
    const corner = { x: 0, y: 0 };
    // forward about center is what transformBBox uses internally; reuse inverse
    const rad = (25 * Math.PI) / 180;
    const dx = (corner.x - center.x) * 1.4;
    const dy = (corner.y - center.y) * 1.4;
    const fx = dx * Math.cos(rad) - dy * Math.sin(rad) + center.x + 3;
    const fy = dx * Math.sin(rad) + dy * Math.cos(rad) + center.y + 4;
    const back = inversePoint({ x: fx, y: fy }, t, center);
    expect(close(back.x, corner.x)).toBe(true);
    expect(close(back.y, corner.y)).toBe(true);
  });
});
