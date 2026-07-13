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
// The Etch Stack drops Stages BETWEEN the gray field and the 1-bit output:
//   image → toGrayField → apply FIELD Stages (Tone) in order → SCREEN → bits.
// The SCREEN is the terminal producer and obeys the one-screen rule (S3, #82,
// decision 8; the rule itself lives in etchStage): if an active screening Stage
// (Dither now, Halftone in S5) is present, IT produces the bits; with none (empty
// stack, Tone-only, or all screens bypassed) the plain global-threshold fallback
// (globalMask) runs — byte-identical to the S1/S2 behaviour, so the S1/S2
// invariant tests stay green. Whichever branch runs, `bits` is materialized
// exactly ONCE here — the single source of truth both the canvas render and the
// SVG export read (grilled decision 4, WYSIWYG), now holding WITH dithering too.
//
// Highlight Hold (S4, #83) is the FIXED TERMINAL CLAMP applied AFTER screening —
// never a Stage. We capture the SOURCE luma (toGrayField) BEFORE field Stages
// transform it, then, once `bits` is produced, force every pixel whose source
// luma is at or above the cutoff to paper (applyHighlightHold). Because it runs
// here, inside the one buffer's construction (hence in the worker too), preview
// == export holds automatically and no error-diffusion can leave a dot in a held
// highlight. It returns a `held` mask too, for the preview-only shading overlay.
//
// Pure typed-array math, no DOM / no canvas, so it runs identically on the main
// thread, in a Web Worker (etch.worker), and headless under vitest.

import { toGrayField, globalMask } from '../extraction/preprocess.js';
import { applyFieldStages, activeScreeningStage, screenStage } from './etchStage.js';
import { applyHighlightHold } from './etchHold.js';
import { DEFAULT_ETCH_DPI } from './etchLayer.js';

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
 * `dpi` is the Etch layer's engrave resolution — a screening Stage that measures
 * its cell in physical units (Halftone's LPI frequency) needs it to convert to
 * device pixels (cell = dpi/frequency); it defaults to DEFAULT_ETCH_DPI and is
 * inert for screens already in device px (Dither's `size`, the plain cut).
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 * @param {{ threshold?: number, invert?: boolean, stack?: Array, hold?: {enabled?:boolean, cutoff?:number}, dpi?: number }} [opts]
 * @returns {EtchBitmap & { held: Uint8Array }}
 */
export function etchSourceToBitmap(imageData, { threshold = ETCH_THRESHOLD, invert = false, stack, hold, dpi = DEFAULT_ETCH_DPI } = {}) {
  // Capture the SOURCE luma up front — Highlight Hold clamps on THIS, not the
  // field the Stages shape. applyFieldStages / applyToneField / globalMask never
  // mutate this array in place (Tone returns new fields; globalMask reads only),
  // so it survives intact to the terminal clamp below.
  const gray = toGrayField(imageData);
  const field = applyFieldStages(gray, stack);
  // One-screen rule: an active screening Stage produces the bits; else the plain
  // global cut. Either way `bits` is materialized once — the single-source buffer.
  const screen = activeScreeningStage(stack);
  const bits = screen
    ? screenStage(field, screen, { threshold, invert, dpi })
    : globalMask(field, threshold, invert);
  // Highlight Hold — the fixed terminal clamp (never a Stage), applied AFTER
  // screening on the SOURCE luma. Returns the held mask for the preview overlay;
  // export reads only `bits`, so the mask is preview-only.
  const { held } = applyHighlightHold(bits, gray, hold || {});
  return { bits, held, width: field.width, height: field.height };
}
