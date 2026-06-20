import { describe, it, expect, beforeAll } from 'vitest';
import { buildSelectables, pickTopmost, hitSelectable } from './selectables.js';
import { defaultTextParams } from '../text/textLayer.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

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

describe('buildSelectables — text layers', () => {
  let font;
  beforeAll(() => {
    font = loadWorkSans();
  });

  const textLayer = {
    id: 't1',
    type: 'text',
    visible: true,
    params: defaultTextParams({ text: 'Hi', x: 100, y: 100, fontSize: 64 }),
  };

  it('emits a TIGHT text selectable with a center pivot when a font is supplied', () => {
    const sels = buildSelectables({ layers: [textLayer], font, canvasW: W, canvasH: H });
    expect(sels).toHaveLength(1);
    const sel = sels[0];
    expect(sel.id).toBe('t1');
    expect(sel.kind).toBe('text');
    // Tight, not full canvas: origin at the glyph origin, width < canvas width.
    expect(sel.localBBox.x).toBe(100);
    expect(sel.localBBox.y).toBe(100);
    expect(sel.localBBox.w).toBeGreaterThan(0);
    expect(sel.localBBox.w).toBeLessThan(W);
    // Pivot is the bbox center — must match drawTextNode/textNodeCommands.
    expect(sel.pivot.x).toBeCloseTo(sel.localBBox.x + sel.localBBox.w / 2);
    expect(sel.pivot.y).toBeCloseTo(sel.localBBox.y + sel.localBBox.h / 2);
  });

  it('skips text layers entirely when no font is resolved yet', () => {
    const sels = buildSelectables({ layers: [textLayer], font: null, canvasW: W, canvasH: H });
    expect(sels).toEqual([]);
  });

  it('pickTopmost hits inside the tight text bbox and returns the text id', () => {
    const sels = buildSelectables({ layers: [textLayer], font, canvasW: W, canvasH: H });
    const { x, y, w, h } = sels[0].localBBox;
    const inside = { x: x + w / 2, y: y + h / 2 };
    expect(pickTopmost(inside, sels)).toBe('t1');
  });

  it('pickTopmost misses far outside the tight text bbox', () => {
    const sels = buildSelectables({ layers: [textLayer], font, canvasW: W, canvasH: H });
    // Top-left corner of the canvas is well outside a glyph box anchored at 100,100.
    expect(pickTopmost({ x: 1, y: 1 }, sels)).toBe(null);
  });
});

describe('buildSelectables — import layers', () => {
  // A 40×40 square anchored at (10,20): the selection box must hug THIS, not the
  // whole canvas, so its handles stay on-screen.
  const importLayer = {
    id: 'i1',
    type: 'import',
    visible: true,
    params: { pathData: ['M 10 20 L 50 20 L 50 60 L 10 60 Z'] },
  };

  it('emits a TIGHT import selectable hugging the geometry, with a bbox-center pivot', () => {
    const sels = buildSelectables({ layers: [importLayer], canvasW: W, canvasH: H });
    expect(sels).toHaveLength(1);
    const sel = sels[0];
    expect(sel.id).toBe('i1');
    expect(sel.kind).toBe('import');
    expect(sel.localBBox).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    // Pivot is the geometry-bbox center — must match useCanvas render + svgExport.
    expect(sel.pivot).toEqual({ x: 30, y: 40 });
  });

  it('hit-tests inside the tight import bbox and misses far outside it', () => {
    const sels = buildSelectables({ layers: [importLayer], canvasW: W, canvasH: H });
    expect(pickTopmost({ x: 30, y: 40 }, sels)).toBe('i1'); // inside
    expect(pickTopmost({ x: 300, y: 250 }, sels)).toBe(null); // would hit a full-canvas box
  });

  it('falls back to a full-canvas selectable for an import with no parseable geometry', () => {
    const empty = { id: 'i2', type: 'import', visible: true, params: { pathData: [] } };
    const sels = buildSelectables({ layers: [empty], canvasW: W, canvasH: H });
    expect(sels[0].kind).toBe('pattern');
    expect(sels[0].localBBox).toEqual({ x: 0, y: 0, w: W, h: H });
    expect(sels[0].pivot).toEqual({ x: W / 2, y: H / 2 });
  });
});
