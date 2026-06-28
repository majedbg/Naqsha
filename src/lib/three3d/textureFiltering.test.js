import { describe, it, expect } from 'vitest';
import { clampAnisotropy, chooseRasterScale } from './textureFiltering.js';

describe('clampAnisotropy', () => {
  it('returns the hardware max when within the default cap', () => {
    expect(clampAnisotropy(16)).toBe(16);
    expect(clampAnisotropy(8)).toBe(8);
    expect(clampAnisotropy(4)).toBe(4);
  });

  it('caps a higher reported max to the ceiling', () => {
    expect(clampAnisotropy(32)).toBe(16);
    expect(clampAnisotropy(64, 8)).toBe(8);
  });

  it('floors fractional reports to an integer', () => {
    expect(clampAnisotropy(15.9)).toBe(15);
  });

  it('falls back to 1 for missing / bogus maxima', () => {
    expect(clampAnisotropy(undefined)).toBe(1);
    expect(clampAnisotropy(NaN)).toBe(1);
    expect(clampAnisotropy(0)).toBe(1);
    expect(clampAnisotropy(-4)).toBe(1);
  });

  it('never drops below 1 even with a bogus cap', () => {
    expect(clampAnisotropy(16, 0)).toBe(1);
    expect(clampAnisotropy(16, NaN)).toBe(1);
  });
});

describe('chooseRasterScale', () => {
  it('multiplies by DPR when under the edge cap', () => {
    expect(chooseRasterScale({ width: 100, height: 50, dpr: 2, maxEdge: 2048 })).toBe(2);
    expect(chooseRasterScale({ width: 100, height: 50, dpr: 1, maxEdge: 2048 })).toBe(1);
  });

  it('clamps the final longest edge to maxEdge (DPR folded in first)', () => {
    // longest = 2000 * 2 = 4000 > 2048 ⇒ scale = (2048/4000) * 2 = 1.024
    const scale = chooseRasterScale({ width: 2000, height: 1000, dpr: 2, maxEdge: 2048 });
    expect(scale).toBeCloseTo(1.024, 6);
    // the resulting longest edge equals the cap exactly
    expect(2000 * scale).toBeCloseTo(2048, 6);
  });

  it('does not clamp when no maxEdge is given', () => {
    expect(chooseRasterScale({ width: 5000, height: 5000, dpr: 3 })).toBe(3);
  });

  it('guards degenerate inputs', () => {
    expect(chooseRasterScale({ width: 0, height: 0, dpr: 0, maxEdge: 2048 })).toBe(1);
    expect(chooseRasterScale({})).toBe(1);
  });

  it('floors the longest edge up to minEdge for a small/dense design', () => {
    // A 200mm panel decodes to ~756px; DPR 2 alone would raster only 1512px (under
    // the cap), so the hatch under-resolves. The floor lifts it to minEdge.
    const scale = chooseRasterScale({ width: 756, height: 756, dpr: 2, minEdge: 2048, maxEdge: 2048 });
    expect(756 * scale).toBeCloseTo(2048, 6);
  });

  it('pins every edge to a single size when floor === cap', () => {
    // floor == cap means the final longest edge is always exactly that size,
    // independent of source size and DPR — one bounded raster for every mark.
    const small = chooseRasterScale({ width: 300, height: 200, dpr: 1, minEdge: 2048, maxEdge: 2048 });
    expect(300 * small).toBeCloseTo(2048, 6);
    const large = chooseRasterScale({ width: 4000, height: 1000, dpr: 3, minEdge: 2048, maxEdge: 2048 });
    expect(4000 * large).toBeCloseTo(2048, 6);
  });

  it('lets the cap win when minEdge exceeds maxEdge (perf bound is never blown)', () => {
    const scale = chooseRasterScale({ width: 1000, height: 1000, dpr: 1, minEdge: 4096, maxEdge: 2048 });
    expect(1000 * scale).toBeCloseTo(2048, 6);
  });

  it('does not floor when DPR already clears minEdge', () => {
    // longest = 1500 * 2 = 3000 ≥ floor 2048 ⇒ floor is a no-op, DPR honored, capped.
    const scale = chooseRasterScale({ width: 1500, height: 1500, dpr: 2, minEdge: 2048, maxEdge: 4096 });
    expect(scale).toBe(2);
  });
});
