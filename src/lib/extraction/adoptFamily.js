// adoptFamily — orchestrates ADOPTING a fitted parametric family (S12, issue
// #61; PRD #48 decision 10). Sits between the EVAL gate (fitEvaluator) and the
// two registration surfaces:
//
//   - resolveParameterizeGate(tier) → whether the family proposal is offered at
//     all (feature flag) and whether it grants LIVE knobs or a FIXED tile (tier
//     gate). Both halves default-open + flippable (see featureFlags/tierLimits).
//   - adoptFittedFamily(...) → renders the family at the chosen params, builds
//     the one-entity-two-surfaces entity, and registers it:
//       liveKnobs  → parametric generator WITH paramDefs (paid: n/contactAngle)
//       fixed tile → the existing S0 registerExtractedPattern (free: snapshot)
//
// The FALL-THROUGH (score < 7, or flag off) never routes here: the Review step
// simply doesn't offer the proposal and the existing traced-tile save path runs
// untouched. This module is only reached when the user ACCEPTS an offered fit.

import { checkGate } from '../tierLimits';
import { isFeatureEnabled } from '../featureFlags';
import { makeExtractedPattern } from './extractedPattern';
import { registerExtractedPattern } from '../patterns/ExtractedPatternGenerator';
import {
  registerParametricFamily,
  getFamily,
} from '../patterns/ParametricFamilyGenerator';

/**
 * Resolve whether to offer the family proposal and at what fidelity.
 * @returns {{ offer: boolean, liveKnobs: boolean, reason: string|null }}
 */
export function resolveParameterizeGate(tier) {
  // The flag is the on/off half — off ⇒ never offer (keep the traced tile).
  if (!isFeatureEnabled('parameterize')) {
    return { offer: false, liveKnobs: false, reason: 'feature-off' };
  }
  // The proposal itself always ships (decision 5 default-open); the tier gate
  // only decides live knobs vs a fixed tile.
  const gate = checkGate(tier, 'parameterize');
  return { offer: true, liveKnobs: gate.allowed, reason: gate.reason };
}

/**
 * Adopt a fitted family. Builds the entity (rendered tile + optional param
 * payload) and registers it into both library surfaces.
 *
 * @param {{
 *   family: object,          // a FitFamily (kaplanStar) or its id
 *   params: object,          // the fit / edited params { n, contactAngle, ... }
 *   lattice: object,
 *   symmetry: object|null,
 *   title: string,
 *   liveKnobs: boolean,      // from resolveParameterizeGate
 *   photoURL?: string,       // transient Library thumbnail source
 * }} opts
 * @returns {{ entity: object, kind: 'parametric'|'fixed', PatternClass: Function }}
 */
export function adoptFittedFamily({
  family,
  params,
  lattice,
  symmetry = null,
  title,
  liveKnobs,
  photoURL = null,
}) {
  const fam = typeof family === 'string' ? getFamily(family) : family;
  if (!fam) throw new Error('adoptFittedFamily: unknown family');

  // Render the family at the chosen params → the tile snapshot every path needs
  // (thumbnail + tile_svg payload; the fixed-tile surface itself).
  const tile = fam.generate(params, { lattice });

  if (liveKnobs) {
    const entity = makeExtractedPattern({
      title,
      tile,
      lattice,
      symmetry,
      family: fam.id,
      paramDefs: fam.paramDefs,
      defaultParams: params,
    });
    const PatternClass = registerParametricFamily(entity, { photoURL });
    return { entity, kind: 'parametric', PatternClass };
  }

  // Fixed tile (free / gated): reuse the S0 path — no params, no knobs.
  const entity = makeExtractedPattern({ title, tile, lattice, symmetry });
  const PatternClass = registerExtractedPattern(entity, { photoURL });
  return { entity, kind: 'fixed', PatternClass };
}
