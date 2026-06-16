import { describe, it, expect } from 'vitest';
import { applyMoveDelta, pickTopmostHit } from './moveTransform.js';

describe('applyMoveDelta', () => {
  it('adds delta to a starting transform, preserving rotation/scale', () => {
    const out = applyMoveDelta({ x: 10, y: 20, rotation: 30, scale: 2 }, 5, -3);
    expect(out).toEqual({ x: 15, y: 17, rotation: 30, scale: 2 });
  });

  it('treats a missing start transform as identity', () => {
    expect(applyMoveDelta(undefined, 4, 7)).toEqual({ x: 4, y: 7, rotation: 0, scale: 1 });
  });

  it('is absolute from start (no accumulation drift)', () => {
    const start = { x: 100, y: 100, rotation: 0, scale: 1 };
    // Two successive moves from the SAME start point land at start+delta, not start+2*delta.
    expect(applyMoveDelta(start, 50, 0).x).toBe(150);
    expect(applyMoveDelta(start, 50, 0).x).toBe(150);
  });
});

describe('pickTopmostHit', () => {
  const layers = [
    { id: 'front', visible: true },
    { id: 'back', visible: true },
  ];
  const W = 800;
  const H = 600;

  it('returns the front-most (layers[0]) layer on a hit', () => {
    // PatternNode bbox is full-canvas, so any in-canvas point hits the topmost.
    expect(pickTopmostHit({ x: 400, y: 300 }, layers, {}, {}, W, H)).toBe('front');
  });

  it('returns null on a miss (outside canvas, no transforms)', () => {
    expect(pickTopmostHit({ x: -50, y: -50 }, layers, {}, {}, W, H)).toBeNull();
  });

  it('skips hidden layers', () => {
    const ls = [{ id: 'front', visible: false }, { id: 'back', visible: true }];
    expect(pickTopmostHit({ x: 400, y: 300 }, ls, {}, {}, W, H)).toBe('back');
  });

  it('honors a layer transform when hit-testing', () => {
    // Translate the front layer far off-canvas: the point that was inside it
    // now misses it but still hits the un-moved back layer.
    const transforms = { front: { x: 5000, y: 5000, rotation: 0, scale: 1 } };
    expect(pickTopmostHit({ x: 400, y: 300 }, layers, {}, transforms, W, H)).toBe('back');
  });
});
