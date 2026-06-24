import { describe, it, expect } from 'vitest';
import { makeSimplex } from './simplexNoise.js';

// makeSimplex(seed) → a pure, seeded 2D simplex noise function (x,y)=>number in
// ~[-1,1]. The seed deterministically permutes the gradient/permutation table.
// All assertions sample at FRACTIONAL coordinates: gradient noise is degenerate
// on the integer lattice (returns ~0), so an integer-only grid would be a poor
// characterization of the field.

describe('makeSimplex', () => {
  it('is deterministic for a fixed seed', () => {
    const a = makeSimplex(42);
    const b = makeSimplex(42);
    for (let i = 0; i < 50; i++) {
      const x = i * 0.37 + 0.1;
      const y = i * 0.21 - 0.3;
      expect(a(x, y)).toBe(b(x, y));
    }
  });

  it('produces different output for different seeds', () => {
    const a = makeSimplex(1);
    const b = makeSimplex(2);
    let anyDiff = false;
    for (let i = 0; i < 50; i++) {
      const x = i * 0.37 + 0.1;
      const y = i * 0.21 - 0.3;
      if (a(x, y) !== b(x, y)) { anyDiff = true; break; }
    }
    expect(anyDiff).toBe(true);
  });

  it('stays roughly bounded within [-1.1, 1.1]', () => {
    const n = makeSimplex(7);
    let mn = Infinity;
    let mx = -Infinity;
    for (let j = 0; j < 60; j++) {
      for (let i = 0; i < 60; i++) {
        const v = n(i * 0.31 + 0.05, j * 0.29 - 0.05);
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    expect(mn).toBeGreaterThanOrEqual(-1.1);
    expect(mx).toBeLessThanOrEqual(1.1);
  });

  it('is spatially smooth (closely-spaced samples are close in value)', () => {
    const n = makeSimplex(13);
    const eps = 1e-3;
    for (let i = 0; i < 50; i++) {
      const x = i * 0.41 + 0.2;
      const y = i * 0.17 - 0.1;
      const v0 = n(x, y);
      const vx = n(x + eps, y);
      const vy = n(x, y + eps);
      expect(Math.abs(vx - v0)).toBeLessThan(0.05);
      expect(Math.abs(vy - v0)).toBeLessThan(0.05);
    }
  });

  it('has mean ≈ 0 over a coarse grid', () => {
    const n = makeSimplex(99);
    let sum = 0;
    let count = 0;
    for (let j = 0; j < 40; j++) {
      for (let i = 0; i < 40; i++) {
        sum += n(i * 0.53 + 0.13, j * 0.47 - 0.07);
        count += 1;
      }
    }
    expect(Math.abs(sum / count)).toBeLessThan(0.1);
  });
});
