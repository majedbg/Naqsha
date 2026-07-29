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
import { MAX_PLACEMENTS, PLACEMENT_DEFAULTS } from '../../lib/motif/placementEngine';

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
 * The scope→slot resolution both selectors below share: is this scope naming a
 * slot of THIS motif's live sequence, and if so, which anchors were dealt it.
 *
 * ⚠️ THE SHARED PART STOPS HERE, DELIBERATELY. It does NOT check `placements`
 * (or `rejected`) — each caller guards its OWN list. Folding the placement guard
 * in here would make `rejectionsForSlotScope` return null in exactly the case
 * #191 exists for: a slot with ZERO placements and four rejections, where the
 * overlay must still draw.
 *
 * @param {object|null} scope
 * @param {{motifId:string, seqIndex:number, survivors:Array, sequence:object|null}} ctx
 * @returns {{byAnchorId:Map<string,object>, zoneId:string|null, slotIndex:number}|null}
 */
function slotDeal(scope, ctx) {
  if (!scope || scope.kind !== 'slot') return null;
  const { motifId, seqIndex, survivors, sequence } = ctx || {};
  if (!motifId || scope.layerId !== motifId) return null;
  // A scope naming a non-terminal sequence block addresses nothing the canvas
  // drew. `seqIndex < 0` is "this motif has no sequence block at all".
  if (!(seqIndex >= 0) || scope.seqIndex !== seqIndex) return null;
  if (!sequence) return null;

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
  return { byAnchorId, zoneId: scope.zoneId ?? null, slotIndex: scope.slotIndex };
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
  const { placements } = ctx || {};
  if (!Array.isArray(placements) || placements.length === 0) return null;
  const deal = slotDeal(scope, ctx);
  if (!deal) return null;
  const { byAnchorId, zoneId, slotIndex } = deal;
  return placements.filter((p) => {
    const a = byAnchorId.get(p.anchorId);
    // A Rest emits no placement, so `!a.rest` can only ever be redundant — kept
    // because it is the cheap guard against a future deal that does emit one.
    return !!a && !a.rest && a.slotIndex === slotIndex && (a.zoneId ?? null) === zoneId;
  });
}

/** The two rejection reasons the overlay explains — and only these (#191). */
const DRAWN_REASONS = new Set(['below-floor', 'no-fit']);

/**
 * A per-glyph override record's scale, or null — the SAME validity rule
 * `applyGlyphOverrides` applies (overrides.js: `Number.isFinite(rec.scale) &&
 * rec.scale > 0`), replicated verbatim and deliberately.
 *
 * The dotted ring and the dashed ring that REPLACES it when `hold` rescues the
 * glyph must never disagree about what an override means: a record the placement
 * path ignores has to be ignored here too, or a glyph promised at one radius
 * arrives at another.
 *
 * @param {Map<string, {scale?:number}>|null|undefined} records
 * @param {string} anchorId
 * @returns {number|null}
 */
function overrideScale(records, anchorId) {
  if (!records || records.size === 0) return null;
  const rec = records.get(anchorId);
  if (!rec) return null;
  return Number.isFinite(rec.scale) && rec.scale > 0 ? rec.scale : null;
}

/**
 * One rejection as the overlay will draw it, or null if it draws none — the
 * two filters and the override multiply that every scope kind applies alike
 * (extracted with #192; the rules and their reasoning are unchanged from #191
 * and are documented in full on `rejectionsForSlotScope` below).
 *
 * @param {{anchorId:string, reason:string, wantedRadius:number}} r
 * @param {Map<string, {scale?:number}>|null|undefined} overrideRecords
 * @returns {object|null}
 */
function drawableRejection(r, overrideRecords) {
  if (!DRAWN_REASONS.has(r.reason)) return null;
  if (!(Number.isFinite(r.wantedRadius) && r.wantedRadius > 0)) return null;
  const scale = overrideScale(overrideRecords, r.anchorId);
  // A shallow CLONE when scaled; the engine's array is never mutated.
  return scale == null ? r : { ...r, wantedRadius: r.wantedRadius * scale };
}

/**
 * The rejections the ONE slot a reveal scope names has to answer for (#191).
 *
 * Mirrors `placementsForSlotScope` — same gating, same re-deal, same null-vs-[]
 * contract — over the engine's `rejected` array instead of its `placements`:
 * `null` when the scope names nothing here (or the run rejected nothing at all),
 * `[]` when it names a slot that lost nothing.
 *
 * FILTERED TO THE TWO SIZING REASONS. `below-floor` and `no-fit` are the silent
 * deletions this feature exists to explain — a glyph the user composed, gone
 * with every survivor still reporting 100%. `junction-skip` and `rest` are
 * dispositions the user ASKED for, so they draw nothing; they also carry no
 * geometry to draw with (placementEngine.js's Rejection typedef). Filtering on
 * reason is what excludes a `rest`, so no `assignment.rest` test is needed here.
 *
 * AND FILTERED TO A DRAWABLE RADIUS. `makeAssignment` does not coerce `sizeScale`
 * the way the engine clamps `hold`, so a hand-edited or imported document can
 * carry a non-finite one; the engine honestly propagates it into `wantedRadius`
 * (fixing that in the sizing math would be a clamp, and this feature adds none).
 * "Anything not a FINITE POSITIVE number reads as absent" is the engine's own
 * `hasHostRadius` idiom, and here it means the rejection is simply not drawn —
 * strictly better than `r={NaN}`, which SVG discards, React warns about, and the
 * user experiences as the ring silently missing from the very overlay that
 * exists to stop things going missing silently.
 *
 * THE OVERRIDE SCALE IS APPLIED HERE, not in the engine (#137/#191). The engine
 * reports what the glyph asked for BEFORE any post-placement step, which is the
 * honest thing for it to report; but `applyGlyphOverrides` then multiplies a
 * placement's `drawnRadius` by the same record's scale, so a raw `wantedRadius`
 * would put the dotted ring in a different radius space from the two live rings
 * beside it — a ×2 anchor promised at 18 and delivered at 36 the moment `hold`
 * rescues it. Applying it in the selector also keeps it headlessly testable,
 * which a radius drawn in the component is not (the PRD excludes rendered SVG).
 * A scaled rejection is a shallow CLONE; the engine's array is never mutated.
 *
 * @param {object|null} scope
 * @param {{motifId:string, seqIndex:number, survivors:Array, sequence:object|null,
 *          rejected:Array, overrideRecords?:Map<string, {scale?:number}>}} ctx
 * @returns {Array|null}
 */
export function rejectionsForSlotScope(scope, ctx) {
  const { rejected, overrideRecords } = ctx || {};
  if (!Array.isArray(rejected) || rejected.length === 0) return null;
  const deal = slotDeal(scope, ctx);
  if (!deal) return null;
  const { byAnchorId, zoneId, slotIndex } = deal;
  const out = [];
  for (const r of rejected) {
    const a = byAnchorId.get(r.anchorId);
    if (!a || a.slotIndex !== slotIndex || (a.zoneId ?? null) !== zoneId) continue;
    const drawable = drawableRejection(r, overrideRecords);
    if (drawable) out.push(drawable);
  }
  return out;
}

/* ------------------------------------------------- the other scope kinds */
// #192 wires the remaining three triggers, and two of them publish kinds
// NOTHING CLASSIFIED until now: layer Size raises `{kind:'layer', layerId}` and
// a per-glyph override raises `{kind:'glyph', layerId, anchorId}` (the
// conventions recorded in footprintRevealContext.js). An unclassified kind is
// not a harmless no-op — the reveal raises, the selectors below return null, and
// the overlay draws nothing at all. That is exactly the fails-OFF signature this
// PRD keeps warning about: it looks identical to the trigger never having been
// wired.
//
// The three kinds share the layer gate and the null-vs-[] contract, and NOTHING
// ELSE — `{kind:'slot'}` alone needs the re-deal. Each kind keeps its OWN
// empty-list guard, for the reason `slotDeal` records: a layer whose every
// anchor was rejected has NO placements and a full rejection list, and a shared
// guard would switch off precisely the case #191 exists for.

/**
 * Does this scope name THIS motif at all? The one thing every kind checks.
 *
 * @param {object|null} scope
 * @param {{motifId?:string}} ctx
 */
const namesLayer = (scope, ctx) => !!scope && !!ctx?.motifId && scope.layerId === ctx.motifId;

/**
 * EVERY placement on the layer — the layer-wide answer, deliberately unnarrowed.
 *
 * RULING (#192). Decision 16 — "the hovered slot's glyphs, not every placement
 * on the layer" — was ruled about a SLOT hover, where a slot is what the user is
 * pointing at and the rest of the layer is noise. A layer-wide control is
 * outside what that decision answered: nothing narrows layer Size to a subset,
 * and picking one arbitrarily (the first slot? the largest glyph?) would ring
 * glyphs the control does not exclusively move while leaving unringed ones it
 * does. Drawing nothing is not an option either — it fails this issue's first
 * acceptance criterion, silently.
 *
 * ⚠️ SO THIS REINSTATES THE FULL `MAX_PLACEMENTS` WORST CASE, the one the
 * handover's perf table measures at 83.77 ms/frame (2000 rings, synthetic, at
 * the cap). Decision 16's `MAX_PLACEMENTS / numSlots` bound simply does not
 * apply here: it is a property of dealing a slot, and a layer is not dealt.
 * A real 286-ring grid reconciles in 5.33 ms; the cap case is a 1-slot sequence
 * at MAX_PLACEMENTS.
 *
 * NO CAP, NO CUTOFF, NO "top N" IS ADDED. An invisible clamp is the exact class
 * of hidden default this whole PRD exists to stop — the overlay would then be
 * lying about the layer while claiming to explain it, which is worse than being
 * slow. Reported to the orchestrator as an open question instead.
 *
 * @param {object} scope
 * @param {{motifId:string, placements:Array}} ctx
 * @returns {Array|null}
 */
function placementsForLayerScope(scope, ctx) {
  if (!namesLayer(scope, ctx)) return null;
  const { placements } = ctx;
  if (!Array.isArray(placements) || placements.length === 0) return null;
  // The engine's array verbatim — every caller treats these as read-only, and
  // a defensive copy of up to MAX_PLACEMENTS entries is exactly the cost the
  // note above is already uncomfortable about. Layer Size has NO drag (it is a
  // bare number input, ruled in #192), so this does not run per drag frame; it
  // runs once per raise and then once per KEYSTROKE, since committing a new
  // size replaces the layer and re-runs the whole resolve → select → draw path
  // underneath it while the reveal is still up.
  return placements;
}

/** Every drawable rejection on the layer. Mirror of the above. */
function rejectionsForLayerScope(scope, ctx) {
  if (!namesLayer(scope, ctx)) return null;
  const { rejected, overrideRecords } = ctx;
  if (!Array.isArray(rejected) || rejected.length === 0) return null;
  const out = [];
  for (const r of rejected) {
    const drawable = drawableRejection(r, overrideRecords);
    if (drawable) out.push(drawable);
  }
  return out;
}

/**
 * The ONE placement a per-glyph override names — plus its captor, which comes
 * free: the caller selects captors from whatever list it is handed.
 *
 * `[]` (rather than null) when that anchor is not among the placements, and that
 * is a REACHABLE state rather than a defensive one: a rejected anchor still has
 * a clickable dot and a popover, so its scale control is a live trigger for a
 * glyph that never drew. Its ring comes from the rejection side.
 */
function placementsForGlyphScope(scope, ctx) {
  if (!namesLayer(scope, ctx) || !scope.anchorId) return null;
  const { placements } = ctx;
  if (!Array.isArray(placements) || placements.length === 0) return null;
  return placements.filter((p) => p.anchorId === scope.anchorId);
}

/** That anchor's rejection, if it was rejected instead of placed. */
function rejectionsForGlyphScope(scope, ctx) {
  if (!namesLayer(scope, ctx) || !scope.anchorId) return null;
  const { rejected, overrideRecords } = ctx;
  if (!Array.isArray(rejected) || rejected.length === 0) return null;
  const out = [];
  for (const r of rejected) {
    if (r.anchorId !== scope.anchorId) continue;
    const drawable = drawableRejection(r, overrideRecords);
    if (drawable) out.push(drawable);
  }
  return out;
}

/**
 * WHAT THE OVERLAY CALLS — the placements any reveal scope names, whatever kind
 * it is. One list, handed to one renderer: the component never learns which
 * control raised the reveal, which is what keeps "one overlay implementation,
 * N callers" true as PR 2 adds a fifth trigger.
 *
 * An unrecognised kind names NOTHING, deliberately. The reveal context is opaque
 * and will carry a shape this module has never seen (PR 2's spacing/density is
 * being written against it right now); ringing the whole layer on a kind we
 * cannot interpret would be a guess drawn over the user's artwork.
 *
 * @param {object|null} scope  the reveal scope, verbatim from the context.
 * @param {object} ctx  the union of what the kinds need — see each selector.
 * @returns {Array|null}
 */
export function placementsForScope(scope, ctx) {
  if (!scope) return null;
  if (scope.kind === 'slot') return placementsForSlotScope(scope, ctx);
  if (scope.kind === 'layer') return placementsForLayerScope(scope, ctx);
  if (scope.kind === 'glyph') return placementsForGlyphScope(scope, ctx);
  return null;
}

/** The rejections any reveal scope names. Mirror of `placementsForScope`. */
export function rejectionsForScope(scope, ctx) {
  if (!scope) return null;
  if (scope.kind === 'slot') return rejectionsForSlotScope(scope, ctx);
  if (scope.kind === 'layer') return rejectionsForLayerScope(scope, ctx);
  if (scope.kind === 'glyph') return rejectionsForGlyphScope(scope, ctx);
  return null;
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
 * ⚠️ AND "THE NEAREST DISC" IS NO LONGER EVEN THE RIGHT GUESS (#206, decision
 * 6b). The root law's captor minimises `d − r`; the tight law's is the obstacle
 * yielding the SMALLEST MAX-`R`, and once the reserve is offset those are
 * different orderings — a disc FURTHER AWAY in the direction the art leans can
 * bind harder than a nearer one behind the root. Nothing here changes, which is
 * the point: this function already reads the recorded winner and never ranks
 * anything itself.
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

/* ------------------------------------------------- the rings, as geometry */
// #206 (PRD #197, spec `docs/motif-footprint-fix-decisions.md` §4a/§5h). The
// rings move to the OFFSET centre, and that is arithmetic over the engine's
// emitted record — so it lives here beside the selectors, headlessly testable,
// rather than inline in the component. The PRD excludes the RENDERED SVG from
// assertion; it does not excuse the numbers that go into it.
//
// THE ONE THING THE OVERLAY MUST NOT DO IS RE-DERIVE THE CENTRE. The engine
// emits `Placement.footprintCenter` — the world centre of the disc it actually
// committed to the packer, copied at the moment it committed (§5f shape 1).
// Recomputing it here from `fc`, `viewRadius` and a rotation of our own is the
// same mistake `captorDisc` records above: an overlay that disagrees with the
// engine about where a glyph is draws a ring around the wrong thing, and does
// it silently. Everything below is a homothety about the ANCHOR over that one
// emitted point.

const DEG_TO_RAD = Math.PI / 180;

/**
 * Is this placement config packed by the TIGHT law (#204, decision 7b)?
 *
 * THE DUPLICATE DEFAULT IS GONE (#207). This predicate used to carry its own
 * copy of "absent ⇒ root", with a note that it must import the engine's default
 * the moment #207 introduced one. It does now: `PLACEMENT_DEFAULTS.sizing` is
 * exported and merged here exactly as `resolvePlacements` merges it, so the
 * rings and the packer read one object. Two copies could not have been kept
 * honest by any test that did not already know they had diverged — an overlay
 * reading `root` while the engine packs `tight` draws anchor-centred rings
 * around offset art, which is ruling 7f's failure mode in a quieter register.
 *
 * `fixed` NEVER reads tight. §5e leaves that branch untouched in both footprint
 * modes, so its reserve is still `(P, R)` and `footprintCenter` comes back as
 * the anchor — the rings must stay anchored and full-radius there. Only the
 * exact string `'tight'` opts in, mirroring the engine's own dispatch.
 *
 * @param {{sizing?: {mode?:string, footprint?:string}}|null|undefined} placementConfig
 * @returns {boolean}
 */
export function isTightFootprint(placementConfig) {
  const sizing = { ...PLACEMENT_DEFAULTS.sizing, ...((placementConfig && placementConfig.sizing) || {}) };
  if (sizing.footprint !== 'tight') return false;
  return sizing.mode !== 'fixed';
}

/**
 * A glyph's measured footprint, NORMALISED by `viewRadius` — `f̂c` and `f̂r`, in
 * units of the radius being solved for, plus the `root.angle` the measurement
 * was taken in. Null when the glyph carries no usable measurement.
 *
 * Mirrors `placementEngine.js`'s `normalisedFootprint` (ruling 7c: normalise at
 * the glyph, so every length downstream is directly in `R`) with ONE difference,
 * which is deliberate: the engine THROWS on an unmeasured glyph and is right to
 * — it is about to reserve space on a machine that cuts material, and ruling 7d
 * ruled loud over silently degrading. This overlay is a hover diagnostic. It
 * returns null and draws the anchored ring, which is the same ring it drew
 * yesterday; the render path reports the same document loudly on its own.
 *
 * @param {object|null|undefined} glyph
 * @returns {{cx:number, cy:number, r:number, angle:number}|null}
 */
export function normalisedFootprint(glyph) {
  if (!glyph || typeof glyph !== 'object') return null;
  const fc = glyph.footprintCenter;
  const fr = glyph.footprintRadius;
  const viewRadius = glyph.viewRadius;
  if (
    !fc ||
    typeof fc !== 'object' ||
    !Number.isFinite(fc.x) ||
    !Number.isFinite(fc.y) ||
    !Number.isFinite(fr) ||
    !Number.isFinite(viewRadius) ||
    viewRadius <= 0
  ) {
    return null;
  }
  const root = glyph.root;
  const angle = root && Number.isFinite(root.angle) ? root.angle : 0;
  return { cx: fc.x / viewRadius, cy: fc.y / viewRadius, r: fr / viewRadius, angle };
}

/**
 * ONE live ring: the disc this placement occupies at radius `R`.
 *
 * Both rings come through here — solid at `packedRadius` (what was RESERVED,
 * the circle that pushes neighbours around) and dashed at `drawnRadius` (what
 * actually inked). They are two members of ONE family, and that is the whole
 * content of §4a:
 *
 *     centre(R) = P + (R / packedRadius) · (footprintCenter − P)
 *     radius(R) = R · f̂r
 *
 * — centre and radius both scaling linearly from the anchor `P`, i.e. a
 * HOMOTHETY about `P`. So the pair STOPS BEING CONCENTRIC with each other (a
 * larger drawn radius also means a larger offset) and instead NESTS, packed
 * inside drawn, whenever `|f̂c| ≤ f̂r` — 60 of the 62 built-ins, median 0.948 —
 * and is internally TANGENT AT THE ANCHOR for the 4 degenerate ones, `leaf`
 * among them, whose circles literally pass through the anchor and grow away
 * from the line the glyph is rooted on. Truer than the old concentric pair.
 *
 * DECISION 14 SURVIVES INTACT. At `hold 0` the engine sets `drawnRadius` to
 * `packedRadius` to the last bit, so both calls return the identical centre AND
 * the identical radius — one ring — and their separation as the drag proceeds is
 * still the feature. (An override SCALE moves `drawnRadius` and deliberately not
 * `packedRadius`, so the two legitimately differ at `hold 0` on an overridden
 * glyph. That is the truth, not a bug — the note in the overlay says so.)
 *
 * `footprint` NULL means the root law, and everything collapses: `f̂r` reads 1
 * and `footprintCenter` IS the anchor, so this returns `{p.x, p.y, R}` — byte
 * for byte the ring drawn before this ticket.
 *
 * ⚠️ `packedRadius === 0` IS REACHABLE, at `margin: 0`, and it is the divisor.
 * The fallback is not a defensive guess: at a zero reserve the engine's own
 * committed disc is `(P, 0)` and it emits `footprintCenter === {x, y}`, so the
 * anchor is the same answer arrived at without the division.
 *
 * @param {object|null} placement  a Placement, carrying the always-present
 *                                 `footprintCenter` (decision 15's precedent).
 * @param {number} radius          the radius to state the ring at — `packedRadius`
 *                                 or `drawnRadius`.
 * @param {{cx:number,cy:number,r:number,angle:number}|null} footprint
 *                                 the placement's glyph, normalised; null under
 *                                 the root law.
 * @returns {{cx:number, cy:number, r:number}|null}
 */
export function ringGeometry(placement, radius, footprint) {
  if (!placement) return null;
  const { x, y, packedRadius, footprintCenter } = placement;
  const ratio = footprint ? footprint.r : 1;
  const scaled = radius * ratio;
  if (
    !footprintCenter ||
    !Number.isFinite(footprintCenter.x) ||
    !Number.isFinite(footprintCenter.y) ||
    !Number.isFinite(packedRadius) ||
    packedRadius === 0
  ) {
    return { cx: x, cy: y, r: scaled };
  }
  const k = radius / packedRadius;
  return { cx: x + k * (footprintCenter.x - x), cy: y + k * (footprintCenter.y - y), r: scaled };
}

/**
 * The DOTTED ring for an anchor that never became a glyph (#191, decision 8).
 *
 * The rejected ring gets the offset too. Story 11: *"rejected anchors' rings
 * offset too, so that the mark that exists to explain a mystery is not adding
 * one"* — with every other ring on screen displaced, four rings left sitting on
 * their anchors would overlap the survivors' territory and read as a fifth kind
 * of thing.
 *
 * ⚠️ IT IS COMPUTED, NOT COPIED, AND THAT IS THE ASYMMETRY WITH `ringGeometry`
 * ABOVE. A `Rejection` carries no `footprintCenter` — it is rejected before the
 * reserve is committed — so #200 gave it `rotation` instead, COPIED from the
 * same fully-resolved value a surviving placement reports, and the offset is
 * rebuilt here from that plus the glyph's own `f̂c`. The composition is the
 * engine's, derived and not guessed (ruling 7g): `placementMatrix` de-rotates by
 * `root.angle` BEFORE the placement's rotation, so the offset direction is
 * `Rot(θ − φ)·f̂c`, and `φ === 0` short-circuits to the bare rotation exactly as
 * the engine and `placementMatrix` both do.
 *
 * ⚠️ FLIP IS NOT AVAILABLE and is therefore NOT APPLIED. The engine mirrors the
 * reserve for a flipped glyph (`localX = flip ? -f.cx : f.cx`, because flip
 * mirrors the ART), but `Rejection` carries no `flip` field — the same gap #200
 * filled for `rotation`, one field along. A flipped rejected glyph's ring is
 * mirrored about the anchor's growth axis. Reported, not invented: there is no
 * honest source for it here.
 *
 * `wantedRadius` is the NATURAL TARGET — the size the glyph asked for, already
 * multiplied by any per-glyph override scale by `drawableRejection` above — so
 * the ring is the disc that glyph WOULD have occupied, in the same radius space
 * as the two live rings beside it.
 *
 * @param {{x:number, y:number, rotation?:number, wantedRadius:number}|null} rejection
 * @param {{cx:number,cy:number,r:number,angle:number}|null} footprint
 * @returns {{cx:number, cy:number, r:number}|null}
 */
export function rejectedRing(rejection, footprint) {
  if (!rejection) return null;
  const { x, y, wantedRadius } = rejection;
  if (!footprint) return { cx: x, cy: y, r: wantedRadius };
  const rotation = Number.isFinite(rejection.rotation) ? rejection.rotation : 0;
  const turned = footprint.angle === 0 ? rotation : rotation - footprint.angle;
  const theta = turned * DEG_TO_RAD;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  return {
    cx: x + wantedRadius * (footprint.cx * cosT - footprint.cy * sinT),
    cy: y + wantedRadius * (footprint.cx * sinT + footprint.cy * cosT),
    r: wantedRadius * footprint.r,
  };
}
