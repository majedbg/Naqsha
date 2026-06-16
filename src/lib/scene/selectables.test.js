// Tests for the unified selectables list + pick.
import { describe, it, expect, beforeAll } from 'vitest';
import { buildSelectables, pickTopmost, hitSelectable } from './selectables.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

const CW = 400;
const CH = 300;

const layers = [
  { id: 'top', patternType: 'p', visible: true },
  { id: 'bottom', patternType: 'p', visible: true },
];

const mkText = (over = {}) => ({
  id: 'txt1',
  type: 'text',
  text: 'Text',
  fontId: 'work-sans',
  fontSize: 120,
  align: 'left',
  lineHeight: 1.2,
  box: { w: 0, h: 0 },
  lineMode: 'single',
  renderMode: 'fill',
  color: '#000000',
  x: 100,
  y: 80,
  ...over,
});

describe('buildSelectables', () => {
  it('orders text nodes FIRST, then pattern layers in layers[] order', () => {
    const sel = buildSelectables({
      layers,
      textNodes: [mkText()],
      font,
      canvasW: CW,
      canvasH: CH,
    });
    expect(sel.map((s) => s.id)).toEqual(['txt1', 'top', 'bottom']);
    expect(sel.map((s) => s.kind)).toEqual(['text', 'pattern', 'pattern']);
  });

  it('gives patterns the full-canvas bbox with canvas-center pivot', () => {
    const sel = buildSelectables({ layers, canvasW: CW, canvasH: CH });
    const top = sel.find((s) => s.id === 'top');
    expect(top.localBBox).toEqual({ x: 0, y: 0, w: CW, h: CH });
    expect(top.pivot).toEqual({ x: CW / 2, y: CH / 2 });
  });

  it('gives a text node a TIGHT bbox offset by (x,y) and center pivot', () => {
    const node = mkText();
    const sel = buildSelectables({ textNodes: [node], font, canvasW: CW, canvasH: CH });
    const t = sel[0];
    expect(t.kind).toBe('text');
    // World bbox starts at the node's x/y (NOT the canvas origin).
    expect(t.localBBox.x).toBe(node.x);
    expect(t.localBBox.y).toBe(node.y);
    // Tight: smaller than the canvas.
    expect(t.localBBox.w).toBeGreaterThan(0);
    expect(t.localBBox.w).toBeLessThan(CW);
    // Pivot is the world bbox center.
    expect(t.pivot.x).toBeCloseTo(node.x + t.localBBox.w / 2, 6);
    expect(t.pivot.y).toBeCloseTo(node.y + t.localBBox.h / 2, 6);
  });

  it('SKIPS text nodes when no font is supplied', () => {
    const sel = buildSelectables({ layers, textNodes: [mkText()], font: null, canvasW: CW, canvasH: CH });
    expect(sel.map((s) => s.id)).toEqual(['top', 'bottom']);
  });

  it('SKIPS hidden pattern layers (parity with pickTopmostHit)', () => {
    const ls = [
      { id: 'top', patternType: 'p', visible: false },
      { id: 'bottom', patternType: 'p', visible: true },
    ];
    const sel = buildSelectables({ layers: ls, canvasW: CW, canvasH: CH });
    expect(sel.map((s) => s.id)).toEqual(['bottom']);
  });
});

describe('pickTopmost', () => {
  it('selects the text node when clicking inside its tight box (text on top)', () => {
    const node = mkText();
    const sel = buildSelectables({ layers, textNodes: [node], font, canvasW: CW, canvasH: CH });
    const txt = sel[0].localBBox;
    const center = { x: txt.x + txt.w / 2, y: txt.y + txt.h / 2 };
    expect(pickTopmost(center, sel, {})).toBe('txt1');
  });

  it('falls through to the topmost pattern when clicking OUTSIDE the text box', () => {
    const node = mkText({ x: 0, y: 0 });
    const sel = buildSelectables({ layers, textNodes: [node], font, canvasW: CW, canvasH: CH });
    const txt = sel[0].localBBox;
    // A point well to the right of the (left-anchored) text box but inside canvas.
    const pt = { x: CW - 5, y: CH - 5 };
    expect(pt.x).toBeGreaterThan(txt.x + txt.w);
    expect(pickTopmost(pt, sel, {})).toBe('top');
  });

  it('honors a node transform when hit-testing (translated text)', () => {
    const node = mkText();
    const sel = buildSelectables({ textNodes: [node], font, canvasW: CW, canvasH: CH });
    const txt = sel[0].localBBox;
    // A point just past the box's right edge — a miss at identity, a hit once the
    // box is translated right by more than the overshoot.
    const justOutside = { x: txt.x + txt.w + 30, y: txt.y + txt.h / 2 };
    expect(hitSelectable(justOutside, sel[0], { x: 0, y: 0, rotation: 0, scale: 1 })).toBe(false);
    const transforms = { txt1: { x: 60, y: 0, rotation: 0, scale: 1 } };
    expect(hitSelectable(justOutside, sel[0], transforms.txt1)).toBe(true);
  });

  it('a click over a HIDDEN top pattern falls through to the visible one beneath', () => {
    const ls = [
      { id: 'top', patternType: 'p', visible: false },
      { id: 'bottom', patternType: 'p', visible: true },
    ];
    const sel = buildSelectables({ layers: ls, canvasW: CW, canvasH: CH });
    expect(pickTopmost({ x: CW / 2, y: CH / 2 }, sel, {})).toBe('bottom');
  });

  it('returns null on an empty-space click with no selectables', () => {
    expect(pickTopmost({ x: 10, y: 10 }, [], {})).toBe(null);
  });
});
