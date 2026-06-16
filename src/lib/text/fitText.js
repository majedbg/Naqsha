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
