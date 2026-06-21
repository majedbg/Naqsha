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

// ── Default material set (no org context in Studio yet). Acrylic hexes reuse the
// ITP Camp swatch catalog (src/kits/itpCampMaterials.js — same ids, so the
// control can borrow their photos); two common laser plywoods added. category:
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

const NEUTRAL_SHEET = '#C9C2B5';
const CUT_DARK = '#1A1A1A';
const CUT_LIGHT = '#F2F2F2';
// Score/engrave are a MIX toward a fixed extreme so engrave (a larger mix) can
// never cross below score in the mark direction — additive shading + a contrast
// floor inverted that ordering near the luminance ceiling (e.g. a frost on
// already-bright fluorescent green). Frost mixes toward white; burn toward a
// warm near-black.
const FROST_TARGET = '#ffffff';
const BURN_TARGET = '#0e0a06';
const MIX_SCORE = 0.45;
const MIX_ENGRAVE = 0.72;
// Below this mark/sheet separation the in-direction mark is effectively
// invisible (sheet sits at the target extreme — white acrylic / near-black wood);
// fall back to a faint readable contour instead.
const MIN_VISIBLE = 0.06;
const FAINT_ON_LIGHT = '#9AA0A6';
const FAINT_ON_DARK = '#C9C9C9';

// Named-color → hex fallback for org materials whose `color` is free text
// ('clear', 'natural', …) rather than a hex. Keys are lowercased.
const NAME_HEX = {
  clear: '#E7E7E7', frosted: '#E7E7E7', white: '#F2F2F2', black: '#1A1A1A',
  natural: '#D8B988', birch: '#D8B988', maple: '#E4CFA3', bamboo: '#D9C39A',
  walnut: '#6B4A2B', cherry: '#9A5B3B', oak: '#C9A26B', mdf: '#C9A877',
  red: '#C0392B', green: '#2ECC71', blue: '#2980B9', yellow: '#F1C40F',
  orange: '#E67E22', purple: '#8E44AD', pink: '#E84393', grey: '#9AA0A6',
  gray: '#9AA0A6', silver: '#C7CCD1', gold: '#E0C099',
};

// ── Color helpers (pure; hex in, hex/number out) ─────────────────────────────
function isHex(v) {
  return typeof v === 'string' && /^#?[0-9a-fA-F]{6}$/.test(v.trim());
}
function normHex(v) {
  const s = v.trim();
  return (s[0] === '#' ? s : `#${s}`).toLowerCase();
}
function toRgb(hex) {
  const h = normHex(hex).slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function toHex({ r, g, b }) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
// Relative luminance, 0 (black) … 1 (white). Rec. 601 weights — plenty for
// deciding light-vs-dark sheets and measuring mark/sheet separation.
export function luminance(hex) {
  if (!isHex(hex)) return 0;
  const { r, g, b } = toRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function lumDiff(a, b) {
  return Math.abs(luminance(a) - luminance(b));
}
// Linear blend from `a` to `b` by t ∈ [0,1].
function mix(a, b, t) {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

// ── Material resolution (robust to today's free-text catalog) ────────────────

// 'lighten' (acrylic/plastic) | 'burn' (wood) | 'darken' (neutral fallback).
// burn + darken both darken score/engrave; only lighten goes brighter.
export function materialCategory(m = {}) {
  if (m.category === 'lighten' || m.category === 'burn' || m.category === 'darken') return m.category;
  const t = `${m.type || ''}`.toLowerCase();
  if (/acryl|cast|petg|polyc|plexi|plastic/.test(t)) return 'lighten';
  if (/ply|wood|mdf|veneer|bamboo|birch|walnut|oak|maple|cherry/.test(t)) return 'burn';
  return 'darken';
}

// The hex to paint the sheet with. Prefers an explicit swatch hex, then the
// catalog `color` if it happens to be a hex, then a named-color map, then a
// neutral so an unknown material still previews.
export function materialSheetHex(m = {}) {
  if (isHex(m.hex)) return normHex(m.hex);
  if (isHex(m.swatchHex)) return normHex(m.swatchHex);
  if (isHex(m.color)) return normHex(m.color);
  const key = `${m.color || ''}`.trim().toLowerCase();
  if (NAME_HEX[key]) return NAME_HEX[key];
  return NEUTRAL_SHEET;
}

// The stroke color for one process on a given sheet/category. `opColor` is the
// operation's own export color, used only for the pen (ink) process.
export function materialStrokeColor(sheetHex, category, process, opColor) {
  if (process === 'pen') return opColor || '#000000';
  if (process === 'cut') return luminance(sheetHex) > 0.4 ? CUT_DARK : CUT_LIGHT;
  // score / engrave — mix toward the material's extreme (frost = white, burn =
  // near-black). engrave mixes further, so it is always more pronounced than
  // score and never crosses it (monotonic in the mix fraction).
  const target = category === 'lighten' ? FROST_TARGET : BURN_TARGET;
  const t = process === 'engrave' ? MIX_ENGRAVE : MIX_SCORE;
  const mark = mix(sheetHex, target, t);
  if (lumDiff(sheetHex, mark) >= MIN_VISIBLE) return mark;
  // Sheet sits at the target extreme (white acrylic / near-black wood) — the
  // in-direction mark vanishes; fall back to a faint but readable contour.
  return luminance(sheetHex) > 0.5 ? FAINT_ON_LIGHT : FAINT_ON_DARK;
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
