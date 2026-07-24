// Engrave-ability warnings for a text node (plan §4 / §6.4). The dominant
// failure mode for engraved text is "too small": below a clean-engrave floor the
// glyph counters (the holes in o/a/e/B) drop under the laser kerf and burn shut,
// and fine strokes lose definition. We surface a single, actionable warning from
// the physical cap-height — measured at the EFFECTIVE size, so a single line
// shrunk by the width-fit cap (plan §5) is judged at what actually engraves.
//
// Exact per-counter / sub-kerf geometry analysis (and bed-bounds clipping, which
// the canvas BedOverlay already visualizes) are deferred; cap-height is the
// tractable, fabrication-meaningful proxy for "thin text".

import { capHeightPx, effectiveFontSize } from './fitText.js';
import { pxToUnit } from '../units.js';

// Clean-engrave floor for capital-letter height. Below ~1.5mm, laser-engraved
// counters and fine strokes degrade on typical hardware.
export const MIN_CAP_HEIGHT_MM = 1.5;

// The double-line caution shown for an OUTLINE font in OUTLINE engrave mode. Its
// glyph strokes are closed contours, so the tool traces BOTH edges of every
// stroke — a doubled path. This is intrinsic to outline fonts (uploaded or
// bundled); the escape hatches are Fill mode or a single-line "Engraving" font.
export const DOUBLE_LINE_MESSAGE =
  'This is an outline font: in Outline engrave mode the tool traces both edges ' +
  'of every stroke, so each stroke comes out as a DOUBLE line. Switch to Fill, ' +
  'or pick an Engraving (single-line) font, for a true single stroke.';

/**
 * @param {{ text?: string, fontSize: number, lineMode?: string, box?: {w:number},
 *           renderMode?: 'fill'|'outline' }} node
 * @param {import('opentype.js').Font|null} font  resolved font (null → cannot measure)
 * @param {{ minCapHeightMm?: number, fontKind?: 'outline'|'single-line' }} [opts]
 *   `fontKind` gates the double-line caution: it fires only for an OUTLINE font
 *   (never for a single-line engraving font). Omitted → no double-line warning.
 * @returns {Array<{ level: 'warn', code: string, message: string }>}
 */
export function textEngraveWarnings(node, font, { minCapHeightMm = MIN_CAP_HEIGHT_MM, fontKind } = {}) {
  if (!node || !font || !node.text) return [];
  const size = effectiveFontSize(node, font);
  const capMm = pxToUnit(capHeightPx(font, size), 'mm');
  if (!(capMm > 0)) return [];

  const warnings = [];
  if (capMm < minCapHeightMm) {
    warnings.push({
      level: 'warn',
      code: 'min-size',
      message:
        `Cap height ≈${capMm.toFixed(1)}mm is below the ~${minCapHeightMm}mm clean-engrave ` +
        `minimum — counters may burn shut and fine strokes lose definition.`,
    });
  }
  // Outline-in-outline-mode → double line. Single-line fonts are exempt (that's
  // their whole point); an unknown kind stays silent (conservative).
  if (node.renderMode === 'outline' && fontKind === 'outline') {
    warnings.push({ level: 'warn', code: 'double-line', message: DOUBLE_LINE_MESSAGE });
  }
  return warnings;
}
