// Pure: decide single-line vs multi-line for a dragged text box, plus the
// initial font size and wrap width.
//
// DECISION RULE (plan): box taller-than-or-equal-to wide (h >= w) => multi-line
// paragraph text wrapped to the box width at a default font size; box wider than
// tall (h < w) => a single line auto-fit so the glyphs fill the box height.

/**
 * @param {{ w: number, h: number }} box  dragged box dimensions in px
 * @param {{ defaultFontSize?: number, minFontSize?: number }} [opts]
 * @returns {{ lineMode: 'single'|'multi', fontSize: number, wrapWidth: number|null }}
 */
export function fitDraggedBox({ w, h }, { defaultFontSize = 48, minFontSize = 6 } = {}) {
  if (h >= w) {
    return {
      lineMode: 'multi',
      fontSize: Math.max(defaultFontSize, minFontSize),
      wrapWidth: w,
    };
  }
  return {
    lineMode: 'single',
    fontSize: Math.max(h, minFontSize),
    wrapWidth: null,
  };
}

/**
 * Single-line width-fit safeguard (plan §5). The stored `fontSize` is the
 * height-fit; this returns min(heightFit, widthFit) so a long single line
 * shrinks to stay inside the box's right edge instead of bursting past it. The
 * cap applies ONLY to single-line AREA boxes (lineMode 'single' with box.w > 0):
 * multi-line wraps (no burst) and point text (box.w 0) grows freely. Linear
 * because opentype advance scales with fontSize, so widthFit = box.w / advance(text, 1).
 *
 * @param {{ text?: string, fontSize: number, lineMode?: string, box?: {w:number} }} node
 * @param {import('opentype.js').Font} font  resolved opentype.js font
 * @param {{ minFontSize?: number }} [opts]
 * @returns {number} the effective font size to render/export/measure with.
 */
export function effectiveFontSize({ text, fontSize, lineMode, box } = {}, font, { minFontSize = 6 } = {}) {
  if (lineMode !== 'single' || !text || !font) return fontSize;
  const w = box?.w ?? 0;
  if (!(w > 0)) return fontSize;
  const unit = font.getAdvanceWidth(text, 1); // advance at fontSize 1; linear in size
  if (!(unit > 0)) return fontSize;
  const widthFit = w / unit;
  if (widthFit >= fontSize) return fontSize; // already fits — no shrink
  return Math.max(widthFit, minFontSize);
}

/**
 * Cap-height in px for a font at a given size (plan §4 physical readout). Uses
 * the OS/2 sCapHeight metric scaled by the em; falls back to a typical 0.7 sans
 * ratio when the metric is absent. Linear in fontSize.
 *
 * @param {import('opentype.js').Font} font
 * @param {number} fontSize px
 * @returns {number} cap height in px (0 for a missing font / zero size)
 */
export function capHeightPx(font, fontSize) {
  if (!font || !fontSize) return 0;
  const upm = font.unitsPerEm || 1000;
  const cap = font.tables?.os2?.sCapHeight;
  const ratio = cap ? cap / upm : 0.7;
  return fontSize * ratio;
}
