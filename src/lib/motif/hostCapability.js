// hostCapability — the SINGLE params-aware host-capability seam, sitting beside
// hostKinds.js (PRD #143 §5a). hostKinds answers *which mechanism* a host uses
// (semantic extractor vs edge capture); this module answers *what a host can
// actually deliver at the params it is currently set to*.
//
// Why it is separate from hostKinds: hostKinds is consulted on the render path
// for every motif on every frame and is deliberately a pair of frozen Sets plus
// two tiny predicates. Capability is a maker-facing question ("can I put a motif
// here, and if not, why not?") whose answers carry human-readable copy. Keeping
// them apart stops render-path classification from growing UI strings.
//
// EVERY host→capability answer must be routed through here. Do NOT add an
// ad-hoc `patternType === 'chladni'` conditional in Inspector, the Route UI, or
// AnchorGhostOverlay — the whole point of the seam is that #154 (role
// availability derived at render) extends one function rather than hunting down
// scattered branches.
//
// TWO SEAMS, ONE ENTRY POINT. The sibling module `hostRoles.js` owns the OTHER
// half of the question — "which anchor roles does this host emit?" — and it
// CONSULTS `hostAvailability`, returning `[]` for an unavailable host. So:
//   • ask `rolesForHost` for the option set (it already folds availability in);
//   • ask `hostAvailability` when you need the maker-facing `reason` string,
//     as the Inspector's blank-plate notice does.
// The dependency runs one way only: hostRoles imports this module, never the
// reverse. Adding a roles table here instead would give #154 two entry points
// that can disagree, which is exactly the drift this seam exists to prevent.
//
// Availability is the EXCEPTION, not the rule. A host that renders geometry but
// whose motif capture happens to be blind to some of it is a capture bug and
// must be fixed in capture — it is NOT grounds for a gate. A gate is warranted
// only where the host is *genuinely empty*: it draws literally nothing, so every
// role and every Route choice yields nothing whatever the maker does. Chladni's
// blank plate is the one such case today.

/** The answer for any host with no gate. Frozen + shared so the common path allocates nothing. */
const AVAILABLE = Object.freeze({ available: true, reason: null });

/**
 * Chladni's field is the DIFFERENCE of a standing-wave mode pair
 * (Chladni.js `mode`):
 *
 *   mode(m, n, x, y) = cos(nπx)·cos(mπy) − cos(mπx)·cos(nπy)
 *
 * which is identically zero when m === n — the pattern's own tooltip says so
 * ("Equal m and n give a blank plate", Chladni.js PARAM_DEFS). The full field
 * blends a second pair:
 *
 *   F = (1 − w)·mode(m, n) + w·mode(m2, n2),   w = clamp(blend, 0, 1)
 *
 * A zero field means every marching-square cell scores code 0, no segments are
 * emitted, no polylines are stitched and the capture probe returns []. There is
 * no role and no Route choice that can place a glyph on it.
 *
 * The condition is therefore NOT "the first mode pair is equal" on its own:
 * at w === 1 the first pair's coefficient is exactly 0, so an equal m/n is
 * irrelevant and the plate is perfectly good (verified — 32 captured paths at
 * m=n=4, blend=1, m2=5, n2=2). The correct condition is that EVERY term which
 * still carries weight is zero:
 *
 *   blank  ⇔  (w === 1 or m === n) and (w === 0 or m2 === n2)
 *
 * DECIDED, NOT AN OVERSIGHT — the blend-0.5 blank case stays UNGATED.
 * mode(n, m) = −mode(m, n), so a SWAPPED second pair (m2 === n, n2 === m)
 * cancels the first at exactly blend 0.5 and genuinely draws a blank plate.
 * Measured: m=4, n=3, m2=3, n2=4 gives 0 captured paths at blend 0.5 and 7 at
 * blend 0.4. Majed took this decision on PR #145 and it is recorded here so a
 * later ticket does not "fix" it:
 *
 *   • it fires on ONE exact slider position, and the blankness is instantly
 *     visible on the canvas — the maker is not left mystified;
 *   • a tolerance band would disable the host across a RANGE where it still
 *     draws, which is strictly worse than no gate;
 *   • it would be the only float-equality branch in this module.
 *
 * Do NOT add a tolerance band without re-taking that decision.
 */
function chladniAvailability(params) {
  // Defaults mirror Chladni.js's own inline destructuring defaults exactly.
  const m = params?.m ?? 4;
  const n = params?.n ?? 3;
  const m2 = params?.m2 ?? 5;
  const n2 = params?.n2 ?? 2;
  const blend = params?.blend ?? 0;
  const w = Math.max(0, Math.min(1, blend)); // same clamp as Chladni.js

  // A pair is "live" when its coefficient in F is non-zero. At w === 1 the first
  // coefficient (1 − w) is exactly 0; at w === 0 the second is.
  const firstLive = w < 1;
  const secondLive = w > 0;
  const firstZero = !firstLive || m === n;
  const secondZero = !secondLive || m2 === n2;
  if (!(firstZero && secondZero)) return AVAILABLE;

  const reason =
    firstLive && secondLive
      ? 'Chladni draws a blank plate here: both mode pairs are equal (m = n and m2 = n2), ' +
        'so the standing-wave field is zero everywhere and there are no nodal lines to place ' +
        'glyphs on. Change m, n, m2 or n2.'
      : secondLive
        ? 'Chladni draws a blank plate here: Blend is at full, and the second mode pair m2 and ' +
          'n2 are equal, so the standing-wave field is zero everywhere and there are no nodal ' +
          'lines to place glyphs on. Change m2 or n2, or lower Blend to bring back the first ' +
          'mode pair.'
        : 'Chladni draws a blank plate here: mode m and mode n are equal, so the standing-wave ' +
          'field is zero everywhere and there are no nodal lines to place glyphs on. Change m ' +
          'or n, or raise Blend to bring in the second mode pair.';

  return { available: false, reason };
}

/** patternType → params-aware gate. Absent ⇒ always available. */
const AVAILABILITY_GATES = Object.freeze({
  chladni: chladniAvailability,
});

/**
 * Whether `patternType` can host a motif AT THESE PARAMS, and if not, the
 * maker-facing reason why. Ungated hosts (everything but Chladni today) return
 * the shared AVAILABLE answer regardless of params, so existing hosts are
 * untouched.
 *
 * This is a capability question, not a classification one: a type that is not a
 * motif host at all still reports `available: true` here. Use
 * `isMotifHost`/`MOTIF_HOSTS` (hostKinds.js) to ask whether a type may host a
 * motif; use this to ask whether it can deliver anything right now.
 *
 * @param {string} patternType PATTERN_CLASSES / registry id.
 * @param {object} [params] the host layer's params. Omitted ⇒ the host's defaults.
 * @returns {{available: boolean, reason: (string|null)}}
 */
export function hostAvailability(patternType, params) {
  const gate = AVAILABILITY_GATES[patternType];
  return gate ? gate(params) : AVAILABLE;
}
