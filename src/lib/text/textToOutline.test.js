// TDD tracer-bullet slice: text string -> opentype.js glyph outline -> SVG path.
// Node tests, no DOM. The font is loaded from the bundled OFL asset.

import { describe, it, expect, beforeAll } from 'vitest';
import { textToOutline } from './textToOutline.js';
import { loadWorkSans } from '../../test/loadWorkSans.js';

let font;
beforeAll(() => {
  font = loadWorkSans();
});

describe('textToOutline (tracer)', () => {
  it('produces non-empty SVG path data for a string', () => {
    const { pathData } = textToOutline('Sara', { font, fontSize: 100, x: 0, y: 100 });
    expect(typeof pathData).toBe('string');
    expect(pathData.length).toBeGreaterThan(0);
    expect(pathData.startsWith('M')).toBe(true);
  });

  it('reports an advance width that scales linearly with font size', () => {
    const a = textToOutline('Sara', { font, fontSize: 100, x: 0, y: 0 });
    const b = textToOutline('Sara', { font, fontSize: 200, x: 0, y: 0 });
    expect(a.advanceWidth).toBeGreaterThan(0);
    expect(b.advanceWidth).toBeCloseTo(a.advanceWidth * 2, 1);
  });

  it('is deterministic for identical inputs (fabrication reproducibility)', () => {
    const a = textToOutline('Sara', { font, fontSize: 100, x: 0, y: 0 });
    const b = textToOutline('Sara', { font, fontSize: 100, x: 0, y: 0 });
    expect(b.pathData).toBe(a.pathData);
  });

  it('preserves letter counters as separate subpaths (no solid blob / confetti)', () => {
    // 'o' = an outer contour + an inner counter => at least 2 moveto subpaths.
    const { pathData } = textToOutline('o', { font, fontSize: 100, x: 0, y: 0 });
    const subpaths = (pathData.match(/M/g) || []).length;
    expect(subpaths).toBeGreaterThanOrEqual(2);
  });

  it('emits NO NaN coordinates — incl. quadratic (Q) glyph segments', () => {
    // Regression: opentype 2.0.0 path.toPathData() emits NaN for Q segments in
    // TrueType glyphs (e.g. the 't' in Work Sans). We serialize from the clean
    // commands instead, so the export must be NaN-free. 'Text' has Q curves.
    for (const s of ['Text', 'oeaQg', 'Sara']) {
      const { pathData } = textToOutline(s, { font, fontSize: 120, x: 100, y: 100 });
      expect(pathData).not.toContain('NaN');
    }
  });

  it('uses only M/L/C/Q/Z command letters', () => {
    const { pathData } = textToOutline('Text', { font, fontSize: 120, x: 0, y: 0 });
    // Strip numbers, spaces, signs, dots → only command letters remain.
    const letters = pathData.replace(/[-0-9.\s]/g, '');
    expect(/^[MLCQZ]+$/.test(letters)).toBe(true);
  });
});
