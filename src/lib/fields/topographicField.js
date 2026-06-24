/**
 * topographicField — build a ScalarField from TopographicContours params.
 *
 * The TopographicContours pattern draws nested iso-contours of an fBm scalar
 * field. THIS producer reconstructs that exact field so it can act as a
 * modulation guide: the drawn mid-level contours coincide with the field's
 * neutral band, making it an intuitive steering source for other patterns.
 *
 * Coordinate agreement (the crux): the pattern samples fBm in WORLD coords with
 *   longest  = max(canvasW, canvasH)
 *   baseFreq = noiseScale / longest
 *   world    ∈ [-halfW, halfW] × [-halfH, halfH]
 * The ScalarField lives in the canvas-independent UNIT domain [0,1]². To
 * reproduce the pattern's terrain in unit space (exact for a square canvas) we
 * sample a SYNTHETIC unit square: longest = 1, half = 0.5, baseFreq = noiseScale.
 * For grid point (i,j) at u = i/res, v = j/res we evaluate
 *   fbm(makeSimplex(seed), u - 0.5, v - 0.5,
 *       { baseFreq: noiseScale, octaves, warp, longest: 1 })
 * using the SAME `fbm` + `makeSimplex(seed)` the pattern uses, so the octave +
 * domain-warp bias is identical and the iso-lines line up.
 *
 * The grid is normalized to [0,1] by its sampled extent (matching the pattern's
 * normalization), then remapped to a signed, sea-level-neutral scalar
 *   s = 2·elev − 1   (peaks +, valleys −, the 0.5 iso-contour → 0)
 * so the field's zero set tracks the pattern's mid-level contour.
 *
 * Pure + headless; never touches a pattern RNG stream. LRU-memoized on the
 * params that change the FIELD (seed | noiseScale | octaves | warp | resolution)
 * — NOT levels/levelBias/strokeWeight, which only affect the drawn contours, not
 * the underlying terrain.
 */
import { ScalarField } from './ScalarField';
import { makeSimplex } from './simplexNoise';
import { fbm } from './fbm';

// Defaults MUST match TopographicContours.generate() so a layer with
// unspecified params produces a field that agrees with its default render.
const DEFAULTS = { noiseScale: 2.5, octaves: 3, warp: 0 };

// --- LRU memo (mirrors chladniField). Keyed only by the field-determining
// params + seed + resolution. ------------------------------------------------
const CACHE = new Map();
const CACHE_MAX = 24;

function cacheKey(params, seed, resolution) {
  const {
    noiseScale = DEFAULTS.noiseScale,
    octaves = DEFAULTS.octaves,
    warp = DEFAULTS.warp,
  } = params || {};
  return `${seed}|${noiseScale}|${octaves}|${warp}|${resolution}`;
}

/**
 * Build (or fetch from cache) a signed ScalarField for the given topographic
 * params, reproducing TopographicContours' fBm terrain in the unit domain.
 * @param {object} params - topographic layer params (noiseScale, octaves, warp, …)
 * @param {object} opts
 * @param {number} opts.seed - layer seed (drives the simplex permutation)
 * @param {number} [opts.resolution=128] - grid cells per axis (→ res+1 samples)
 * @returns {ScalarField}
 */
export function topographicField(params = {}, { seed, resolution = 128 } = {}) {
  const res = Math.max(8, Math.round(resolution));
  const key = cacheKey(params, seed, res);
  const hit = CACHE.get(key);
  if (hit) {
    CACHE.delete(key);
    CACHE.set(key, hit);
    return hit;
  }

  const {
    noiseScale = DEFAULTS.noiseScale,
    octaves = DEFAULTS.octaves,
    warp = DEFAULTS.warp,
  } = params || {};

  const nx = res + 1;
  const ny = res + 1;
  const noise2D = makeSimplex(seed);

  // 1. Sample the synthetic unit-square fBm grid (longest=1, half=0.5).
  const data = new Float32Array(nx * ny);
  let fMin = Infinity;
  let fMax = -Infinity;
  for (let j = 0; j < ny; j++) {
    const wy = j / res - 0.5;
    for (let i = 0; i < nx; i++) {
      const wx = i / res - 0.5;
      const val = fbm(noise2D, wx, wy, {
        baseFreq: noiseScale,
        octaves,
        warp,
        longest: 1,
      });
      data[j * nx + i] = val;
      if (val < fMin) fMin = val;
      if (val > fMax) fMax = val;
    }
  }

  // 2. Normalize to [0,1] by sampled extent (guard a flat field), then
  // 3. remap to signed sea-level-neutral scalar s = 2·elev − 1.
  const range = fMax - fMin || 1;
  let sMin = Infinity;
  let sMax = -Infinity;
  for (let k = 0; k < data.length; k++) {
    const elev = (data[k] - fMin) / range;
    const s = 2 * elev - 1;
    data[k] = s;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
  }

  const field = new ScalarField({
    nx,
    ny,
    data,
    min: sMin,
    max: sMax,
    meta: {
      producer: 'topographic',
      params: { ...params },
      seed,
      resolution: res,
    },
  });

  CACHE.set(key, field);
  if (CACHE.size > CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    CACHE.delete(oldest);
  }
  return field;
}

export default topographicField;
