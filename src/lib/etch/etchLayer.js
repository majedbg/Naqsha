// etchLayer — the persistent `etch` layer type (Raster Etch S1, issue #80).
//
// An Etch is the RASTER counterpart to Naqsha's vector layers (pattern / import
// / text / motif): it turns an imported photograph into a laser engraving by
// mapping tonal values to a 1-bit dot field that is embedded in the SVG as a
// bitmap, never vectorized (ADR-0006). An Etch always resolves to the ENGRAVE
// role and references a normal engrave Operation — no new process type; DPI
// lives on the layer (grilled decision 6). CONTEXT.md → Raster Etch is the
// binding glossary (Etch / Etch Stack / Stage / Highlight Hold); the Etch Stack,
// Stages, tone controls, and Highlight Hold arrive in S2+ — this spine carries a
// fixed internal global threshold only.
//
// This module is the PURE layer-model seam: the type tag, the DPI default and
// its physical→pixel mapping, and the params factory. The pixel machinery
// (source→1-bit) is etchProcess; the DOM/canvas seam is etchSource; export is
// etchBitmap + svgExport. Kept DOM-free so it runs in node, a Web Worker, and
// under vitest identically (matching the extraction suites' discipline).

import { MM_PER_IN } from '../plotter/constants.js';
import { createHoldParams } from './etchHold.js';

/** Layer `type` discriminator for an Etch — parallels 'import' / 'text' / 'motif'. */
export const ETCH_TYPE = 'etch';

// Per-Etch engrave resolution in dots per inch. 254 DPI = exactly 10 dots/mm — a
// round metric density and a common laser-engraving default (grilled decision
// 6). Lives on the layer, not the Operation, so two Etches on one engrave
// Operation can etch at different densities.
export const DEFAULT_ETCH_DPI = 254;

/** True for a persistent Etch layer. Cheap discriminator; safe on null. */
export function isEtchLayer(layer) {
  return !!layer && layer.type === ETCH_TYPE;
}

/**
 * Physical extent → exported bitmap pixel count along one axis:
 *   pixels = round(mm / 25.4 × DPI)
 * This is what makes DPI drive the exported bitmap's dimensions (issue #80 AC):
 * the embedded 1-bit `<image>` carries `physical size × DPI` pixels so the laser
 * threshold-passes it at the intended dot density. 254 DPI over 100 mm → 1000 px.
 *
 * @param {number} physicalMm physical extent in millimeters
 * @param {number} [dpi=DEFAULT_ETCH_DPI] dots per inch
 * @returns {number} integer pixel count (≥ 1 for any positive input)
 */
export function etchPixelDims(physicalMm, dpi = DEFAULT_ETCH_DPI) {
  if (!(physicalMm > 0) || !(dpi > 0)) return 0;
  return Math.max(1, Math.round((physicalMm / MM_PER_IN) * dpi));
}

/**
 * Build the `params` object for a new Etch layer. Hybrid source storage (grilled
 * decision 7): a GUEST/offline Etch holds its capped (≤~1024px) `source` data-URI
 * ON the layer; a SIGNED-IN Etch holds a `sourcePath` pointing at the private
 * `etch-sources` bucket instead (S7, #86 — no base64 in the saved design), and
 * the source is downloaded on load. A layer carries one or the other, never both.
 * `dpi` defaults to DEFAULT_ETCH_DPI. `sourceWidth` / `sourceHeight` record the
 * stored source's pixel size so consumers need not re-decode to know it.
 *
 * `stack` is the Etch Stack (S2, #81): the ordered, reorderable array of Stages
 * the luma field flows through before screening. It is DOCUMENT state persisted
 * on the layer (order round-trips through save/load). Defaults to empty — a new
 * Etch screens at the plain S1 threshold until a Stage is added.
 *
 * `hold` is the Highlight Hold (S4, #83): the fixed terminal clamp's params
 * `{ enabled, cutoff }`, NOT a Stage (it lives here, never in `stack`). Defaults
 * to AUTO (`enabled: null`) so the material-aware default resolves at use-time
 * once the Etch's panel — hence its material — is known (mirror → on, else off).
 */
export function createEtchParams({ source, sourcePath, sourceWidth = 0, sourceHeight = 0, dpi = DEFAULT_ETCH_DPI, stack, hold } = {}) {
  return {
    source: source || null,
    sourcePath: sourcePath || null,
    sourceWidth,
    sourceHeight,
    dpi: dpi > 0 ? dpi : DEFAULT_ETCH_DPI,
    stack: Array.isArray(stack) ? stack : [],
    hold: hold && typeof hold === 'object' ? hold : createHoldParams(),
  };
}
