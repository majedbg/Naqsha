// etchInstance — the canvas "instance" for an Etch layer, and the SINGLE point
// where the 1-bit buffer is bound to both consumers (Raster Etch S1, issue #80;
// grilled decision 4, the WYSIWYG single-source invariant).
//
// Naqsha's canvas keeps a per-layer instance that both draws on the p5 canvas
// and feeds the SVG export. For a vector layer that instance is a PatternClass;
// for an Etch it is this plain object carrying the ONE EtchBitmap. useCanvas
// draws by reading `instance.etchBitmap.bits` (via bitmapToRGBA); svgExport
// embeds by reading `instance.etchBitmap.bits` (via encodeEtchPNG). Because both
// paths dereference the SAME object built here — never a copy, never a
// recompute — what renders is bit-for-bit what exports. The
// `supportsEtchExport` flag is what svgExport duck-types on to take the
// embedded-bitmap branch instead of the vector `<path>` path.

/**
 * @param {{bits: Uint8Array, width: number, height: number}} etchBitmap the
 *   single-source 1-bit buffer produced by etchProcess / the worker bridge.
 * @returns {{ supportsEtchExport: true, etchBitmap: object }}
 */
export function makeEtchInstance(etchBitmap) {
  return { supportsEtchExport: true, etchBitmap };
}
