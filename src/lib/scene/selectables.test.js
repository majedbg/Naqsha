import { describe, it, expect } from 'vitest';
import { buildSelectables, pickTopmost, hitSelectable } from './selectables.js';

const W = 400;
const H = 300;

describe('buildSelectables', () => {
  it('emits one full-canvas selectable per visible layer, in order', () => {
    const sels = buildSelectables({
      layers: [{ id: 'a', visible: true }, { id: 'b', visible: true }],
      canvasW: W,
      canvasH: H,
    });
    expect(sels.map((s) => s.id)).toEqual(['a', 'b']);
    expect(sels[0].localBBox).toEqual({ x: 0, y: 0, w: W, h: H });
    expect(sels[0].pivot).toEqual({ x: W / 2, y: H / 2 });
  });

  it('skips hidden layers so clicks fall through', () => {
    const sels = buildSelectables({
      layers: [{ id: 'a', visible: false }, { id: 'b', visible: true }],
      canvasW: W,
      canvasH: H,
    });
    expect(sels.map((s) => s.id)).toEqual(['b']);
  });
});

describe('pickTopmost', () => {
  const sels = buildSelectables({
    layers: [{ id: 'top', visible: true }, { id: 'bottom', visible: true }],
    canvasW: W,
    canvasH: H,
  });

  it('returns the front-most layer under the point', () => {
    expect(pickTopmost({ x: 200, y: 150 }, sels)).toBe('top');
  });

  it('returns null when the point is outside an untransformed full-canvas node', () => {
    expect(pickTopmost({ x: -50, y: -50 }, sels)).toBe(null);
  });

  it('honors a node translate when hit-testing', () => {
    // top is translated +500 in x → the canvas-center point now misses top and
    // hits bottom (still at origin).
    const transforms = { top: { x: 500, y: 0, rotation: 0, scale: 1 } };
    expect(pickTopmost({ x: 200, y: 150 }, sels, transforms)).toBe('bottom');
  });

  it('hit-tests a rotated node in its local space', () => {
    // A point just outside the right edge, pulled inside by a translate.
    const sel = { id: 'x', localBBox: { x: 0, y: 0, w: W, h: H }, pivot: { x: W / 2, y: H / 2 } };
    expect(hitSelectable({ x: 410, y: 150 }, sel, { x: 0, y: 0, rotation: 0, scale: 1 })).toBe(false);
    expect(hitSelectable({ x: 410, y: 150 }, sel, { x: 20, y: 0, rotation: 0, scale: 1 })).toBe(true);
  });
});
