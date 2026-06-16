// Pure: maps a dragged text-box {w,h} to a layout mode + font size + wrap width.
// Decision rule: H:W >= 1 (taller-or-equal) => multi-line; wider => single line.

import { describe, it, expect } from 'vitest';
import { fitDraggedBox } from './fitText.js';

describe('fitDraggedBox', () => {
  it('square box -> multi-line at the default font size, wrap = box width', () => {
    const out = fitDraggedBox({ w: 200, h: 200 });
    expect(out.lineMode).toBe('multi');
    expect(out.fontSize).toBe(48);
    expect(out.wrapWidth).toBe(200);
  });

  it('tall box -> multi-line', () => {
    const out = fitDraggedBox({ w: 100, h: 400 });
    expect(out.lineMode).toBe('multi');
    expect(out.fontSize).toBe(48);
    expect(out.wrapWidth).toBe(100);
  });

  it('wide box -> single line, fontSize fills the box height, no wrap', () => {
    const out = fitDraggedBox({ w: 400, h: 120 });
    expect(out.lineMode).toBe('single');
    expect(out.fontSize).toBe(120);
    expect(out.wrapWidth).toBe(null);
  });

  it('clamps font size to the minimum for a tiny wide box', () => {
    const out = fitDraggedBox({ w: 100, h: 3 }, { minFontSize: 6 });
    expect(out.lineMode).toBe('single');
    expect(out.fontSize).toBe(6);
  });

  it('clamps the multi-line font size to the minimum when default is below it', () => {
    const out = fitDraggedBox({ w: 50, h: 50 }, { defaultFontSize: 2, minFontSize: 6 });
    expect(out.lineMode).toBe('multi');
    expect(out.fontSize).toBe(6);
  });

  it('honors a custom default font size for multi-line', () => {
    const out = fitDraggedBox({ w: 300, h: 300 }, { defaultFontSize: 64 });
    expect(out.fontSize).toBe(64);
  });
});
