// etchProcess — the PURE source→1-bit conversion at the heart of the Etch
// (Raster Etch S1, issue #80). Reuses the extraction pixel helpers verbatim
// (grilled decision 1 — do NOT reimplement grayscale/threshold): `toGrayField`
// computes the Rec.601 luma field, `globalMask` cuts it at a single global
// threshold. `globalMask` already returns a `Uint8Array` of one byte per pixel
// (1 = ink / etched dot, 0 = paper) — that array IS the canonical 1-bit buffer,
// the single source of truth that both the p5 canvas render and the SVG export
// consume unchanged (grilled decision 4, the WYSIWYG invariant). Materializing
// the buffer twice, or re-thresholding at export, would break WYSIWYG — so this
// function is the ONLY place the cut happens.
//
// Pure typed-array math, no DOM / no canvas, so it runs identically on the main
// thread, in a Web Worker (etch.worker), and headless under vitest. Tone/Levels,
// dithering, halftone, paper, and Highlight Hold are NOT here — S1 is a fixed
// internal global threshold only; the Etch Stack of Stages arrives in S2+.

import { toGrayField, globalMask } from '../extraction/preprocess.js';

/**
 * The fixed internal cut for the S1 spine. Luma < ETCH_THRESHOLD etches (dark =
 * ink), matching the extraction default and `vectorizer.thresholdImage(…,128)`.
 * There are no tone controls this slice; S2+ replaces this with the Etch Stack.
 */
export const ETCH_THRESHOLD = 128;

/**
 * @typedef {{ bits: Uint8Array, width: number, height: number }} EtchBitmap
 *   `bits[y*width + x]` is 1 (etched dot) or 0 (paper). This object is the
 *   single-source buffer: render and export both read `bits`.
 */

/**
 * Convert a decoded RGBA image to the canonical 1-bit Etch bitmap via a plain
 * global threshold. The returned `bits` is `globalMask`'s own array — no copy,
 * no second traversal — so it is literally the single source of truth.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 * @param {{ threshold?: number, invert?: boolean }} [opts]
 * @returns {EtchBitmap}
 */
export function etchSourceToBitmap(imageData, { threshold = ETCH_THRESHOLD, invert = false } = {}) {
  const field = toGrayField(imageData);
  const bits = globalMask(field, threshold, invert);
  return { bits, width: field.width, height: field.height };
}
