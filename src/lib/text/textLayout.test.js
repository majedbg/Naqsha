// Pure text layout: split into lines, optional word-wrap, per-line baseline/x.
// Node tests, no DOM. Uses the bundled Work Sans OFL font fixture.

import { describe, it, expect, beforeAll } from 'vitest';
import { layoutText } from './textLayout.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

describe('layoutText', () => {
  it('lays out a single line', () => {
    const out = layoutText('Hello', { font, fontSize: 48 });
    expect(out.lines.length).toBe(1);
    expect(out.lines[0].text).toBe('Hello');
    // First baseline sits one line-height down from the top.
    expect(out.lines[0].baseline).toBeCloseTo(48 * 1.2, 5);
    expect(out.lines[0].x).toBe(0);
    expect(out.lines[0].width).toBeCloseTo(font.getAdvanceWidth('Hello', 48), 5);
    expect(out.width).toBeCloseTo(out.lines[0].width, 5);
    expect(out.height).toBeCloseTo(48 * 1.2, 5);
  });

  it('splits on explicit newlines into 2 lines with cumulative baselines', () => {
    const out = layoutText('AB\nCD', { font, fontSize: 48 });
    expect(out.lines.length).toBe(2);
    expect(out.lines[0].text).toBe('AB');
    expect(out.lines[1].text).toBe('CD');
    expect(out.lines[0].baseline).toBeCloseTo(48 * 1.2, 5);
    expect(out.lines[1].baseline).toBeCloseTo(2 * 48 * 1.2, 5);
    expect(out.height).toBeCloseTo(2 * 48 * 1.2, 5);
  });

  it('keeps empty middle paragraphs as a counted line', () => {
    const out = layoutText('a\n\nb', { font, fontSize: 48 });
    expect(out.lines.length).toBe(3);
    expect(out.lines[1].text).toBe('');
    expect(out.lines[2].baseline).toBeCloseTo(3 * 48 * 1.2, 5);
  });

  it('greedy word-wraps a long string to multiple lines at wrapWidth', () => {
    const text = 'one two three four five six seven eight';
    const fontSize = 48;
    // Pick a wrap width that fits a couple words per line.
    const wrapWidth = font.getAdvanceWidth('one two three', fontSize);
    const out = layoutText(text, { font, fontSize, wrapWidth });
    expect(out.lines.length).toBeGreaterThan(1);
    // No laid-out line should exceed wrapWidth (single words may, but these fit).
    for (const line of out.lines) {
      expect(line.width).toBeLessThanOrEqual(wrapWidth + 1e-6);
    }
    // Round-trips the words in order.
    const joined = out.lines.map((l) => l.text).join(' ');
    expect(joined).toBe(text);
  });

  it('does not wrap when wrapWidth is null', () => {
    const text = 'one two three four five six seven eight';
    const out = layoutText(text, { font, fontSize: 48, wrapWidth: null });
    expect(out.lines.length).toBe(1);
  });

  it('centers lines within the block', () => {
    const out = layoutText('AB\nCDEF', { font, fontSize: 48, align: 'center' });
    const blockWidth = out.width; // no wrapWidth => block is max line width
    expect(out.lines[0].x).toBeCloseTo((blockWidth - out.lines[0].width) / 2, 5);
    expect(out.lines[1].x).toBeCloseTo((blockWidth - out.lines[1].width) / 2, 5);
  });

  it('right-aligns lines within the block', () => {
    const out = layoutText('AB\nCDEF', { font, fontSize: 48, align: 'right' });
    const blockWidth = out.width;
    expect(out.lines[0].x).toBeCloseTo(blockWidth - out.lines[0].width, 5);
    expect(out.lines[1].x).toBeCloseTo(blockWidth - out.lines[1].width, 5);
  });

  it('uses wrapWidth as the block width for alignment when wrapping', () => {
    const fontSize = 48;
    const wrapWidth = font.getAdvanceWidth('one two three', fontSize);
    const out = layoutText('one two three four', { font, fontSize, align: 'right', wrapWidth });
    // Right-aligned to wrapWidth, not to the max line width.
    expect(out.lines[0].x).toBeCloseTo(wrapWidth - out.lines[0].width, 5);
  });

  it('respects a custom lineHeight', () => {
    const out = layoutText('A\nB', { font, fontSize: 50, lineHeight: 2 });
    expect(out.lines[0].baseline).toBeCloseTo(50 * 2, 5);
    expect(out.lines[1].baseline).toBeCloseTo(2 * 50 * 2, 5);
    expect(out.height).toBeCloseTo(2 * 50 * 2, 5);
  });

  it('returns nothing for an empty string', () => {
    const out = layoutText('', { font, fontSize: 48 });
    expect(out.lines).toEqual([]);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });
});
