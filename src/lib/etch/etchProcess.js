// etchProcess — the PURE source→1-bit conversion at the heart of the Etch
// (Raster Etch S1 spine #80, Etch Stack seam #81). Reuses the extraction pixel
// helpers verbatim (grilled decision 1 — do NOT reimplement grayscale/threshold):
// `toGrayField` computes the Rec.601 luma field, `globalMask` cuts it at a single
// global threshold. `globalMask` already returns a `Uint8Array` of one byte per
// pixel (1 = ink / etched dot, 0 = paper) — that array IS the canonical 1-bit
// buffer, the single source of truth that both the p5 canvas render and the SVG
// export consume unchanged (grilled decision 4, the WYSIWYG invariant).
// Materializing the buffer twice, or re-thresholding at export, would break
// WYSIWYG — so this function is the ONLY place the cut happens.
//
// The Etch Stack (S2, #81) drops in as a field→field transform BETWEEN the gray
// field and the cut: image → toGrayField → applyStack(ordered Stages) →
// globalMask → bits. Screening stays the S1 plain global threshold at the tail;
// the Stages only shape the luma field feeding it (Dither/Halftone screening
// Stages arrive in S3/S5). No stack (the default) = exact S1 behaviour, so the
// buffer feeding both consumers is unchanged and the S1 invariant tests stay
// green. Highlight Hold (a fixed terminal clamp, never a Stage) is still future.
//
// Pure typed-array math, no DOM / no canvas, so it runs identically on the main
// thread, in a Web Worker (etch.worker), and headless under vitest.

import { toGrayField, globalMask } from '../extraction/preprocess.js';
import { applyStack } from './etchStage.js';

/**
 * The plain global cut screening applies at the TAIL. Luma < ETCH_THRESHOLD
 * etches (dark = ink), matching the extraction default and
 * `vectorizer.thresholdImage(…,128)`. The Etch Stack Stages shape the luma field
 * BEFORE this cut; the cut itself stays a plain threshold until the Dither/
 * Halftone screening Stages land (S3/S5).
 */
export const ETCH_THRESHOLD = 128;

/**
 * @typedef {{ bits: Uint8Array, width: number, height: number }} EtchBitmap
 *   `bits[y*width + x]` is 1 (etched dot) or 0 (paper). This object is the
 *   single-source buffer: render and export both read `bits`.
 */

/**
 * Convert a decoded RGBA image to the canonical 1-bit Etch bitmap: gray field →
 * ordered Etch Stack Stages → plain global threshold. The returned `bits` is
 * `globalMask`'s own array — no copy, no second traversal — so it is literally
 * the single source of truth both the canvas render and the SVG export read.
 * `stack` is optional and defaults to none: an empty/absent stack is exact S1
 * behaviour (the field passes straight to the cut), keeping the S1 invariant
 * tests green. The `stack` config is plain data, so it travels unchanged to the
 * Web Worker where the heavy pixel work runs.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 * @param {{ threshold?: number, invert?: boolean, stack?: Array }} [opts]
 * @returns {EtchBitmap}
 */
export function etchSourceToBitmap(imageData, { threshold = ETCH_THRESHOLD, invert = false, stack } = {}) {
  const gray = toGrayField(imageData);
  const field = applyStack(gray, stack);
  const bits = globalMask(field, threshold, invert);
  return { bits, width: field.width, height: field.height };
}
