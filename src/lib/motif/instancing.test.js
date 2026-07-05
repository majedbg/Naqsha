import { describe, it, expect } from 'vitest';
import { placementMatrix, applyMatrix, matrixToSVG } from './instancing.js';

const V = 5; // arbitrary viewRadius shared across cases

describe('placementMatrix + applyMatrix', () => {
  it('identity: no rotation/translation, radius === viewRadius', () => {
    const placement = { x: 0, y: 0, rotation: 0, radius: V, flip: false };
    const m = placementMatrix(placement, V);
    expect(applyMatrix({ x: 1, y: 0 }, m).x).toBeCloseTo(1, 9);
    expect(applyMatrix({ x: 1, y: 0 }, m).y).toBeCloseTo(0, 9);
    expect(applyMatrix({ x: 0, y: 1 }, m).x).toBeCloseTo(0, 9);
    expect(applyMatrix({ x: 0, y: 1 }, m).y).toBeCloseTo(1, 9);
  });

  it('translate: origin moves to placement.x/y, other points shift by the same delta', () => {
    const placement = { x: 10, y: 20, rotation: 0, radius: V, flip: false };
    const m = placementMatrix(placement, V);
    const origin = applyMatrix({ x: 0, y: 0 }, m);
    expect(origin.x).toBeCloseTo(10, 9);
    expect(origin.y).toBeCloseTo(20, 9);
    const p = applyMatrix({ x: 1, y: 0 }, m);
    expect(p.x).toBeCloseTo(11, 9);
    expect(p.y).toBeCloseTo(20, 9);
  });

  it('scale: radius = 2*viewRadius doubles distances from the placement origin', () => {
    const placement = { x: 0, y: 0, rotation: 0, radius: 2 * V, flip: false };
    const m = placementMatrix(placement, V);
    const p = applyMatrix({ x: 1, y: 0 }, m);
    expect(p.x).toBeCloseTo(2, 9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('rotate 90 degrees (CCW-positive, math convention) at the origin', () => {
    const placement = { x: 0, y: 0, rotation: 90, radius: V, flip: false };
    const m = placementMatrix(placement, V);
    const p1 = applyMatrix({ x: 1, y: 0 }, m);
    expect(p1.x).toBeCloseTo(0, 9);
    expect(p1.y).toBeCloseTo(1, 9);
    const p2 = applyMatrix({ x: 0, y: 1 }, m);
    expect(p2.x).toBeCloseTo(-1, 9);
    expect(p2.y).toBeCloseTo(0, 9);
  });

  it('flip only: x is negated, y is unchanged', () => {
    const placement = { x: 0, y: 0, rotation: 0, radius: V, flip: true };
    const m = placementMatrix(placement, V);
    const p1 = applyMatrix({ x: 1, y: 0 }, m);
    expect(p1.x).toBeCloseTo(-1, 9);
    expect(p1.y).toBeCloseTo(0, 9);
    const p2 = applyMatrix({ x: 0, y: 1 }, m);
    expect(p2.x).toBeCloseTo(0, 9);
    expect(p2.y).toBeCloseTo(1, 9);
  });

  it('flip + rotate combined: flip folds into scale BEFORE rotation is applied', () => {
    // Concrete case: flip (x -> -x) then rotate 90 deg (CCW). Point (1,0):
    //   after flip-as-scale: (-1, 0)
    //   after rotating 90 CCW: (0, -1)
    const placement = { x: 0, y: 0, rotation: 90, radius: V, flip: true };
    const m = placementMatrix(placement, V);
    const p = applyMatrix({ x: 1, y: 0 }, m);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(-1, 9);

    // Contrast: if rotation were applied BEFORE flip (rotate then negate x),
    // (1,0) --rotate90--> (0,1) --flip x--> (0,1) — a DIFFERENT result. This
    // confirms the compose order (flip-in-scale happens first) is observed.
    expect(p.y).not.toBeCloseTo(1, 9);
  });
});

describe('matrixToSVG', () => {
  it('formats the identity-ish translate matrix exactly', () => {
    expect(matrixToSVG([1, 0, 0, 1, 10, 20])).toBe('matrix(1 0 0 1 10 20)');
  });

  it('formats a rotated matrix without exponential notation and trims float noise', () => {
    const placement = { x: 0, y: 0, rotation: 90, radius: V, flip: false };
    const m = placementMatrix(placement, V);
    const svg = matrixToSVG(m);
    expect(svg.startsWith('matrix(')).toBe(true);
    expect(svg).not.toMatch(/e[-+]?\d/i);
    // cos(90deg) ~ 6.12e-17 should round away to a clean 0, sin(90deg) -> 1.
    expect(svg).toBe('matrix(0 1 -1 0 0 0)');
  });
});

describe('determinism', () => {
  it('placementMatrix + applyMatrix are pure: identical inputs produce toEqual outputs', () => {
    const placement = { x: 3, y: -7, rotation: 37, radius: 8, flip: true };
    const m1 = placementMatrix(placement, V);
    const m2 = placementMatrix(placement, V);
    expect(m1).toEqual(m2);

    const p1 = applyMatrix({ x: 2, y: -1 }, m1);
    const p2 = applyMatrix({ x: 2, y: -1 }, m2);
    expect(p1).toEqual(p2);
  });
});
