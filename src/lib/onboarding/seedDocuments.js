// Guest onboarding S1 — curated "Choose your naqsheh" starter seeds.
//
// Each seed is a REAL app layer document (one layer), built on top of
// `createLayer` so its shape never drifts from what the rest of the app
// produces (params, id scheme, defaults) — see docs/guest-onboarding-
// DECISIONS.md D10. Landing frames are fixed, vetted values (D8), not random,
// so every guest sees the same known-good frame; Shuffle (a later slice)
// randomizes within `SEED_HERO_RANGES` afterward.
//
// D15 (honest): seeds are single-layer, engrave-only decorative tiles — no
// fake cut perimeter. `createLayer`'s default role is 'cut'; every seed here
// overrides it to 'engrave'.
//
// D9-fallback: modulation (phyllotaxis→size, recursive→linear-scale,
// topographic→warp) is NOT wired in this slice — seeds are STATIC. See
// CONFIRMED FACTS: modulation is channel-whitelisted by pattern TYPE
// (src/lib/fields/channelConsumers.js CHANNEL_BY_TYPE) and phyllotaxis isn't
// a modulation target at all. Modulation animation is slice S7.
import { DEFAULT_PARAMS } from '../../constants';
import { createLayer } from '../useLayers';
import { operationIdForRole } from '../operations';

export const DEFAULT_SEED_KEY = 'phyllotaxis';

// Landing-frame overrides per starter — hand-tuned "hero" values layered on
// top of DEFAULT_PARAMS[type] so every other param stays at its normal,
// already-valid default.
//
// TODO(user): tune landing frame — phyllotaxis. Mid golden band (137.2–137.9),
// see D7/D6.
const PHYLLOTAXIS_LANDING_PARAMS = {
  angle: 137.5,
};

// TODO(user): tune landing frame — recursive. Pentagon · rotationPerLevel 36°
// · depth 4 (locked in BUILD BRIEF); scaleFactor mid golden band (0.62–0.80).
const RECURSIVE_LANDING_PARAMS = {
  shape: 'pentagon',
  rotationPerLevel: 36,
  depth: 4,
  scaleFactor: 0.71,
};

// TODO(user): tune landing frame — topographic. Mid golden band (1.6–3.2).
const TOPOGRAPHIC_LANDING_PARAMS = {
  noiseScale: 2.4,
};

// Curated golden ranges per seed's hero param (D7). Consumed later by the
// drag-me cue (S3) and Shuffle (S4) — NOT enforced here beyond the landing
// value sitting inside the band (covered by tests).
export const SEED_HERO_RANGES = {
  phyllotaxis: { key: 'angle', min: 137.2, max: 137.9 },
  recursive: { key: 'scaleFactor', min: 0.62, max: 0.80 },
  topographic: { key: 'noiseScale', min: 1.6, max: 3.2 },
};

const SEED_LANDING_PARAMS = {
  phyllotaxis: PHYLLOTAXIS_LANDING_PARAMS,
  recursive: RECURSIVE_LANDING_PARAMS,
  topographic: TOPOGRAPHIC_LANDING_PARAMS,
};

export const SEED_KEYS = Object.keys(SEED_LANDING_PARAMS);

const ENGRAVE_OPERATION_ID = operationIdForRole('engrave');

// D8 (deterministic landing frame) requires pinning `layer.seed` too, not
// just the params. `createLayer` assigns a RANDOM seed per call
// (`seed: randomSeed()`) — harmless for most engines, but
// TopographicContours.generate builds its noise field directly from `seed`
// (`makeSimplex(seed)`, src/lib/patterns/TopographicContours.js), so a random
// seed would make the topographic starter's terrain shape differ per guest
// even at the same noiseScale, silently breaking "every guest sees a vetted
// frame". Pin ALL seeds for consistency (Phyllotaxis/Recursive only consult
// `seed` for randomize-adjacent params like jitter, which default to 0 — but
// a later landing-frame tune shouldn't have to rediscover this).
// TODO(user): tune landing frame — this fixed noise/randomize seed.
const LANDING_FRAME_SEED = 42;

// Build one seed's single-layer document. Starts from createLayer's normal
// output (so id scheme / shape / defaults exactly match every other layer in
// the app), then layers the landing-frame overrides on top of
// DEFAULT_PARAMS[type] (kept explicit rather than relying on createLayer's
// internal defaults, so a landing-frame value is never silently lost if
// createLayer's defaulting logic changes), and finally flips role→engrave
// (D15).
function buildSeedLayer(seedKey) {
  const landing = SEED_LANDING_PARAMS[seedKey];
  if (!landing) {
    throw new Error(`onboarding seedDocuments: unknown seed key "${seedKey}"`);
  }
  const layer = createLayer(0, seedKey);
  return {
    ...layer,
    params: {
      ...DEFAULT_PARAMS[seedKey],
      ...landing,
    },
    role: 'engrave',
    operationId: ENGRAVE_OPERATION_ID,
    seed: LANDING_FRAME_SEED,
  };
}

// Returns a fresh, independent single-layer array for `seedKey` (fresh id via
// createLayer's own id generator — repeated calls never collide and never
// share references, so mutating one caller's result can't affect another's).
export function getSeedDocument(seedKey) {
  return [buildSeedLayer(seedKey)];
}
