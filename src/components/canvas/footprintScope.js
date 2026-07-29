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

/**
 * The ONE thing capping a placement, as a disc to draw — or null (#190,
 * decisions 16/17).
 *
 * The second non-presentational step of the overlay, and here for the same
 * reason as the first: "which placements have a captor, and of which kind" is
 * logic, testable without rendering. Where the disc is *drawn* — how dim, in
 * what order — is not, and stays in the component.
 *
 * ⚠️ NEVER RE-DERIVED FROM GEOMETRY. `capObstacle` is the disc the engine
 * actually lost to, recorded at the moment it lost (placementEngine.js:627),
 * and it is a COPY — the packer's own array keeps mutating after, so searching
 * `placed` for "the nearest disc" would be a guess that disagrees with the
 * engine whenever two discs tie or `margin < 1` moves the tangency. That the
 * identity had to be surfaced at all (#186) is the entire reason this field
 * exists; reconstructing it here would waste it.
 *
 * The captor commonly belongs to a DIFFERENT slot, and that is the point: the
 * glyph capping yours is almost always another slot's, so an overlay confined
 * to the hovered slot's own circles would hide the actual cause. No filtering
 * happens here — the caller draws whatever comes back.
 *
 * 'boundary' returns null BY DESIGN (decision 17): the canvas rect is already
 * on screen and drawing a second one over the artwork being judged buys
 * nothing. 'natural' returns null because nothing capped that glyph at all.
 *
 * @param {object|null} placement  a Placement, carrying the always-present
 *                                 sizing diagnostics (decision 15).
 * @param {object|null} [anchor]   the RUNTIME anchor this placement sits on.
 *                                 Read for `capBy === 'host'` only — the host
 *                                 container's radius is a top-level field on
 *                                 the anchor and appears on no placement.
 * @returns {{kind:'neighbour'|'host', x:number, y:number, r:number}|null}
 */
export function captorDisc(placement, anchor) {
  if (!placement) return null;
  if (placement.capBy === 'neighbour') {
    const o = placement.capObstacle;
    // The engine populates `capObstacle` exactly when `capBy === 'neighbour'`,
    // so null here should be unreachable — one condition, and it turns a
    // hypothetical contract drift into "no captor drawn" rather than a throw
    // inside the render.
    if (!o) return null;
    return { kind: 'neighbour', x: o.x, y: o.y, r: o.r };
  }
  if (placement.capBy === 'host') {
    // The SAME validity test the engine gated the cap on
    // (placementEngine.js:294 `hasHostRadius`), replicated rather than
    // approximated: an overlay that disagrees about whether an anchor declares
    // a container draws a ring where nothing capped, or omits one where
    // something did.
    if (!anchor || !Number.isFinite(anchor.hostRadius) || !(anchor.hostRadius > 0)) return null;
    // Centred on the ANCHOR, not on the glyph. The container never moved; the
    // four jitter draws displaced the glyph INSIDE it, which is precisely why
    // the engine's host rule is a distance rule (`hostRadius - d`) rather than
    // a radius cap — and drawing the ring off-centre from the glyph is what
    // makes that visible.
    return { kind: 'host', x: anchor.x, y: anchor.y, r: anchor.hostRadius };
  }
  return null;
}
