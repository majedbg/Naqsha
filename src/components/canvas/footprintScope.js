// footprintScope.js — turn a FOOTPRINT REVEAL scope into the placements it names
// (issue #189, PRD #184; spec of record `docs/motif-hold-and-pitch-decisions.md`,
// decision 16).
//
// `footprintRevealContext.js` stores the scope OPAQUELY — no enum, no switch, no
// validation — precisely so that classification lives with the thing that draws.
// This is that classifier, and it is deliberately a plain module rather than a
// helper inside `AnchorGhostOverlay.jsx`: that file is a component file
// (react-refresh/only-export-components), and this is the one genuinely
// NON-PRESENTATIONAL step of the overlay — "which placements belong to the slot
// the user is hovering" is logic, testable without rendering anything.
//
// WHY THIS IS NOT A ONE-LINER. A `Placement` carries no slot field and must not
// gain one (the sizing-diagnostics key set is fixed at seven, decision 15).
// `placement.seqId` IS the slot index (sequencer.js:101,114) — but in a ZONED
// sequence `slotIndex` is ZONE-LOCAL (`dealZone` indexes within one zone), so
// Apex slot 1 and Stem slot 1 are different slots sharing an index. The identity
// is therefore the PAIR `(zoneId, slotIndex)`, which is exactly why #186 added
// `zoneId` to `makeAssignment`. We recover both by re-dealing and keying on
// `anchorId` — never by trusting an index alignment between two lists.
//
// THE RE-DEAL IS EXACT, NOT APPROXIMATE. `resolvePlacements` truncates the
// survivor list to MAX_PLACEMENTS as a PREFIX *before* calling `dealSlots`
// (placementEngine.js:343-360), so dealing over the same prefix hands `dealSlots`
// byte-identically the input the render gave it — cycle indices, zone partitions
// and hash draws all included. Slicing here rather than arguing that a prefix of
// survivors yields a prefix of each zone costs one `slice` and removes the
// argument.

import { dealSlots } from '../../lib/motif/sequencer';
import { MAX_PLACEMENTS } from '../../lib/motif/placementEngine';

/**
 * Index of the sequence Block the ENGINE will actually use, or -1.
 *
 * `runSelectionChain` partitions out "the single terminal sequence block:
 * at-most-one; FIRST wins" (chain.js:248-256) and silently ignores any later
 * one, while the rack renders a slot card for EVERY `type:'sequence'` block. A
 * scope naming a second sequence block therefore addresses slots that never
 * reach the canvas, and must ring nothing rather than ring the first block's.
 *
 * @param {Array<{type?:string}>|null} chain
 * @returns {number}
 */
export function firstSequenceIndex(chain) {
  if (!Array.isArray(chain)) return -1;
  return chain.findIndex((b) => b && b.type === 'sequence');
}

/**
 * The placements belonging to the ONE slot a reveal scope names.
 *
 * Returns `null` when the scope does not name a slot of this motif's live
 * sequence at all (wrong kind, wrong layer, wrong sequence block, or no
 * sequence) — distinct from `[]`, which means "that slot exists and currently
 * places nothing" (an all-Rest deal, or every anchor rejected).
 *
 * @param {object|null} scope   the reveal scope, verbatim from the context.
 * @param {{motifId:string, seqIndex:number, survivors:Array, sequence:object|null,
 *          placements:Array}} ctx
 * @returns {Array|null}
 */
export function placementsForSlotScope(scope, ctx) {
  if (!scope || scope.kind !== 'slot') return null;
  const { motifId, seqIndex, survivors, sequence, placements } = ctx || {};
  if (!motifId || scope.layerId !== motifId) return null;
  // A scope naming a non-terminal sequence block addresses nothing the canvas
  // drew. `seqIndex < 0` is "this motif has no sequence block at all".
  if (!(seqIndex >= 0) || scope.seqIndex !== seqIndex) return null;
  if (!sequence || !Array.isArray(placements) || placements.length === 0) return null;

  const list = Array.isArray(survivors) ? survivors : [];
  const dealt = list.length > MAX_PLACEMENTS ? list.slice(0, MAX_PLACEMENTS) : list;
  const assignments = dealSlots(dealt, sequence);
  if (!assignments) return null; // degenerate block (no valid slots)

  const byAnchorId = new Map();
  const n = Math.min(dealt.length, assignments.length);
  for (let i = 0; i < n; i++) {
    const a = dealt[i];
    if (a && a.id != null) byAnchorId.set(a.id, assignments[i]);
  }

  // FLAT sequences carry `zoneId: null`; the convention has the trigger pass
  // `null` too, but `?? null` keeps an omitted key from reading as a mismatch.
  const zoneId = scope.zoneId ?? null;
  const { slotIndex } = scope;
  return placements.filter((p) => {
    const a = byAnchorId.get(p.anchorId);
    // A Rest emits no placement, so `!a.rest` can only ever be redundant — kept
    // because it is the cheap guard against a future deal that does emit one.
    return !!a && !a.rest && a.slotIndex === slotIndex && (a.zoneId ?? null) === zoneId;
  });
}
