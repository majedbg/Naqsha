// Pure caret geometry for the live text editor.
//
// Given the node's text + an absolute caret index (the textarea's
// `selectionStart`) plus the same layout params drawTextNode uses, return the
// caret bar's TOP-LEFT in node-LOCAL coordinates (the space drawTextNode draws
// in, before the node's center-pivot transform). Reuses `layoutText` so the
// caret tracks exactly where glyphs land (canvas == SVG invariant), including
// word-wrap. No DOM, no I/O.

import { layoutText } from './textLayout.js';

/**
 * @param {string} text
 * @param {number} index absolute caret index into `text` (selectionStart)
 * @param {{ font: import('opentype.js').Font, fontSize: number,
 *           align?: 'left'|'center'|'right', lineHeight?: number,
 *           wrapWidth?: number|null }} opts
 * @returns {{ x: number, y: number, height: number }} caret bar top-left +
 *   height (≈ fontSize). `y` is the TOP of the caret line (baseline - fontSize).
 */
export function caretXY(text, index, { font, fontSize, align = 'left', lineHeight = 1.2, wrapWidth = null }) {
  const opts = { font, fontSize, align, lineHeight, wrapWidth };
  const { lines } = layoutText(text, opts);

  // Empty text → no laid-out lines. Caret sits at the block origin with the
  // alignment offset of an empty line (0 for left). Height ≈ fontSize.
  if (lines.length === 0) {
    return { x: 0, y: 0, height: fontSize };
  }

  // Clamp the index into [0, text.length].
  const len = text.length;
  const idx = index < 0 ? 0 : index > len ? len : index;

  // Find the line the caret belongs to: the LAST line whose `start` <= idx.
  // (Lines are emitted in source order with monotonically non-decreasing
  // `start`.) A caret index sitting on the break character (the '\n' or the
  // wrap ' ') stays at the END of the preceding line, which falls out naturally
  // since the next line's `start` is strictly greater than that break index.
  let lineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].start <= idx) lineIdx = i;
    else break;
  }

  const line = lines[lineIdx];
  // Column within the line, clamped to the line's visible text length (so a
  // caret on the trailing break char renders at the line end).
  let col = idx - line.start;
  if (col < 0) col = 0;
  if (col > line.text.length) col = line.text.length;

  const prefix = line.text.slice(0, col);
  const advance = prefix === '' ? 0 : font.getAdvanceWidth(prefix, fontSize);

  return {
    x: line.x + advance,
    y: line.baseline - fontSize,
    height: fontSize,
  };
}
