import { describe, it, expect } from 'vitest';
import { applyMoveDelta } from './moveTransform.js';

describe('applyMoveDelta', () => {
  it('adds the delta to the start translation', () => {
    expect(applyMoveDelta({ x: 10, y: 20, rotation: 0, scale: 1 }, 5, -3)).toEqual({
      x: 15,
      y: 17,
      rotation: 0,
      scale: 1,
    });
  });

  it('preserves rotation and scale', () => {
    expect(applyMoveDelta({ x: 0, y: 0, rotation: 45, scale: 2 }, 1, 1)).toEqual({
      x: 1,
      y: 1,
      rotation: 45,
      scale: 2,
    });
  });

  it('treats a missing start transform as identity', () => {
    expect(applyMoveDelta(undefined, 4, 6)).toEqual({ x: 4, y: 6, rotation: 0, scale: 1 });
  });
});
