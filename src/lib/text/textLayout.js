// Pure text layout. Splits a string into laid-out lines with per-line baseline
// (y) and x offset, optionally greedy word-wrapping each paragraph to fit a
// width. No DOM, no I/O — measurement is via the supplied opentype.js Font so it
// stays consistent with `textToOutline` (the canvas == SVG invariant).

/**
 * @param {string} text
 * @param {{ font: import('opentype.js').Font, fontSize: number,
 *           align?: 'left'|'center'|'right', lineHeight?: number,
 *           wrapWidth?: number|null }} opts
 * @returns {{ lines: Array<{ text: string, x: number, baseline: number, width: number }>,
 *             width: number, height: number }}
 *
 * BASELINE CONVENTION: the first line's baseline is ONE line-height down from the
 * top of the block, i.e. baseline(lineIndex) = (lineIndex + 1) * fontSize *
 * lineHeight, with lineIndex counting cumulatively across the whole block (it
 * does NOT reset at paragraph boundaries). This keeps the block's top at y=0 and
 * its total height = lines.length * fontSize * lineHeight.
 */
export function layoutText(text, { font, fontSize, align = 'left', lineHeight = 1.2, wrapWidth = null }) {
  // ''.split('\n') is [''] (one line), so guard empties explicitly.
  if (text === '') return { lines: [], width: 0, height: 0 };

  const step = fontSize * lineHeight;
  const wrapping = typeof wrapWidth === 'number' && wrapWidth > 0;

  // 1. Split on explicit newlines, then word-wrap each paragraph if asked.
  const paragraphs = text.split('\n');
  const lineTexts = [];
  for (const para of paragraphs) {
    if (!wrapping) {
      lineTexts.push(para);
      continue;
    }
    // Greedy word-wrap. An empty paragraph stays one empty line.
    if (para === '') {
      lineTexts.push('');
      continue;
    }
    const words = para.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (current !== '' && font.getAdvanceWidth(candidate, fontSize) > wrapWidth) {
        lineTexts.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lineTexts.push(current);
  }

  // 2. Measure each line.
  const measured = lineTexts.map((t) => ({
    text: t,
    width: font.getAdvanceWidth(t, fontSize),
  }));
  const maxLineWidth = measured.reduce((m, l) => Math.max(m, l.width), 0);

  // 3. Alignment uses the block width: wrapWidth if wrapping, else max line width.
  const blockWidth = wrapping ? wrapWidth : maxLineWidth;

  const lines = measured.map((l, i) => {
    let x = 0;
    if (align === 'center') x = (blockWidth - l.width) / 2;
    else if (align === 'right') x = blockWidth - l.width;
    return { text: l.text, x, baseline: (i + 1) * step, width: l.width };
  });

  return { lines, width: maxLineWidth, height: lines.length * step };
}
