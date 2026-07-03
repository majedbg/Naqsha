import { describe, it, expect } from 'vitest';
import {
  generate,
  fit,
  starVertices,
  candidateFolds,
  SUPPORTED_FOLDS,
  KAPLAN_STAR_DEFAULTS,
  kaplanStarFamily,
} from './kaplanStar';

const cell = { width: 100, height: 100 };
const squareLat = { cell, type: 'square', t1: [100, 0], t2: [0, 100], confidence: 0.9 };
const hexLat = { cell, type: 'hex', t1: [100, 0], t2: [50, 86.6], confidence: 0.9 };

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('kaplanStar geometry (ground truth)', () => {
  it('produces 2n vertices — n outer tips + n inner notches — for a classic 8-fold khatam', () => {
    const { outer, inner } = starVertices(8, 45, 50, 50, 45);
    expect(outer).toHaveLength(8);
    expect(inner).toHaveLength(8);
    // Outer tips at the tip radius, inner notches strictly inside.
    for (const p of outer) expect(dist(p, [50, 50])).toBeCloseTo(45, 5);
    const rInner = dist(inner[0], [50, 50]);
    expect(rInner).toBeGreaterThan(0);
    expect(rInner).toBeLessThan(45);
    for (const p of inner) expect(dist(p, [50, 50])).toBeCloseTo(rInner, 4);
  });

  it('has n-fold rotational symmetry: rotating tips by 2π/n maps the set onto itself', () => {
    const n = 8;
    const { outer } = starVertices(n, 45, 0, 0, 45, 0);
    const rot = ([x, y]) => {
      const a = (2 * Math.PI) / n;
      return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    };
    for (const p of outer) {
      const rp = rot(p);
      const matched = outer.some((q) => dist(q, rp) < 1e-6);
      expect(matched).toBe(true);
    }
  });

  it('contact angle is monotonic: a larger angle is a sharper star (smaller inner radius)', () => {
    const rAt = (deg) => dist(starVertices(8, deg, 0, 0, 45).inner[0], [0, 0]);
    const r30 = rAt(30);
    const r50 = rAt(50);
    const r70 = rAt(70);
    expect(r50).toBeLessThan(r30);
    expect(r70).toBeLessThan(r50);
  });

  it('generate() emits a single closed centerline stroke tagged score (locked decision 9)', () => {
    const geo = generate({ n: 8, contactAngle: 45, scale: 0.9 }, { lattice: squareLat });
    expect(geo.fills).toHaveLength(0);
    expect(geo.strokes).toHaveLength(1);
    expect(geo.strokes[0].role).toBe('score');
    expect(geo.strokes[0].d).toMatch(/^M/);
    expect(geo.strokes[0].d.trimEnd()).toMatch(/Z$/);
    expect(geo.width).toBe(100);
    expect(geo.height).toBe(100);
  });

  it('generate() sizes to the detected cell (repeats at the lattice)', () => {
    const geo = generate({ n: 6, contactAngle: 50 }, { lattice: { cell: { width: 80, height: 120 } } });
    expect(geo.width).toBe(80);
    expect(geo.height).toBe(120);
  });

  it('clamps degenerate params rather than throwing (n out of range, extreme angle)', () => {
    expect(() => generate({ n: 99, contactAngle: 999 }, { lattice: squareLat })).not.toThrow();
    const geo = generate({ n: 1, contactAngle: -5 }, { lattice: squareLat });
    expect(geo.strokes).toHaveLength(1);
  });
});

describe('candidateFolds gating (not brute force)', () => {
  it('square lattice offers 4/8/12; hex offers 3/6/12', () => {
    expect(candidateFolds({ lattice: squareLat })).toEqual([4, 8, 12]);
    expect(candidateFolds({ lattice: hexLat })).toEqual([3, 6, 12]);
  });

  it('a confident rotational group narrows to its order multiples', () => {
    // p6m (6-fold) on hex → only folds divisible by 6.
    const sym = { group: 'p6m', confidence: 0.9, source: 'auto' };
    expect(candidateFolds({ lattice: hexLat, symmetry: sym })).toEqual([6, 12]);
  });

  it('a SOFT (hiddenRotation) group does NOT narrow — falls back to lattice folds', () => {
    const soft = { group: 'p4m', confidence: 0.5, source: 'auto', hiddenRotation: true };
    expect(candidateFolds({ lattice: squareLat, symmetry: soft })).toEqual([4, 8, 12]);
  });
});

describe('kaplanStar.fit (recovers a constructed star)', () => {
  it('recovers the fold of a constructed 8-fold star with high self-IoU', () => {
    const star = generate({ n: 8, contactAngle: 45, scale: 0.9 }, { lattice: squareLat });
    const best = fit(star, { lattice: squareLat, symmetry: null });
    expect(best.params.n).toBe(8);
    expect(best.score).toBeGreaterThan(0.85);
  });

  it('recovers a 6-fold star on a hex lattice', () => {
    const star = generate({ n: 6, contactAngle: 50, scale: 0.9 }, { lattice: hexLat });
    const best = fit(star, { lattice: hexLat, symmetry: null });
    expect(best.params.n).toBe(6);
    expect(best.score).toBeGreaterThan(0.85);
  });

  it('the family object exposes the FitFamily interface', () => {
    expect(kaplanStarFamily.id).toBe('kaplan-star');
    expect(typeof kaplanStarFamily.generate).toBe('function');
    expect(typeof kaplanStarFamily.fit).toBe('function');
    expect(Array.isArray(kaplanStarFamily.paramDefs)).toBe(true);
    expect(kaplanStarFamily.paramDefs.map((d) => d.key)).toContain('contactAngle');
    expect(SUPPORTED_FOLDS).toContain(KAPLAN_STAR_DEFAULTS.n);
  });
});
