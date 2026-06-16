import { describe, it, expect } from 'vitest';
import { nodeBBox } from './bbox.js';
import { PatternNode } from './PatternNode.js';

const close = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

describe('nodeBBox', () => {
  it('a PatternNode with identity transform spans the full canvas (P1 approximation)', () => {
    const node = new PatternNode(
      { id: 'p', visible: true },
      { toSVGGroup: () => '<g/>' }
    );
    expect(nodeBBox(node, 384, 512)).toEqual({ x: 0, y: 0, w: 384, h: 512 });
  });

  it('honors a node-local bbox when present (e.g. a future TextNode box)', () => {
    const node = {
      transform: { x: 0, y: 0, rotation: 0, scale: 1 },
      localBBox: { x: 10, y: 20, w: 100, h: 40 },
    };
    expect(nodeBBox(node, 384, 384)).toEqual({ x: 10, y: 20, w: 100, h: 40 });
  });

  it('applies the node transform (translate) to the world bbox', () => {
    const node = {
      transform: { x: 30, y: -5, rotation: 0, scale: 1 },
      localBBox: { x: 0, y: 0, w: 50, h: 50 },
    };
    expect(nodeBBox(node, 384, 384)).toEqual({ x: 30, y: -5, w: 50, h: 50 });
  });

  it('applies rotation about the local-bbox center, growing the AABB', () => {
    const node = {
      transform: { x: 0, y: 0, rotation: 45, scale: 1 },
      localBBox: { x: 0, y: 0, w: 10, h: 10 },
    };
    const out = nodeBBox(node, 384, 384);
    expect(close(out.w, 10 * Math.SQRT2)).toBe(true);
    expect(close(out.h, 10 * Math.SQRT2)).toBe(true);
  });
});
