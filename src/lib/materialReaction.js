// Material Reaction — the shared, pure, three.js-FREE source of truth for how a
// fabrication mark/line REACTS on a given stock (frost on acrylic, char on wood).
// Lifted from materialPreview.js (2D lens) so the 3D mark path (three3d/markTexture.js)
// can import the SAME reaction core without dragging three into the 2D bundle.
//
// Two render shapes, one reaction core:
//   • reactionStrokeColor — 2D flat stroke (mark sits ON a lit sheet; needs contrast).
//   • reactionEmissive     — 3D emissive tint + glow scale (mark glows; bloom-aware).
// Both derive from the same classification (materialCategory), sheet hex
// (materialSheetHex), and hue-preserving brighten — so 2D and 3D agree (L3).

const NEUTRAL_SHEET = '#C9C2B5';

// ── Reaction constants (lifted from materialPreview.js) ───────────────────────
// Burn (wood) chars toward a warm near-black extreme. Frost (acrylic) brightens
// toward a hue-preserving version of the SHEET itself (see brighten). FROST_TARGET
// (pure white) is the ABSOLUTE frost extreme — used as the legibility-gate
// reference in reactionStrokeColor (so a near-white sheet still falls back), while
// the live frost MIX target is per-sheet so the hue survives (L3). Cut removes the
// most material, then engrave, then score → mix strength score < engrave < cut.
// Mixing toward a fixed extreme is monotonic, so a larger mix never crosses a smaller.
export const FROST_TARGET = '#ffffff';
export const BURN_TARGET = '#0e0a06';
export const MIX = { score: 0.45, engrave: 0.72, cut: 0.92 };
// Below this mark/sheet separation the in-direction mark is effectively invisible
// (the sheet sits at the reaction extreme); all marks switch to a strength-scaled
// shadow etch in the opposite direction so they stay legible and ordered.
export const MIN_VISIBLE = 0.06;
export const SHADOW_SCALE = 0.5;
// Emissive damp for wood: a real burn line is matte char, not a glowing halo. Under
// selection-gated bloom every selected mark glows by construction, so color alone
// can't make wood read matte — the intensity must drop (L4).
export const BURN_GLOW_SCALE = 0.35;

// Named-color → hex fallback for org materials whose `color`/`kind` is free text
// ('clear', 'natural', 'walnut', …) rather than a hex. Keys are lowercased.
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
// Linear blend from `a` to `b` by t ∈ [0,1].
export function mix(a, b, t) {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

// ── HSL (hue-preserving lift) ─────────────────────────────────────────────────
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
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
function hslToRgb({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// Lightness ceiling for frost: below pure white (L=1) so the hue stays SATURATED
// rather than washing out — a fluorescent yellow brightens to a saturated
// yellowish-white, never plain white (L3).
const FROST_LIGHT_CEIL = 0.85;

// Hue-preserving brighten: raise lightness toward FROST_LIGHT_CEIL while holding
// the hue and saturation, so the output is a brighter SHADE OF THE SAME COLOR.
// amount ∈ [0,1]: 0 is identity (returns the normalized input unchanged).
export function brighten(hex, amount = 1) {
  if (!isHex(hex)) return '#ffffff';
  if (amount <= 0) return normHex(hex);
  const { h, s, l } = rgbToHsl(toRgb(hex));
  const targetL = Math.max(l, FROST_LIGHT_CEIL);
  const newL = l + (targetL - l) * Math.min(1, amount);
  return toHex(hslToRgb({ h, s, l: newL }));
}

// 'lighten' (acrylic/plastic frosts toward a brighter hue of itself) |
// 'burn' (wood/ply/mdf chars toward near-black) | 'other' (unknown stock → callers
// fall back to the laser-convention tints; 2D treats it like burn for contrast).
// Accepts a loose material-like object: 2D passes { type|category, hex|color };
// 3D passes panel.substrate { kind, color }. Legacy explicit 'darken' → 'other'.
export function materialCategory(m = {}) {
  if (m.category === 'lighten' || m.category === 'burn' || m.category === 'other') return m.category;
  if (m.category === 'darken') return 'other';
  const t = `${m.type || ''} ${m.kind || ''}`.toLowerCase();
  if (/acryl|cast|petg|polyc|plexi|plastic/.test(t)) return 'lighten';
  if (/ply|wood|mdf|veneer|bamboo|birch|walnut|oak|maple|cherry/.test(t)) return 'burn';
  return 'other';
}

// The hex to paint the stock with. Prefers an explicit swatch hex, then the
// catalog `color` if it happens to be a hex (3D substrate.color lands here), then
// a named-color map, then a neutral so an unknown material still previews.
export function materialSheetHex(m = {}) {
  if (isHex(m.hex)) return normHex(m.hex);
  if (isHex(m.swatchHex)) return normHex(m.swatchHex);
  if (isHex(m.color)) return normHex(m.color);
  const key = `${m.color || m.kind || ''}`.trim().toLowerCase();
  if (NAME_HEX[key]) return NAME_HEX[key];
  return NEUTRAL_SHEET;
}

function lumDiff(a, b) {
  return Math.abs(luminance(a) - luminance(b));
}

// The 2D flat stroke color for one process on a given sheet/category. `opColor` is
// the operation's own export color, used only for the pen (ink) process. lighten
// frosts toward a HUE-PRESERVING brightened version of the sheet (L3); burn/other
// char toward BURN_TARGET. cut mixes furthest, then engrave, then score.
export function reactionStrokeColor(sheetHex, category, process, opColor) {
  if (process === 'pen') return opColor || '#000000';
  const goLighter = category === 'lighten';
  const t = MIX[process] != null ? MIX[process] : MIX.score;

  // Sheet-level legibility GATE (not per-process), measured against the ABSOLUTE
  // reaction extreme (pure-white frost / near-black char): if even the WEAKEST mark
  // can't separate from the sheet there, the sheet sits at the extreme (near-white
  // acrylic can't frost lighter; near-black wood can't burn darker). Render EVERY
  // process as a strength-scaled shadow in the opposite direction so the etch stays
  // legible and ordered. Gating on the white/black extreme (not the hue-preserving
  // target) keeps the original lens's fallback behavior byte-stable — only a truly
  // near-extreme sheet falls back, never a merely-bright saturated one.
  const gateTarget = goLighter ? FROST_TARGET : BURN_TARGET;
  const weakest = mix(sheetHex, gateTarget, MIX.score);
  if (lumDiff(sheetHex, weakest) < MIN_VISIBLE) {
    const shadow = goLighter ? '#000000' : '#ffffff';
    return mix(sheetHex, shadow, t * SHADOW_SCALE);
  }

  // Frost toward a HUE-PRESERVING brightened version of the sheet (L3: fluorescent
  // yellow → saturated yellowish-white, never plain white); burn chars toward the
  // warm near-black extreme. cut mixes furthest, then engrave, then score.
  const mixTarget = goLighter ? brighten(sheetHex, 1) : BURN_TARGET;
  return mix(sheetHex, mixTarget, t);
}

// The 3D emissive treatment for a process on a given sheet/category. The mark GLOWS
// (selection-gated bloom), so unlike the 2D stroke there is no contrast floor — the
// hue is carried straight as the emissive tint and DEPTH is carried by the caller's
// intensity (× intensityScale). `process` is accepted for API symmetry; the emissive
// tint is process-independent (depth lives on intensity, per markTexture's model).
//   lighten → { brightened hue-preserving frost,        intensityScale: 1 }
//   burn    → { dark warm char near BURN_TARGET,         intensityScale: BURN_GLOW_SCALE (<1, matte) }
//   other   → { tint: null (caller uses convention tint), intensityScale: 1 }
export function reactionEmissive(sheetHex, category, process) { // eslint-disable-line no-unused-vars
  if (category === 'lighten') return { tint: brighten(sheetHex, 1), intensityScale: 1 };
  if (category === 'burn') return { tint: mix(sheetHex, BURN_TARGET, 0.85), intensityScale: BURN_GLOW_SCALE };
  return { tint: null, intensityScale: 1 };
}
