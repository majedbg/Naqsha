// Material Preview — the "Material" color-view lens (grilled 2026-06-20; spec at
// docs/material-preview-plan.md).
//
// A PREVIEW-ONLY lens: it recolors the CANVAS to look like the design cut on a
// real sheet, and never touches export. `resolveCanvasColor` is the single entry
// the canvas calls: in "operation" mode it delegates BYTE-IDENTICALLY to
// fabrication's resolveExportColor (today's behavior); in "material" mode it
// overlays the sheet/process shading rules below. svgExport + resolveExportColor
// stay untouched, so cut files always emit the locked LightBurn convention.
//
// Render model (material mode):
//   • the artboard background becomes the material's sheet hex (the stock);
//   • cut   → a contrast-aware contour (charcoal on light sheets, light edge on
//             dark sheets) so a full cut always reads;
//   • score → the sheet shifted in the material's direction (acrylic lightens =
//             frosted; wood darkens = burn);
//   • engrave → the same direction, stronger (it removes more material);
//   • pen   → keeps the operation's own ink color (ink sits ON the sheet);
//   with a minimum-contrast floor so a mark never vanishes into its sheet.

import { resolveExportColor } from './fabrication.js';
import { resolveLayerProcess } from './operations.js';
// The shared, three.js-FREE reaction core: the SINGLE source of truth for how a
// mark reacts on a sheet (frost on acrylic, char on wood). The 2D lens below and
// the 3D mark path both delegate here, so they agree (L3). luminance/category/
// sheetHex are re-exported to keep this module's public surface stable for its
// importers (ColorViewControl, useColorView, the test).
import {
  materialCategory,
  materialSheetHex,
  luminance,
  reactionStrokeColor,
} from './materialReaction.js';

export { materialCategory, materialSheetHex, luminance };

// ── Default material set (no org context in Studio yet). Acrylic hexes share
// ids with the acrylic swatch-photo catalog (src/lib/materialSwatches.js) so the
// control can borrow their photos; two common laser plywoods added. category:
// 'lighten' (acrylic/plastic frosts) | 'burn' (wood darkens). ──────────────────
export const DEFAULT_PREVIEW_MATERIALS = [
  { id: 'green-fluorescent', name: 'Green Fluorescent', type: 'acrylic', hex: '#E6E954', category: 'lighten' },
  { id: 'clear', name: 'Clear', type: 'acrylic', hex: '#E7E7E7', category: 'lighten' },
  { id: 'turquoise-opaque', name: 'Turquoise Opaque', type: 'acrylic', hex: '#61DBC2', category: 'lighten' },
  { id: 'blue-translucent', name: 'Blue Translucent', type: 'acrylic', hex: '#0082CD', category: 'lighten' },
  { id: 'gotham-black-pearl', name: 'Gotham Black Pearl', type: 'acrylic', hex: '#10130E', category: 'lighten' },
  { id: 'birch-plywood', name: 'Birch Plywood', type: 'plywood', hex: '#D8B988', category: 'burn' },
  { id: 'walnut-plywood', name: 'Walnut Plywood', type: 'plywood', hex: '#6B4A2B', category: 'burn' },
];

// The 2D flat stroke color for one process on a given sheet/category. Delegates
// to the shared reaction core (frost toward a HUE-PRESERVING brightened sheet,
// burn toward a warm near-black, score < engrave < cut, plus the legibility
// shadow-fallback for near-extreme sheets). `opColor` is the operation's own
// export color, used only for the pen (ink) process. Kept as the public name
// `resolveCanvasColor` (and other importers) call.
export function materialStrokeColor(sheetHex, category, process, opColor) {
  return reactionStrokeColor(sheetHex, category, process, opColor);
}

// ── The single canvas entry point ────────────────────────────────────────────
// operation mode → delegates BYTE-IDENTICALLY to resolveExportColor (the canvas
// looks exactly as it does today). material mode → the shading rules above.
export function resolveCanvasColor(layer, { operations, outputMode, colorView } = {}) {
  if (!colorView || colorView.mode !== 'material' || !colorView.material) {
    return resolveExportColor(layer, { operations, outputMode });
  }
  const sheetHex = materialSheetHex(colorView.material);
  const category = materialCategory(colorView.material);
  const process = resolveLayerProcess(layer, operations) || 'cut';
  const opColor = resolveExportColor(layer, { operations, outputMode });
  return materialStrokeColor(sheetHex, category, process, opColor);
}

// The background the canvas should paint: the sheet hex in material mode, else
// the document's own background.
export function sheetBackground(colorView, fallbackBg) {
  if (colorView && colorView.mode === 'material' && colorView.material) {
    return materialSheetHex(colorView.material);
  }
  return fallbackBg;
}
