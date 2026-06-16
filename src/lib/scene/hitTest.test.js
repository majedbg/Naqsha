import { describe, it, expect } from 'vitest';
import { hitTestNode } from './hitTest.js';

describe('hitTestNode', () => {
  it('hits a point inside an axis-aligned (identity) node', () => {
    const node = { transform: { x: 0, y: 0, rotation: 0, scale: 1 }, localBBox: { x: 0, y: 0, w: 100, h: 40 } };
    expect(hitTestNode({ x: 50, y: 20 }, node, 384, 384)).toBe(true);
    expect(hitTestNode({ x: 150, y: 20 }, node, 384, 384)).toBe(false);
  });

  it('hit-tests a ROTATED node in local space: a point inside only after un-rotating', () => {
    // Wide-thin box 100x20 centered at (50,10), rotated 90deg about its center.
    // After rotation it occupies the vertical strip ~x in [40,60], y in [-40,60].
    const node = { transform: { x: 0, y: 0, rotation: 90, scale: 1 }, localBBox: { x: 0, y: 0, w: 100, h: 20 } };
    // A point far up the vertical strip: OUTSIDE the unrotated box, INSIDE the rotated one.
    const p = { x: 50, y: 55 };
    expect(hitTestNode(p, node, 384, 384)).toBe(true);
    // The same y but the unrotated-box would NOT have been hit there:
    const unrotated = { ...node, transform: { x: 0, y: 0, rotation: 0, scale: 1 } };
    expect(hitTestNode(p, unrotated, 384, 384)).toBe(false);
    // A point outside both:
    expect(hitTestNode({ x: 200, y: 55 }, node, 384, 384)).toBe(false);
  });

  it('accounts for the node translation', () => {
    const node = { transform: { x: 100, y: 0, rotation: 0, scale: 1 }, localBBox: { x: 0, y: 0, w: 50, h: 50 } };
    expect(hitTestNode({ x: 120, y: 25 }, node, 384, 384)).toBe(true);
    expect(hitTestNode({ x: 20, y: 25 }, node, 384, 384)).toBe(false);
  });
});
