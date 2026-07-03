// colorBins — deterministic clustering of an extracted palette's exact hexes
// into a small set of NAMED, human-pickable colour bins (S10 facet filter,
// issue #59; PRD story 18/36 "search by colour").
//
// Why bin at all: PaletteExtractor yields arbitrary #rrggbb values; filtering
// by exact hex is useless (no two photos share one). The colour facet instead
// offers ~12 swatch chips (red…gray) and an entry matches a chip when ANY of
// its palette colours falls in that bin. Binning is PURE + deterministic so the
// facet is stable and unit-testable, and so a future server-side path can
// replicate the exact same buckets (a generated column / SQL binning — the one
// facet that does NOT map to a stored column; see facets.js server-seam note).
//
// Method (achromatic-FIRST, then hue): saturation/lightness thresholds peel off
// black / white / gray BEFORE hue bucketing, so a near-black with a residual
// hue never leaks into a colour bin. Every boundary is an explicit named
// constant so the seams are testable.

// ── Bin catalogue (ordered; drives the facet-rail chip order) ────────────────
// `swatch` is a representative hex for the chip preview only — never used for
// binning (binning is computed from the entry's real palette).
export const COLOR_BINS = [
  { id: 'red', label: 'Red', swatch: '#d13438' },
  { id: 'orange', label: 'Orange', swatch: '#e07b39' },
  { id: 'yellow', label: 'Yellow', swatch: '#e3c53a' },
  { id: 'green', label: 'Green', swatch: '#4a9e4a' },
  { id: 'teal', label: 'Teal', swatch: '#3aa5a5' },
  { id: 'blue', label: 'Blue', swatch: '#3a6ea5' },
  { id: 'purple', label: 'Purple', swatch: '#7d4aa5' },
  { id: 'pink', label: 'Pink', swatch: '#c74a9e' },
  { id: 'brown', label: 'Brown', swatch: '#7a5230' },
  { id: 'black', label: 'Black', swatch: '#1a1a1a' },
  { id: 'white', label: 'White', swatch: '#f5f5f5' },
  { id: 'gray', label: 'Gray', swatch: '#9a9a9a' },
];

const BIN_IDS = new Set(COLOR_BINS.map((b) => b.id));

/** Bin id → catalogue entry (label + swatch), or null for an unknown id. */
export function colorBin(id) {
  return COLOR_BINS.find((b) => b.id === id) || null;
}

// ── Thresholds (named seams — tested at the exact boundary) ──────────────────
// Achromatic gates, checked in this order:
const BLACK_MAX_L = 0.12; // l ≤ this → black, whatever the (weak) hue
const WHITE_MIN_L = 0.9; //  l ≥ this AND low sat → white
const WHITE_MAX_S = 0.2; //  saturation ceiling for "white" (a pale-but-saturated
//                           tint like l=.73 s=.8 is a colour, not white; a true
//                           off-white like #f7f6f4 sits ~0.16 and reads white)
const GRAY_MAX_S = 0.12; //  s < this → achromatic (gray, unless already b/w)
// Brown = a dark, sufficiently-saturated orange/red.
const BROWN_MAX_L = 0.4; //  l < this in the orange/red hue band → brown
const BROWN_HUE_MIN = 10;
const BROWN_HUE_MAX = 45; // [10,45) degrees

// Hue band edges (degrees). Half-open [lo, hi); red wraps around 360.
const HUE_BANDS = [
  { id: 'orange', lo: 15, hi: 45 },
  { id: 'yellow', lo: 45, hi: 70 },
  { id: 'green', lo: 70, hi: 160 },
  { id: 'teal', lo: 160, hi: 200 },
  { id: 'blue', lo: 200, hi: 250 },
  { id: 'purple', lo: 250, hi: 290 },
  { id: 'pink', lo: 290, hi: 345 },
  // red = [345,360) ∪ [0,15) — handled as the wrap-around default.
];

/** '#rrggbb' → {r,g,b} in 0..255, or null if unparseable (defensive). */
function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** {r,g,b} 0..255 → {h:0..360, s:0..1, l:0..1}. Standard conversion. */
function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

/**
 * A validated '#rrggbb' → one COLOR_BINS id. Deterministic; achromatic bins are
 * resolved before hue. Returns null for an unparseable value (dropped, never
 * mis-binned).
 */
export function binColor(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const { h, s, l } = rgbToHsl(rgb);

  // Achromatic first — dark, light, or desaturated.
  if (l <= BLACK_MAX_L) return 'black';
  if (l >= WHITE_MIN_L && s <= WHITE_MAX_S) return 'white';
  if (s < GRAY_MAX_S) return 'gray';

  // Brown: a dark, saturated orange/red reads as brown, not orange.
  if (h >= BROWN_HUE_MIN && h < BROWN_HUE_MAX && l < BROWN_MAX_L) return 'brown';

  // Chromatic hue bands; red is the wrap-around default.
  for (const band of HUE_BANDS) {
    if (h >= band.lo && h < band.hi) return band.id;
  }
  return 'red';
}

/**
 * Entity → the DISTINCT set of colour-bin ids present in its palette, in
 * COLOR_BINS order. Empty palette (or all-unparseable) → []. This is the value
 * the colour facet matches against (OR within the facet).
 */
export function entryColorBins(entity) {
  const palette = entity?.palette;
  if (!Array.isArray(palette) || palette.length === 0) return [];
  const seen = new Set();
  for (const sw of palette) {
    const id = binColor(sw?.hex);
    if (id && BIN_IDS.has(id)) seen.add(id);
  }
  return COLOR_BINS.filter((b) => seen.has(b.id)).map((b) => b.id);
}
