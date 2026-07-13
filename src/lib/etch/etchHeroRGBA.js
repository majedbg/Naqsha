// etchHeroRGBA — the materialization behind the 1:1 "what etches" preview hero
// (Raster Etch S9, #88; CONTEXT.md → Etch / Highlight Hold). Kept in lib (not the
// hero component) so it's a pure, directly-testable seam — the no-drift invariant
// test asserts its output against what the SVG export embeds.
//
// SINGLE SOURCE (grilled decision 4, the WYSIWYG invariant): the hero paints the
// SAME resolved `etchBitmap` object useCanvas caches and svgExport embeds
// (encodeEtchPNG). This function materializes it through the very same
// `bitmapToRGBA` the p5 canvas uses — so the hero's dots are bit-for-bit what
// exports — then composites the Highlight Hold band's preview wash ON TOP for
// display only.

import { bitmapToRGBA } from './etchBitmap.js';

// Highlight Hold preview wash — the SAME soft violet the canvas overlay paints on
// the held band (useCanvas.js S4/#83: rgba 124,92,246,72). Preview-only; it never
// touches bitmap.bits, so the exported bytes are unchanged.
const HOLD_WASH = [124, 92, 246, 72];

/**
 * Materialize the resolved Etch bitmap into the RGBA the hero paints. Returns the
 * pre-composite `base` (EXACTLY `bitmapToRGBA` — the buffer the p5 canvas paints
 * and, bit-for-bit, what encodeEtchPNG embeds) AND the display `data` (the base
 * with the Highlight Hold wash composited on top of the held band). The wash only
 * ever lands on held PAPER pixels — Highlight Hold guarantees zero dots above the
 * cutoff, so no etched dot is ever recoloured (the exported dot pattern is intact).
 *
 * @param {{bits: Uint8Array, held?: Uint8Array, width: number, height: number}} bitmap
 * @param {string} color engrave colour hex
 * @returns {{ base: Uint8ClampedArray, data: Uint8ClampedArray, width: number, height: number, heldCount: number }}
 */
export function etchHeroRGBA(bitmap, color) {
  const { held, width, height } = bitmap;
  const base = bitmapToRGBA(bitmap, color); // the one, canonical render materialization
  const data = new Uint8ClampedArray(base); // display copy — base stays pristine
  let heldCount = 0;
  if (held) {
    const [wr, wg, wb, wa] = HOLD_WASH;
    for (let j = 0; j < held.length; j++) {
      if (!held[j]) continue;
      heldCount++;
      // Source-over the wash onto the (transparent paper) held pixel, matching the
      // canvas overlay's alpha blend. Dot pixels are never held, so they're untouched.
      const i = j * 4;
      const sa = wa / 255;
      const da = data[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa === 0) continue;
      data[i] = (wr * sa + data[i] * da * (1 - sa)) / oa;
      data[i + 1] = (wg * sa + data[i + 1] * da * (1 - sa)) / oa;
      data[i + 2] = (wb * sa + data[i + 2] * da * (1 - sa)) / oa;
      data[i + 3] = oa * 255;
    }
  }
  return { base, data, width, height, heldCount };
}
