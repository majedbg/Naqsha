// Pure: maps a dragged text-box {w,h} to a layout mode + font size + wrap width.
// Decision rule: H:W >= 1 (taller-or-equal) => multi-line; wider => single line.

import { describe, it, expect } from 'vitest';
import { fitDraggedBox, effectiveFontSize, capHeightPx } from './fitText.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

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

// Width-fit safeguard (plan §5): a single-line node never bursts past its box's
// right edge — the font shrinks so the line's advance stays <= box.w. This is
// the min(heightFit, widthFit) guard, where heightFit is the stored fontSize.
describe('effectiveFontSize', () => {
  const font = loadWorkSans();

  it('returns the stored size when the single line already fits the box width', () => {
    const node = { text: 'Hi', fontSize: 40, lineMode: 'single', box: { w: 1000, h: 40 } };
    expect(effectiveFontSize(node, font)).toBe(40);
  });

  it('shrinks a long single line so its advance fits the box width', () => {
    const text = 'WIDEWIDEWIDEWIDE';
    const node = { text, fontSize: 200, lineMode: 'single', box: { w: 120, h: 200 } };
    const size = effectiveFontSize(node, font);
    expect(size).toBeLessThan(200);
    // The shrunk line must actually fit the box width (within sub-pixel rounding).
    expect(font.getAdvanceWidth(text, size)).toBeLessThanOrEqual(120 + 1e-6);
    // And it should be exactly the width-fit (not over-shrunk).
    expect(font.getAdvanceWidth(text, size)).toBeCloseTo(120, 3);
  });

  it('never goes below the minimum font size, even if that overflows', () => {
    const node = { text: 'WIDEWIDEWIDEWIDEWIDE', fontSize: 200, lineMode: 'single', box: { w: 1, h: 200 } };
    expect(effectiveFontSize(node, font, { minFontSize: 6 })).toBe(6);
  });

  it('does not cap multi-line text (it wraps instead of bursting)', () => {
    const node = { text: 'a very long paragraph of words', fontSize: 48, lineMode: 'multi', box: { w: 50, h: 300 } };
    expect(effectiveFontSize(node, font)).toBe(48);
  });

  it('does not cap point text (no box width — it grows freely)', () => {
    const node = { text: 'WIDEWIDEWIDE', fontSize: 80, lineMode: 'single', box: { w: 0, h: 0 } };
    expect(effectiveFontSize(node, font)).toBe(80);
  });

  it('returns the stored size for empty text', () => {
    const node = { text: '', fontSize: 48, lineMode: 'single', box: { w: 100, h: 48 } };
    expect(effectiveFontSize(node, font)).toBe(48);
  });
});

// Physical cap-height readout (plan §4): the visible capital-letter height in px,
// scaled from the font's cap metric, so the panel can show it in mm.
describe('capHeightPx', () => {
  const font = loadWorkSans();

  it('scales linearly with font size and lands in the typical cap-ratio band', () => {
    const h100 = capHeightPx(font, 100);
    // Cap height is a fraction of the em — comfortably between 0.6 and 0.8 for a sans.
    expect(h100).toBeGreaterThan(60);
    expect(h100).toBeLessThan(80);
    // Linear in size.
    expect(capHeightPx(font, 200)).toBeCloseTo(h100 * 2, 6);
  });

  it('is 0 for a missing font or zero size', () => {
    expect(capHeightPx(null, 100)).toBe(0);
    expect(capHeightPx(font, 0)).toBe(0);
  });
});
