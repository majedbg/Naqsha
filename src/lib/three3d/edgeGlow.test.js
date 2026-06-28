import { describe, it, expect } from 'vitest';
import {
  dot3,
  edgeIntensity,
  fresnelFactor,
  edgeMaskForBox,
} from './edgeGlow.js';

// Unit axes used throughout (the real callers pass normalized world directions).
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];
const NEG_Y = [0, -1, 0];

describe('dot3', () => {
  it('computes the dot product of two [x,y,z] vectors', () => {
    expect(dot3([1, 2, 3], [4, 5, 6])).toBe(1 * 4 + 2 * 5 + 3 * 6);
  });

  it('is 0 for orthogonal unit axes and 1 for parallel ones', () => {
    expect(dot3(X, Y)).toBe(0);
    expect(dot3(X, X)).toBe(1);
    expect(dot3(Y, NEG_Y)).toBe(-1);
  });
});

describe('edgeIntensity', () => {
  it('= edgeGain when the key light is parallel to the face normal', () => {
    expect(edgeIntensity(Y, Y, 5)).toBe(5);
  });

  it('scales linearly with the incidence dot product', () => {
    // 45° between light and normal -> dot = cos45 ≈ 0.7071
    const lightDir = [Math.SQRT1_2, Math.SQRT1_2, 0];
    expect(edgeIntensity(lightDir, X, 4)).toBeCloseTo(4 * Math.SQRT1_2, 6);
  });

  it('clamps back-facing edges to zero (no negative emissive)', () => {
    // Light pointing opposite the normal -> dot = -1 -> clamped to 0.
    expect(edgeIntensity(NEG_Y, Y, 8)).toBe(0);
  });

  it('is zero when the light grazes perpendicular to the normal', () => {
    expect(edgeIntensity(X, Y, 6)).toBe(0);
  });

  it('is zero when edgeGain is zero regardless of incidence', () => {
    expect(edgeIntensity(Y, Y, 0)).toBe(0);
  });
});

describe('fresnelFactor', () => {
  it('is 0 when viewing straight onto the face (view parallel to normal)', () => {
    expect(fresnelFactor(Y, Y)).toBe(0);
  });

  it('approaches 1 at grazing angles (view perpendicular to normal)', () => {
    expect(fresnelFactor(X, Y)).toBe(1);
  });

  it('clamps back-facing (negative dot) to the maximum rim, never > 1', () => {
    // dot = -1 -> max(0,-1)=0 -> (1-0)^power = 1.
    expect(fresnelFactor(NEG_Y, Y)).toBe(1);
  });

  it('defaults to power 3', () => {
    // dot = 0.5 -> (1-0.5)^3 = 0.125
    const v = [0.5, Math.sqrt(3) / 2, 0]; // dot with X is 0.5
    expect(fresnelFactor(v, X)).toBeCloseTo(0.125, 6);
  });

  it('honors a custom power exponent (higher = sharper rim)', () => {
    const v = [0.5, Math.sqrt(3) / 2, 0]; // dot with X is 0.5
    expect(fresnelFactor(v, X, 1)).toBeCloseTo(0.5, 6);
    expect(fresnelFactor(v, X, 2)).toBeCloseTo(0.25, 6);
    // Sharper power yields a smaller mid-angle value -> tighter rim.
    expect(fresnelFactor(v, X, 5)).toBeLessThan(fresnelFactor(v, X, 2));
  });
});

describe('edgeMaskForBox', () => {
  it('is 1 on side faces (normal perpendicular to the stack axis)', () => {
    // Stack along Y; a +X side face -> dot 0 -> mask 1.
    expect(edgeMaskForBox(X, Y)).toBe(1);
    expect(edgeMaskForBox(Z, Y)).toBe(1);
  });

  it('is 0 on the stacked top/bottom faces (normal along the stack axis)', () => {
    expect(edgeMaskForBox(Y, Y)).toBe(0);
    expect(edgeMaskForBox(NEG_Y, Y)).toBe(0); // |dot| handles the -Y face too
  });

  it('is symmetric for opposing faces via the absolute value', () => {
    expect(edgeMaskForBox(Y, Y)).toBe(edgeMaskForBox(NEG_Y, Y));
  });

  it('transitions through intermediate values for a tilted normal', () => {
    // 45° tilt toward the stack axis -> |dot| = cos45 -> mask = 1 - 0.7071
    const tilted = [Math.SQRT1_2, Math.SQRT1_2, 0];
    expect(edgeMaskForBox(tilted, Y)).toBeCloseTo(1 - Math.SQRT1_2, 6);
  });

  it('stays within [0,1] for any unit normal/axis pair', () => {
    const m = edgeMaskForBox([Math.SQRT1_2, Math.SQRT1_2, 0], Z);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThanOrEqual(1);
  });
});
