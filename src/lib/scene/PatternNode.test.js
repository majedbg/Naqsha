// P0b adapter: a PatternNode wraps the app's existing (layer + generated Pattern
// instance) pair and delegates SVG output unchanged, so the scene graph is a
// lossless container over today's representation.
import { describe, it, expect } from 'vitest';
import { PatternNode } from './PatternNode.js';

const layer = { id: 'layer-7', color: '#abc', opacity: 80, visible: true };
// Stub instance recording the exact (id, color, opacity) it was called with.
const stubInstance = {
  toSVGGroup: (id, color, opacity) => `<g id="${id}" stroke="${color}" data-op="${opacity}">x</g>`,
};

describe('PatternNode', () => {
  it('delegates toSVGGroup to the wrapped instance with the layer id/color/opacity', () => {
    const node = new PatternNode(layer, stubInstance);
    expect(node.toSVGGroup()).toBe(stubInstance.toSVGGroup('layer-7', '#abc', 80));
  });

  it('defaults to an identity transform (the seam interactive nodes use) and type "pattern"', () => {
    const node = new PatternNode(layer, stubInstance);
    expect(node.type).toBe('pattern');
    expect(node.transform).toEqual({ x: 0, y: 0, rotation: 0, scale: 1 });
  });

  it('reads visibility from the layer', () => {
    expect(new PatternNode({ ...layer, visible: false }, stubInstance).visible).toBe(false);
    expect(new PatternNode({ ...layer, visible: true }, stubInstance).visible).toBe(true);
  });
});
