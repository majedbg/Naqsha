// Variable line-weight band model (issue #4, A5) — HEADLESS model + export
// logic ONLY (the enable toggle / N control / band-row UI is issue #17, C8).
//
// Patterns already record per-element `{ pathD, strokeWeight }`. When
// variable-weight is enabled on a layer, this module:
//   1. quantizes the layer's per-element weights into N even buckets across the
//      observed min–max range (N configurable, default 5);
//   2. generates a LINKED band of N operations in the library (one bandId, a
//      bandLayerId marker, per-band order + bucket index) with reserved spectrum
//      colors so issue #17 can render/tune them and re-generate on N change;
//   3. realizes per-element export output by bucket — laser: per-element `stroke`
//      color from a reserved red→yellow ramp (the NEW per-element-color
//      capability); plotter: bucket → pen slot (reusing MAX_PEN_SLOTS) with an
//      optional per-band pressure/Z hint stored as metadata. Drag cutter is
//      EXCLUDED (a blade has no line weight).
//
// Reserved spectrum range (resolves the §11 color-collision constraint): we fix
// R=0xFF, B=0x00 and ramp GREEN from a positive floor 0x80 (orange) up to 0xFF
// (yellow). Because G ≥ 0x80 > 0 every color differs from #FF0000; because
// R = 0xFF ≠ 0 every color differs from #0000FF and #000000. So the band never
// collides with cut=red / score=blue / engrave=black — asserted in the tests.

import { createOperation } from './operations.js';
import { getProfile } from './machineProfiles.js';
import { MAX_PEN_SLOTS } from './fabrication.js';
import { PATTERN_TYPES } from '../constants.js';

export const DEFAULT_BAND_COUNT = 5;

// Reserved spectrum endpoints. GREEN floor is strictly positive so the thinnest
// bucket is orange (#FF8000), never pure red (#FF0000).
const SPECTRUM_R = 0xff;
const SPECTRUM_B = 0x00;
const SPECTRUM_G_MIN = 0x80;
const SPECTRUM_G_MAX = 0xff;

const RESERVED_COLORS = ['#FF0000', '#0000FF', '#000000'];

// Profiles for which variable-weight is meaningful. Drag cutter is excluded —
// a blade has no line weight.
const SUPPORTED_PROFILES = new Set(['laser', 'plotter']);

let nextBandNum = 1;
function genBandId() {
  return `band-${nextBandNum++}-${Math.random().toString(36).slice(2, 8)}`;
}

const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();

/** Does this machine profile support variable-weight banding? (dragCutter → false) */
export function supportsVariableWeight(profileId) {
  return SUPPORTED_PROFILES.has(profileId);
}

/**
 * Per-pattern capability flag (A5-F4): does this pattern emit genuine per-element
 * weight VARIATION? Reads the `hasVariableWeight` flag from PATTERN_TYPES.
 * Unknown / dynamic / uniform-weight patterns → false.
 */
export function hasVariableWeight(patternId) {
  if (!patternId) return false;
  return PATTERN_TYPES.find((p) => p.id === patternId)?.hasVariableWeight === true;
}

/** Observed min/max strokeWeight across a layer's `{ pathD, strokeWeight }` elements. */
export function weightRange(elements) {
  const list = Array.isArray(elements) ? elements : [];
  let min = Infinity;
  let max = -Infinity;
  for (const el of list) {
    const w = el?.strokeWeight ?? 0;
    if (w < min) min = w;
    if (w > max) max = w;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 0 };
  return { min, max };
}

/**
 * Deterministic element → bucket assignment. Splits [min, max] into N even
 * buckets; bucket boundaries are min + k*(max-min)/N for k in 0..N.
 *   b = clamp(floor((w - min) / (max - min) * N), 0, N-1)
 * The clamp folds w == max into the top bucket (not N) and degenerate
 * (max == min) ranges into bucket 0 with no NaN.
 */
export function bucketForWeight(weight, range, n = DEFAULT_BAND_COUNT) {
  const buckets = Math.max(1, n | 0);
  const span = range.max - range.min;
  if (span <= 0) return 0;
  const idx = Math.floor(((weight - range.min) / span) * buckets);
  if (idx < 0) return 0;
  if (idx > buckets - 1) return buckets - 1;
  return idx;
}

/** Quantize a layer's per-element weights into N bucket indices (one per element). */
export function quantizeWeights(elements, n = DEFAULT_BAND_COUNT) {
  const list = Array.isArray(elements) ? elements : [];
  const range = weightRange(list);
  return list.map((el) => bucketForWeight(el?.strokeWeight ?? 0, range, n));
}

/**
 * The reserved red→yellow ramp of N colors (thinner ↔ faster). Deterministic.
 * Bucket 0 (thinnest) = orange #FF8000 … bucket N-1 (thickest) = yellow #FFFF00.
 * Guards N=1 (no divide-by-(N-1)). Every color is provably ≠ the reserved
 * cut/score/engrave colors (see module header).
 */
export function spectrumColors(n = DEFAULT_BAND_COUNT) {
  const count = Math.max(1, n | 0);
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const g = SPECTRUM_G_MIN + t * (SPECTRUM_G_MAX - SPECTRUM_G_MIN);
    out.push(`#${hex2(SPECTRUM_R)}${hex2(g)}${hex2(SPECTRUM_B)}`);
  }
  return out;
}

/**
 * Generate a LINKED band of N operations for a layer (A5-F2). Returns [] for
 * unsupported profiles (drag cutter). Each op carries band-link markers
 * (bandId / bandLayerId / bandIndex) so #17 can identify and re-generate the
 * band when N changes. Markers are attached OUTSIDE createOperation (which only
 * keeps the canonical fields), so they survive on the returned operation.
 *
 *   laser   → process 'engrave', per-bucket reserved spectrum color.
 *   plotter → process 'pen', bucket → pen slot (1-based, capped at
 *             MAX_PEN_SLOTS), with an optional per-band pressure/Z hint metadata.
 */
export function generateWeightBand({ layerId, profileId, n = DEFAULT_BAND_COUNT, bandId } = {}) {
  if (!supportsVariableWeight(profileId)) return [];
  const count = Math.max(1, n | 0);
  const id = bandId || genBandId();
  const colors = spectrumColors(count);
  const isPlotter = profileId === 'plotter';
  const process = isPlotter ? 'pen' : 'engrave';

  return colors.map((color, i) => {
    const machineParams = isPlotter
      ? {
          penSlot: Math.min(i + 1, MAX_PEN_SLOTS),
          // Optional per-band pressure/Z hint (metadata, not an exact contract):
          // thinner band → lighter pressure, ramped across the band.
          pressure: count === 1 ? 50 : Math.round((i / (count - 1)) * 100),
        }
      : {};
    const op = createOperation({
      id: `${id}-${i}`,
      name: `${getProfile(profileId).label} band ${i + 1}`,
      color,
      process,
      machineParams,
      order: i,
    });
    return { ...op, bandId: id, bandLayerId: layerId, bandIndex: i };
  });
}

/**
 * Per-element export realization (A5-F3). ADDITIVE — used ONLY for layers with
 * variable-weight enabled; the normal single-color contentFor/toSVGGroup path is
 * untouched for everything else (export stays byte-stable).
 *
 *   laser   → emits per-element `<path>` whose `stroke` is the bucket's reserved
 *             spectrum color (the NEW per-element-COLOR capability) while keeping
 *             per-element `stroke-width`.
 *   plotter → same per-element string (one group per band/pen handled upstream);
 *             color is the band's spectrum color so a preview is still legible.
 *   dragCutter → returns null; the caller falls back to the normal path.
 *
 * Returns the inner SVG string (joined per-element <path> lines), or null when
 * the profile does not support variable-weight.
 */
export function realizeVariableWeightElements(elements, { profileId, n = DEFAULT_BAND_COUNT } = {}) {
  if (!supportsVariableWeight(profileId)) return null;
  const list = Array.isArray(elements) ? elements : [];
  const buckets = quantizeWeights(list, n);
  const colors = spectrumColors(Math.max(1, n | 0));
  return list
    .map((el, i) => {
      const color = colors[buckets[i]] ?? colors[colors.length - 1];
      return `    <path d="${el.pathD}" stroke="${color}" fill="none" stroke-width="${el.strokeWeight}" stroke-linecap="round"/>`;
    })
    .join('\n');
}
