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
  mix,
} from './materialReaction.js';

export { materialCategory, materialSheetHex, luminance };

// ── Default material set (no org context in Studio yet). Acrylic hexes share
// ids with the acrylic swatch-photo catalog (src/lib/materialSwatches.js) so the
// control can borrow their photos; two common laser plywoods added. category:
// 'lighten' (acrylic/plastic frosts) | 'burn' (wood darkens). ──────────────────
export const DEFAULT_PREVIEW_MATERIALS = [
  { id: 'green-fluorescent', name: 'Green Fluorescent', type: 'acrylic', hex: '#E6E954', category: 'lighten' },
  // Fluorescent pink (industry 9095) + orange (9096) stock. No swatch photos yet
  // — the control's PHOTO_BY_ID lookup falls back to the hex. Face hexes follow
  // the green calibration (the sheet as it reads under ambient light: a lifted,
  // slightly washed shade of the dye — cf. fluorescent-pink references
  // #FF69B4/#FF5AAC and neon/safety orange #FF5F1F–#FF6700). `appearance.
  // emissiveHex` is the DYE's Stokes-shifted emission (what edges/grooves glow):
  // 9095 emits a deeper magenta-red, 9096 an orange-red — fluorescent dyes
  // re-emit red-shifted from what the face transmits (LSC model, ADR 0003).
  { id: 'pink-fluorescent', name: 'Pink Fluorescent', type: 'acrylic', hex: '#FF5FA2', category: 'lighten', appearance: { emissiveHex: '#FF2D78' } },
  { id: 'orange-fluorescent', name: 'Orange Fluorescent', type: 'acrylic', hex: '#FF6A1D', category: 'lighten', appearance: { emissiveHex: '#FF4500' } },
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

// The layer's OWN sheet: its panel's catalog material (panel.materialId, the
// per-panel choice) when one is set, else null → callers fall back to the
// document-level lens material. Inlined lookup (not three3d/panelAppearance's
// materialById) to keep this module import-cycle-free — panelAppearance imports
// DEFAULT_PREVIEW_MATERIALS from here.
function panelMaterialForLayer(layer, panels, materials) {
  if (!layer || !Array.isArray(panels) || panels.length === 0) return null;
  const panel = panels.find((p) => p && p.id === layer.panelId);
  const id = panel?.materialId;
  if (!id) return null;
  const catalog = Array.isArray(materials) ? materials : DEFAULT_PREVIEW_MATERIALS;
  return catalog.find((m) => m && m.id === id) || null;
}

// The EFFECTIVE catalog-material id a layer previews on: its panel's OWN material
// (panel.materialId) when set, else — in the Material lens — the document lens
// material, else null (unknown). This is the SAME precedence resolveCanvasColor
// shades with (`panelMaterialForLayer(...) || colorView.material`), surfaced as an
// id so the Highlight Hold material-aware default (Raster Etch S4, #83) reads the
// EFFECTIVE material, not panel-only — an Auto panel previewed under a mirror lens
// then resolves as mirror (the safe direction), and the displayed default can
// never drift from what is shaded on canvas. The lens material is preview-only, so
// it only contributes in Material-lens mode.
export function effectiveMaterialId(layer, { panels, materials, colorView } = {}) {
  const own = panelMaterialForLayer(layer, panels, materials);
  if (own && own.id) return own.id;
  const lens = colorView && colorView.mode === 'material' ? colorView.material : null;
  return lens && lens.id ? lens.id : null;
}

// ── Cut/score visibility bias (preview-only, NOT accurate) ───────────────────
// An honest reaction render can leave a faint score (or a kerf on a dark sheet)
// near-invisible. `bias` ∈ [-1, 1] (0 = accurate) pushes ONLY cut + score marks
// darker (negative) or lighter (positive). Capped below a full mix so a biased
// mark never collapses to pure black/white. The control shows a "Not an
// accurate representation" warning whenever bias ≠ 0.
const MARK_VISIBILITY_MAX_MIX = 0.8;
export function applyMarkVisibility(hex, bias) {
  const b = Number.isFinite(bias) ? Math.max(-1, Math.min(1, bias)) : 0;
  if (b === 0) return hex;
  return mix(hex, b < 0 ? '#000000' : '#ffffff', Math.abs(b) * MARK_VISIBILITY_MAX_MIX);
}

// ── The single canvas entry point ────────────────────────────────────────────
// operation mode → delegates BYTE-IDENTICALLY to resolveExportColor (the canvas
// looks exactly as it does today). material mode → the shading rules above,
// against the layer's OWN sheet: its panel's material first (per-panel choice),
// else the document-level lens material, else (nothing chosen anywhere) the
// operation color so the canvas never blanks. `colorView.markContrast` biases
// cut/score visibility (applyMarkVisibility); engrave/pen stay accurate.
export function resolveCanvasColor(layer, { operations, outputMode, colorView, panels, materials } = {}) {
  if (!colorView || colorView.mode !== 'material') {
    return resolveExportColor(layer, { operations, outputMode });
  }
  const sheet = panelMaterialForLayer(layer, panels, materials) || colorView.material;
  if (!sheet) {
    return resolveExportColor(layer, { operations, outputMode });
  }
  const sheetHex = materialSheetHex(sheet);
  const category = materialCategory(sheet);
  const process = resolveLayerProcess(layer, operations) || 'cut';
  const opColor = resolveExportColor(layer, { operations, outputMode });
  const stroke = materialStrokeColor(sheetHex, category, process, opColor);
  if (process === 'cut' || process === 'score') {
    return applyMarkVisibility(stroke, colorView.markContrast ?? 0);
  }
  return stroke;
}

// ── Off-sheet dimming (Material lens, per-panel materials) ───────────────────
// The 2D canvas superimposes EVERY panel's layers on ONE background — the
// document-lens sheet. With per-panel materials, a layer whose own sheet
// differs from that background draws in ANOTHER sheet's reaction colors (e.g.
// an orange-fluorescent panel's #FF4500 score lines over a yellow background),
// which reads as the background sheet carrying the wrong marks. Dim those
// off-sheet marks so full-strength marks always belong to the sheet on screen.
export const OFF_SHEET_DIM = 0.25;

// The opacity factor for one layer under the current lens: OFF_SHEET_DIM when
// the layer's OWN panel material is known AND differs from the lens (background)
// material, else 1. Outside the Material lens — or when either sheet is
// unresolved (no doc-lens material picked, or the layer's panel has no material
// of its own) — always 1, so every existing view is byte-identical.
export function offSheetDimFactor(layer, { colorView, panels, materials } = {}) {
  if (!colorView || colorView.mode !== 'material' || !colorView.material) return 1;
  const own = panelMaterialForLayer(layer, panels, materials);
  if (!own) return 1;
  return own.id === colorView.material.id ? 1 : OFF_SHEET_DIM;
}

// The background the canvas should paint: the sheet hex in material mode, else
// the document's own background.
export function sheetBackground(colorView, fallbackBg) {
  if (colorView && colorView.mode === 'material' && colorView.material) {
    return materialSheetHex(colorView.material);
  }
  return fallbackBg;
}
