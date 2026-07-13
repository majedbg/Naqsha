// Guest onboarding S4 — "Surprise me" / Shuffle (D11, BUILD BRIEF element #3).
//
// Re-rolls the ACTIVE seed layer's params within curated ranges so every
// shuffle is a guaranteed win (D11): honors RANDOMIZE_EXCLUDED_KEYS (never
// touches transform/stroke/scale keys — src/constants.js), and — D7's whole
// point — clamps the seed's HERO param to its curated golden band
// (SEED_HERO_RANGES, seedDocuments.js) rather than the param's full slider
// range, so the hero never lands in mud even though the def's own
// PATTERN_PARAM_DEFS randomMin/randomMax is wider (e.g. phyllotaxis `angle`
// is 100–170 full range vs the golden 137.2–137.9 band).
//
// Deliberately REUSES the existing randomize RNG (randomValueForDef /
// randomPatchForDef, src/lib/params/paramOps.js) — the exact same helpers
// `useLayers.randomizeLayerParams` / `randomizeAllParams` and the per-row
// dice (PatternParams.jsx) already call — instead of reinventing random
// generation. Pure function: does not touch patternType, does not know
// about layer ids, does not talk to React or useLayers directly (the caller
// — GuestOnboarding.jsx — is responsible for writing the result back onto
// the active layer via the normal updateLayer setter path).
import { PATTERN_PARAM_DEFS, RANDOMIZE_EXCLUDED_KEYS } from '../../constants';
import { randomPatchForDef, randomValueForDef } from '../params/paramOps';
import { SEED_HERO_RANGES } from './seedDocuments';

/**
 * Build a re-rolled params object for `patternType`, seeded from `params`.
 *
 * @param {string} patternType
 * @param {object} params  Current layer params. Never mutated — a new
 *   object is always returned.
 * @returns {object} A NEW params object — every RANDOMIZE_EXCLUDED_KEYS key
 *   unchanged, every other key re-rolled within its own curated
 *   randomMin/randomMax (or min/max), and — when `patternType` has a
 *   curated hero range — the hero key re-rolled within that golden band
 *   instead.
 */
export function shuffleSeedParams(patternType, params) {
  const defs = PATTERN_PARAM_DEFS[patternType];
  if (!defs || !params) return { ...params };

  const newParams = { ...params };
  for (const def of defs) {
    // Same filter useLayers.createLayer / randomizeAllParams use — a
    // composite def's synthetic `key` (e.g. OFFSET_PAD_PARAM's 'offset') is
    // what RANDOMIZE_EXCLUDED_KEYS lists, so checking `def.key` here (not
    // the expanded `def.keys`) is deliberate and matches established
    // behavior exactly — it's how 'offset' skips randomizing offsetX/offsetY
    // as a pair today.
    if (RANDOMIZE_EXCLUDED_KEYS.includes(def.key)) continue;
    Object.assign(newParams, randomPatchForDef(def));
  }

  // D7/D11: clamp the seed's hero param into its curated golden band —
  // narrower than (or equal to) the def's own full min/max — so the "wow"
  // is reliable, not lucky. Reuses randomValueForDef's own clamp+step-snap
  // logic by pointing it at the golden band instead of the def's normal
  // randomMin/randomMax.
  const heroRange = SEED_HERO_RANGES[patternType];
  if (heroRange) {
    const heroDef = defs.find((d) => d.key === heroRange.key);
    if (heroDef) {
      newParams[heroRange.key] = randomValueForDef({
        ...heroDef,
        min: heroRange.min,
        max: heroRange.max,
        randomMin: heroRange.min,
        randomMax: heroRange.max,
      });
    }
  }

  return newParams;
}
