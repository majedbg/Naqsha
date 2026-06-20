// Caret geometry in node-LOCAL coords. Maps an absolute string index into the
// laid-out text → the top-left of the caret bar on the correct line/column.
// Node tests, no DOM; uses the bundled Work Sans OFL fixture.

import { describe, it, expect, beforeAll } from 'vitest';
import { caretXY } from './caret.js';
import { layoutText } from './textLayout.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

const fontSize = 48;
const lineHeight = 1.2;
const base = (extra) => ({ font, fontSize, lineHeight, align: 'left', ...extra });

describe('caretXY', () => {
  it('index 0 on a single line sits at the line origin', () => {
    const c = caretXY('Hello', 0, base());
    expect(c.x).toBeCloseTo(0, 5);
    // caret top = baseline - fontSize (baseline is one line-height down).
    const { lines } = layoutText('Hello', base());
    expect(c.y).toBeCloseTo(lines[0].baseline - fontSize, 5);
    expect(c.height).toBeCloseTo(fontSize, 5);
  });

  it('mid-line index sits at the advance width of the preceding substring', () => {
    const c = caretXY('Hello', 3, base());
    expect(c.x).toBeCloseTo(font.getAdvanceWidth('Hel', fontSize), 5);
  });

  it('end of a single line sits at the full advance width', () => {
    const c = caretXY('Hello', 5, base());
    expect(c.x).toBeCloseTo(font.getAdvanceWidth('Hello', fontSize), 5);
  });

  it('an index just after a newline is at x=0 on the next line', () => {
    const text = 'AB\nCD';
    const c = caretXY(text, 3, base()); // index 3 = 'C' (first char of line 2)
    const { lines } = layoutText(text, base());
    expect(c.x).toBeCloseTo(0, 5);
    expect(c.y).toBeCloseTo(lines[1].baseline - fontSize, 5);
  });

  it('an index at the newline char itself is at end of the first line', () => {
    const text = 'AB\nCD';
    const c = caretXY(text, 2, base()); // index 2 = the '\n'
    const { lines } = layoutText(text, base());
    expect(c.x).toBeCloseTo(font.getAdvanceWidth('AB', fontSize), 5);
    expect(c.y).toBeCloseTo(lines[0].baseline - fontSize, 5);
  });

  it('places the caret correctly at the start of a WRAPPED line (space consumed)', () => {
    const text = 'one two three four five';
    const wrapWidth = font.getAdvanceWidth('one two three', fontSize);
    const opts = base({ wrapWidth });
    const { lines } = layoutText(text, opts);
    expect(lines.length).toBeGreaterThan(1);
    // The absolute index of the first character of line 2 (its `start`).
    const idx = lines[1].start;
    const c = caretXY(text, idx, opts);
    expect(c.x).toBeCloseTo(lines[1].x, 5); // start of the wrapped line
    expect(c.y).toBeCloseTo(lines[1].baseline - fontSize, 5);
  });

  it('places the caret at the END of a wrapped line', () => {
    const text = 'one two three four five';
    const wrapWidth = font.getAdvanceWidth('one two three', fontSize);
    const opts = base({ wrapWidth });
    const { lines } = layoutText(text, opts);
    const line0 = lines[0];
    const idx = line0.start + line0.text.length; // index of the space at wrap pt
    const c = caretXY(text, idx, opts);
    // Caret stays on line 0 at the end of its visible text.
    expect(c.x).toBeCloseTo(line0.x + line0.width, 5);
    expect(c.y).toBeCloseTo(line0.baseline - fontSize, 5);
  });

  it('handles empty text (caret at origin, height = fontSize)', () => {
    const c = caretXY('', 0, base());
    expect(c.x).toBeCloseTo(0, 5);
    expect(c.y).toBeCloseTo(0, 5);
    expect(c.height).toBeCloseTo(fontSize, 5);
  });

  it('clamps an out-of-range index to the end of the text', () => {
    const c = caretXY('Hi', 99, base());
    expect(c.x).toBeCloseTo(font.getAdvanceWidth('Hi', fontSize), 5);
  });
});
