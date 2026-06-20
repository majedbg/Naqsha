import { describe, it, expect, beforeAll } from 'vitest';
import { isTextLayer, defaultTextParams, textNodeFromLayer, textCreateFromDrag } from './textLayer.js';
import { textNodeCommands } from './drawTextNode.js';
import { DEFAULT_FONT_ID } from './fontRegistry.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

describe('isTextLayer', () => {
  it('is true for a text layer', () => {
    expect(isTextLayer({ type: 'text' })).toBe(true);
  });
  it('is false for an import layer', () => {
    expect(isTextLayer({ type: 'import' })).toBe(false);
  });
  it('is false for a pattern layer (no type)', () => {
    expect(isTextLayer({ patternType: 'spirograph' })).toBe(false);
  });
  it('is false for null/undefined', () => {
    expect(isTextLayer(null)).toBe(false);
    expect(isTextLayer(undefined)).toBe(false);
  });
});

describe('defaultTextParams', () => {
  it('returns the documented defaults', () => {
    expect(defaultTextParams()).toEqual({
      text: '',
      fontId: DEFAULT_FONT_ID,
      fontSize: 48,
      align: 'left',
      lineHeight: 1.2,
      box: { w: 0, h: 0 },
      lineMode: 'single',
      renderMode: 'fill',
      color: '#000000',
      x: 0,
      y: 0,
    });
  });

  it('lets overrides win', () => {
    const p = defaultTextParams({ text: 'hello', fontSize: 64, color: '#ff0000' });
    expect(p.text).toBe('hello');
    expect(p.fontSize).toBe(64);
    expect(p.color).toBe('#ff0000');
    // Untouched keys keep defaults.
    expect(p.align).toBe('left');
  });

  it('returns a distinct box object each call (mutation does not leak)', () => {
    const a = defaultTextParams();
    a.box.w = 999;
    const b = defaultTextParams();
    expect(b.box).toEqual({ w: 0, h: 0 });
    expect(a.box).not.toBe(b.box);
  });
});

describe('textNodeFromLayer', () => {
  it('maps a full params object to node data', () => {
    const layer = {
      id: 't1',
      type: 'text',
      params: {
        text: 'Hi',
        fontId: 'work-sans',
        fontSize: 32,
        align: 'center',
        lineHeight: 1.5,
        box: { w: 100, h: 50 },
        lineMode: 'area',
        renderMode: 'outline',
        color: '#123456',
        x: 10,
        y: 20,
      },
    };
    expect(textNodeFromLayer(layer)).toEqual({
      id: 't1',
      text: 'Hi',
      fontId: 'work-sans',
      fontSize: 32,
      align: 'center',
      lineHeight: 1.5,
      box: { w: 100, h: 50 },
      lineMode: 'area',
      renderMode: 'outline',
      color: '#123456',
      x: 10,
      y: 20,
    });
  });

  it('falls back to defaults for missing params', () => {
    const node = textNodeFromLayer({ id: 't2', type: 'text', params: { text: 'x' } });
    expect(node.id).toBe('t2');
    expect(node.text).toBe('x');
    expect(node.fontSize).toBe(48);
    expect(node.align).toBe('left');
    expect(node.box).toEqual({ w: 0, h: 0 });
    expect(node.color).toBe('#000000');
  });

  it('does not attach a font (renderer injects it)', () => {
    const node = textNodeFromLayer({ id: 't3', type: 'text', params: {} });
    expect(node.font).toBeUndefined();
  });

  it('takes id from layer.id', () => {
    expect(textNodeFromLayer({ id: 'abc', params: {} }).id).toBe('abc');
  });
});

describe('text LAYER renders to drawable geometry (integration smoke)', () => {
  let font;
  beforeAll(() => {
    font = loadWorkSans();
  });

  it('a text layer flows end-to-end to canvas commands', () => {
    const layer = {
      id: 't1',
      type: 'text',
      params: defaultTextParams({ text: 'Hi', fontSize: 64 }),
    };
    const { commands } = textNodeCommands(textNodeFromLayer(layer), font);
    expect(commands.length).toBeGreaterThan(0);
  });
});

describe('textCreateFromDrag', () => {
  it('treats a tiny delta as a click → single-line at the start, empty box', () => {
    const geo = textCreateFromDrag({ x: 50, y: 60 }, { x: 52, y: 61 });
    expect(geo).toEqual({ x: 50, y: 60, box: { w: 0, h: 0 }, lineMode: 'single' });
  });

  it('treats a zero delta as a click', () => {
    const geo = textCreateFromDrag({ x: 10, y: 20 }, { x: 10, y: 20 });
    expect(geo).toEqual({ x: 10, y: 20, box: { w: 0, h: 0 }, lineMode: 'single' });
  });

  it('treats a real drag as a box → multi, box = abs deltas, origin = min corner', () => {
    const geo = textCreateFromDrag({ x: 100, y: 100 }, { x: 220, y: 180 });
    expect(geo).toEqual({ x: 100, y: 100, box: { w: 120, h: 80 }, lineMode: 'multi' });
  });

  it('normalizes a drag that goes up-and-left to the min corner', () => {
    const geo = textCreateFromDrag({ x: 200, y: 200 }, { x: 100, y: 150 });
    expect(geo).toEqual({ x: 100, y: 150, box: { w: 100, h: 50 }, lineMode: 'multi' });
  });
});
