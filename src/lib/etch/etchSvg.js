// etchSvg — the ONE place an Etch departs from Naqsha's vector export (ADR-0006).
// An Etch exports as an embedded 1-bit bitmap `<image>` (base64 data-URI), never
// as vector geometry, so what renders on screen is bit-for-bit what etches;
// cut/score layers stay vector `<path>` so ADR-0001's two-path export is intact.
// The `<image>` is placed across the layer's canvas box in document pixels with
// `image-rendering: pixelated` so the laser threshold-passes each dot at its
// physical size (pixel dims = physical × per-Etch DPI, set upstream on the
// bitmap). Reads the SAME `bitmap.bits` the canvas render draws (grilled
// decision 4).

import { encodeEtchPNG } from './etchBitmap.js';

/**
 * `<image>` markup embedding the 1-bit Etch bitmap at the engrave colour. The
 * caller wraps this in the layer's move/resize/rotate transform (svgExport's
 * wrapLayerTransform), exactly like every other layer. Empty bitmap → '' (the
 * layer contributes nothing, no crash), matching how orphaned layers export.
 *
 * @param {{bits: Uint8Array, width: number, height: number}} bitmap
 * @param {string} color engrave colour hex
 * @param {string} id layer id (SVG element id)
 * @param {number} canvasW document width in px (the image box)
 * @param {number} canvasH document height in px
 * @returns {string}
 */
export function etchImageMarkup(bitmap, color, id, canvasW, canvasH) {
  if (!bitmap || !(bitmap.width > 0) || !(bitmap.height > 0)) return '';
  const href = encodeEtchPNG(bitmap, color);
  return `<image id="${id}" x="0" y="0" width="${canvasW}" height="${canvasH}" preserveAspectRatio="none" style="image-rendering: pixelated" href="${href}"/>`;
}
