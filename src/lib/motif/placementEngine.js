// Motif placement engine — pure, deterministic, headless (no p5/DOM/React).
//
// The engine turns Anchors (from anchors.js) into concrete motif placements
// through a fixed pipeline. This file currently implements the FIRST half:
// anchor SELECTION (which anchors survive the rules). A later slice will add
// `resolvePlacements` (transform + acceptance) to THIS same file, consuming
// the survivors produced here — keep the two cleanly separable.
//
// SELECTION pipeline order is contractual and must not change (downstream
// determinism depends on it):
//   1. role filter        → eligible list (input order preserved)
//   2. rate (every-Nth)   → indexed over the eligible list
//   3. skip mask (cycled) → indexed over the rate survivors
//   4. density (seeded)   → one mulberry32(seed) drawn per skip-survivor, in
//                           order; density>=1 keeps all and draws NOTHING so
//                           that enabling density later is the only thing that
//                           ever consumes the RNG
//   5. field mask         → sample field.sampleNorm(x/canvasW, y/canvasH)
//   6. overrides          → include (add back) then exclude (remove); exclude
//                           wins on conflict; unresolved include refs → orphans
//   7. return survivors in ORIGINAL input order + orphans
//
// See docs/motif-adorn-arch-brief.md §8/§9.

import { mulberry32 } from '../patterns/rng.js';
import { largestEmptyCircleParts, fitsAt } from './emptyCircle.js';
import { neighbourLimit, hostLimit, boundaryLimit } from './footprintSolve.js';
import { applyOverrides, applyGlyphOverrides, resolveOverrideRecords } from './overrides.js';
import { dealSlots, isSequenceBlock } from './sequencer.js';

/**
 * @typedef {import('./anchors.js')} Anchors
 * @typedef {{id:string, role:string, x:number, y:number, tangent:number, normal:number, s:number, meta:object, hostRadius?:number}} Anchor
 *   `hostRadius` (#146) is the OPTIONAL, TOP-LEVEL host-size channel: the radius
 *   of the container this anchor occupies. See `hasHostRadius` below.
 * @typedef {string | {id?:string, x?:number, y?:number, role?:string}} OverrideRef
 */

const DEFAULTS = {
  roles: null, // null/undefined ⇒ all roles pass
  rate: { n: 1, offset: 0 },
  skip: null,
  density: 1,
  seed: 1,
  field: null,
  fieldThreshold: 0.5,
  fieldInvert: false,
};

/**
 * Override resolution (`resolveRef`) and the include/exclude post-chain step
 * (`applyOverrides`) live in `./overrides.js`, shared verbatim with the new
 * `runSelectionChain` executor so the semantics exist in exactly one place.
 *
 * Anchor SELECTION stage of the motif placement engine.
 *
 * @param {Anchor[]} anchors
 * @param {{
 *   roles?: string[]|null,
 *   rate?: {n?:number, offset?:number},
 *   skip?: boolean[]|null,
 *   density?: number,
 *   seed?: number,
 *   field?: null | {sampleNorm:(u:number,v:number)=>number},
 *   fieldThreshold?: number,
 *   fieldInvert?: boolean,
 *   overrides?: {include?: OverrideRef[], exclude?: OverrideRef[], tolerance?: number}
 *     | {records?: Array<{ref: OverrideRef, hidden?: boolean, scale?: number, angle?: number}>, tolerance?: number},
 * }} [rules]
 * @param {{canvasW?:number, canvasH?:number}} [opts]
 * @returns {{survivors: Anchor[], orphans: OverrideRef[], overrideRecords: Map<string, object>}}
 */
export function selectAnchors(anchors, rules = {}, opts = {}) {
  const list = Array.isArray(anchors) ? anchors : [];
  const {
    roles = DEFAULTS.roles,
    rate,
    skip = DEFAULTS.skip,
    density = DEFAULTS.density,
    seed = DEFAULTS.seed,
    field = DEFAULTS.field,
    fieldThreshold = DEFAULTS.fieldThreshold,
    fieldInvert = DEFAULTS.fieldInvert,
    overrides,
  } = rules || {};

  // Clamp the every-Nth step to >= 1 so a degenerate n (0, negative, NaN)
  // deterministically means "keep all" regardless of offset, instead of
  // offset silently flipping n=0 between keep-all and keep-none.
  const rawN = rate && rate.n != null ? rate.n : DEFAULTS.rate.n;
  const n = rawN >= 1 ? Math.floor(rawN) : 1;
  const offset = rate && rate.offset != null ? rate.offset : DEFAULTS.rate.offset;

  // id → anchor, for override resolution by exact id.
  const byId = new Map();
  list.forEach((a) => {
    byId.set(a.id, a);
  });

  // 1. Role filter (preserve input order).
  let stage;
  if (roles == null) {
    stage = list.slice();
  } else {
    const roleSet = new Set(roles);
    stage = list.filter((a) => roleSet.has(a.role));
  }

  // 2. Rate: every-Nth over the eligible list's indices.
  if (n > 1 || offset !== 0) {
    stage = stage.filter((_, i) => n > 0 && (((i - offset) % n) + n) % n === 0);
  }
  // n === 1, offset === 0 ⇒ keep all (the fast default).

  // 3. Skip mask cycled over the rate survivors; true = drop.
  if (Array.isArray(skip) && skip.length > 0) {
    stage = stage.filter((_, j) => !skip[j % skip.length]);
  }

  // 4. Density: seeded keep. Draw ONCE per skip-survivor, in order, only when
  //    density < 1 (density >= 1 keeps all and consumes no RNG).
  if (density < 1) {
    const rand = mulberry32(seed);
    stage = stage.filter(() => rand() < density);
  }

  // 5. Field mask (only when a field and both canvas dims are present).
  const { canvasW, canvasH } = opts || {};
  if (field && canvasW != null && canvasH != null) {
    stage = stage.filter((a) => {
      const value = field.sampleNorm(a.x / canvasW, a.y / canvasH);
      return fieldInvert ? value < fieldThreshold : value >= fieldThreshold;
    });
  }

  // Rule-survivor set keyed by id (deduped implicitly — anchors have unique
  // ids and each passes the pipeline at most once).
  const survivorIds = new Set(stage.map((a) => a.id));

  // 6. Overrides — these OVERRIDE the rule result. Resolve refs against the
  //    FULL input list (so include can add back a rule-dropped anchor). The
  //    include-then-exclude / exclude-wins / orphan semantics live in
  //    overrides.js, shared with runSelectionChain.
  const orphans = applyOverrides(survivorIds, list, byId, overrides);

  // 6b. Resolve the SAME override records to anchors for the POST-PLACEMENT
  //     per-glyph scale/angle step (#137). Resolution has to happen here, against
  //     the FULL input list, because that is where a spatial re-bind is even
  //     possible; the map rides out so `resolvePlacements` can rewrite finished
  //     placements without re-resolving. Empty (and free) when there are no
  //     overrides at all. This never touches survivorship — that is `applyOverrides`
  //     above, whose pin-pass/hide-pass semantics stay exactly as they were.
  const { byAnchorId: overrideRecords } = resolveOverrideRecords(list, byId, overrides);

  // 7. Return survivors in ORIGINAL input order.
  const survivors = list.filter((a) => survivorIds.has(a.id));

  return { survivors, orphans, overrideRecords };
}

// ---------------------------------------------------------------------------
// TRANSFORM + ACCEPTANCE stage.
//
// Consumes the SELECTION survivors and turns each into a concrete Placement
// through a fixed, contractual pipeline (per survivor, in input order,
// index i = 0,1,2…). A growing `placed` obstacle list of ACCEPTED footprints
// makes sizing greedy and order-dependent (test-before-place, Wong et al.
// empty-circle). Determinism (same inputs+seeds ⇒ byte-identical output) is
// the contract, so:
//
//   • ONE mulberry32(jitter.seed) drives the whole run.
//   • For EVERY survivor, in order, we draw EXACTLY 4 values
//     (lateral → along → rotation → scale) BEFORE any early return — even for
//     junction-skipped anchors and even when a jitter amount is 0. This makes
//     the RNG stream independent of junction flags and accept/reject outcomes:
//     toggling one anchor's junction/fit never reshuffles another's jitter.
//   • `flip` is NOT folded into `rotation`; it stays a separate boolean the
//     renderer interprets as a mirror. `seqId` (sequence cycle) and `flip`
//     (2-cycle on odd i) are independent counters.
//   • `scale = radius / size` in BOTH sizing modes (fixed:
//     scaleFactor === radius/size), so the renderer always scales a canonical
//     motif of radius `size` up to the accepted `radius`.
//
// SEQUENCER (A4 — activates the dormant `seqId` hook). When `config.sequence` is
// the new object-form Block `{type:'sequence', mode, continuous, seed, slots}`
// (vs the legacy string array, which stays byte-identical), `dealSlots` runs
// FIRST — before the placement loop — so each survivor's Slot (glyph + modifiers,
// or a Rest) is known when the engine SIZES it. Slot modifiers fold into the base
// placement: `sizeScale` multiplies the target radius BEFORE the empty-circle
// acceptance test (a bigger slot claims a bigger footprint, so greedy packing
// pushes neighbors away rather than overlapping); `rotationOffset` + the hash-
// driven `rotationRandom` add to rotation; slot `flip`, WHEN SPECIFIED, REPLACES
// the legacy 2-cycle (slot-level is the more specific intent). A Rest draws its 4
// jitter values (keystone below) then early-returns BEFORE the acceptance loop,
// reserving NO footprint — a real gap that leaves neighbors' space untouched.
// The sequencer draws ONLY from hashRng (channels 'slot'/'rot'), NEVER the jitter
// stream, so a document with no sequence stays byte-identical (ADR-0005). Each
// sequenced placement gains a `glyphRef` (present IFF sequenced); B1 renders it.
//
// NOTE: proportional sizing requires a BOUNDED region. With a null boundary
// and no obstacles, largestEmptyCircleRadius is Infinity, so radius would be
// margin * Infinity = Infinity. Pass opts.boundary for proportional layouts.
//
// See docs/motif-adorn-arch-brief.md §8/§9, docs/motif-chain-plan.md, adr/0005.
// ---------------------------------------------------------------------------

/**
 * @typedef {{anchorId:string, role:string, index:number, x:number, y:number, rotation:number,
 *            scale:number, radius:number,
 *            packedRadius:number, drawnRadius:number, neighbourCap:number, hardCap:number,
 *            capBy:'natural'|'neighbour'|'boundary'|'host', saturated:boolean,
 *            capObstacle:null|{x:number,y:number,r:number},
 *            footprintCenter:{x:number,y:number},
 *            seqId:string|number, flip:boolean, glyphRef?:string}} Placement
 *
 *   `footprintCenter` (#204, §5f shape 1) is the WORLD centre of the disc this
 *   placement RESERVED — the same point, to the bit, as the `{x,y}` of the entry
 *   pushed into the packer's obstacle list, and therefore stated **at
 *   `packedRadius`**, not at `drawnRadius`. Three things ride on that choice: the
 *   reserve is what ruling 6e commits (`P + packedRadius·Rot(θ)·f̂c`); a per-glyph
 *   SCALE override leaves `packedRadius` alone (`overrides.js`), so this key needs
 *   no rescale there, only the angle recompute #205 adds; and the overlay's other
 *   ring is one homothety away — centre `P + (R/packedRadius)·(footprintCenter − P)`
 *   for any `R`, since centre and radius both scale linearly from the anchor (§4a).
 *
 *   ALWAYS PRESENT, no conditional shape, in every sizing mode — decision 15's
 *   precedent again. Under `sizing.footprint: 'root'` (and in `fixed` mode, which
 *   §5e leaves untouched in both footprint modes) it is `{x: placement.x,
 *   y: placement.y}`, because the root law's reserve IS anchor-centred at every
 *   radius.
 *
 *   SIZING DIAGNOSTICS (#186, decision 15/15b) — the seven keys from
 *   `packedRadius` to `capObstacle`. **Always present, in every sizing mode,
 *   with no opt-in flag and no conditional shape.** `Placement` is a TRANSIENT
 *   render structure — nothing here is persisted, exported or drawn as geometry
 *   — so the cost of carrying them unconditionally is test-golden churn, not
 *   determinism, and in exchange there is one code path instead of two. They
 *   are computed by the code that did the capping and are never re-derived from
 *   geometry by a caller.
 *
 *   `capBy` names what bound **`drawnRadius`** — the radius the user SEES — not
 *   what bound `packedRadius` (decision 15b). `capObstacle` is a COPIED
 *   `{x,y,r}`, never a reference into the packer's growing obstacle list.
 *
 * @typedef {{anchorId:string, reason:'junction-skip'|'below-floor'|'no-fit'|'rest',
 *            x?:number, y?:number, rotation?:number, wantedRadius?:number}} Rejection
 *
 *   REJECTION GEOMETRY (#191) — `x`, `y` and `wantedRadius` are present on the
 *   SIZING-STAGE reasons ONLY (`below-floor` and `no-fit`), because those are the
 *   two the footprint overlay draws, as a dotted empty ring at the size the glyph
 *   wanted. It cannot derive that ring from `{anchorId, reason}`: `x`/`y` are the
 *   POST-JITTER centre and the radius depends on `placed`, `margin`,
 *   `scaleFactor` and `sizeScale`, none of which a caller holds.
 *
 *   `wantedRadius` is the NATURAL TARGET (`size × scaleFactor × sizeScale`), never
 *   the drawn radius. It is the one quantity BOTH modes and BOTH reasons agree on:
 *   on the PROPORTIONAL path a `no-fit` at `R <= 0` returns before any cap is
 *   computed, so no drawn radius exists there at all; in `fixed` mode a radius does
 *   exist by then, but it IS this same expression, so the two modes report the same
 *   thing under one name. Decision 7 defines naturalTarget as literally "the size I
 *   want", and a `below-floor` glyph's drawn radius is by definition below
 *   `sizing.min`, so a ring drawn there would be an invisible speck — the exact
 *   failure the overlay exists to fix.
 *
 *   `rotation` (#200, footprint decision 8) rides with them, on the same five
 *   sizing-stage sites and no others. The footprint overlay offsets every ring by
 *   the glyph's ROTATED footprint centre, so without it a rejected anchor's dotted
 *   ring would be the one mark on screen still drawn anchor-centred — the mark that
 *   exists to explain a mystery would be adding one. It is FREE at the source:
 *   rotation is fully resolved below (`:462`, `:473`, `:476`) ABOVE every one of
 *   those sites, so it is COPIED — never recomputed, never re-derived from the
 *   anchor — and it is the SAME number a surviving placement reports.
 *
 *   THE CONDITIONAL SHAPE IS CORRECT, not an oversight. `junction-skip` and `rest`
 *   reject at the TOP of the loop, above the transform that computes the centre —
 *   the fields DO NOT EXIST YET at those two sites — and neither is a rejection
 *   the user needs explained, so the overlay draws nothing for them. Hoisting the
 *   transform to make the shape uniform would buy nothing and cost the two early
 *   returns their point.
 */

// Placement budget (2026-07-19 post-crash hardening, docs §6). A motif-bearing
// host swapped to a dense pattern (topographic / dendrite class) samples tens of
// thousands of survivor anchors; the acceptance loop below runs an O(n)
// empty-circle test against the growing `placed` list per survivor (so the loop
// is O(n²)) AND emits one drawn instance per accepted survivor — the tab hard-
// crashed. We cap the survivors PROCESSED at MAX_PLACEMENTS, keeping the FIRST N
// in sequence order (placement order = toolpath order, so the kept set is the
// deterministic leading prefix). Truncating the INPUT (not the output list)
// bounds the O(n²) work too, not just the instance count. The cap is surfaced —
// resolvePlacements returns `placementStats {total, placed}` so the render seam
// (useCanvas → Inspector) can show a "no silent cap" warning; there is no hidden
// truncation.
export const MAX_PLACEMENTS = 2000;

// EXPORTED (#207) so the overlay can ask rather than remember. `footprintScope`'s
// `isTightFootprint` used to carry its own copy of "absent ⇒ root"; an overlay
// that reads one law while the packer runs the other draws anchor-centred rings
// around offset art, silently and greenly. One object, both readers.
//
// ⚠️ `sizing.footprint` is `'root'` HERE and `'tight'` at the layer CONSTRUCTORS
// (`starterChips.js`, `defaultBinding.js`, `motifLayer.js`), and the asymmetry is
// the whole of decision 3. The default a NEW layer is born with belongs to the
// constructors, because it is written into the document and can be read back.
// What the ENGINE does with an ABSENT field is a different question, and it is
// answered by `migration.js:77`: `pinFootprint` leaves a v1 layer that never
// carried a `sizing` object alone rather than inventing the path. Absent must
// therefore keep meaning root, or exactly those documents repack on load through
// the one hole the pin cannot cover.
export const PLACEMENT_DEFAULTS = {
  sequence: ['A'],
  flip: false,
  orientation: { policy: 'path', useNormal: true, offset: 0, perRole: {} },
  jitter: {
    seed: 1,
    lateral: 0, along: 0, rotation: 0, scale: 0,
    lateralRange: 0, alongRange: 0, rotationRange: 0, scaleRange: 0,
  },
  sizing: { mode: 'proportional', size: 10, min: 0, margin: 1.0, footprint: 'root' },
  junction: 'center',
};

// Small positive floor so a jittered scaleFactor can never collapse to ≤0
// (which would emit a degenerate/negative footprint radius).
const MIN_SCALE_FACTOR = 1e-3;

const toDegrees = (rad) => (rad * 180) / Math.PI;

/**
 * The `hold` weight, coerced to a usable `0…1` (#186).
 *
 * ANYTHING NON-FINITE READS AS 0 — which is the pre-#186 engine exactly. That
 * covers an assignment predating the field, a hand-edited document carrying
 * `null`/a string, and the legacy unsequenced path (no assignment at all). The
 * clamp at the top matters just as much: `hold: 5` in a hand-edited document
 * must not inflate a glyph past its natural target.
 * @param {*} v @returns {number}
 */
function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * HOST-SIZE CHANNEL (#146) — does this anchor declare the container it occupies?
 *
 * NORMATIVE: `hostRadius` is an optional **top-level** field on the RUNTIME
 * anchor. Not `meta.hostRadius` (metadata is for role-specific descriptive
 * data; this is a placement-critical engine input), not a new sizing mode (that
 * would need a UI surface, a document field and a migration, and would leave
 * every existing cell host unable to opt in), and never written to the document.
 * As an optional anchor field the channel is inert for every host that does not
 * set it, and any host can adopt it later without touching the engine again.
 *
 * Anything not a FINITE POSITIVE number reads as ABSENT — a host that cannot
 * determine a container size simply omits the field, and a degenerate value must
 * degrade to "no container" rather than to "a container of size zero".
 * @param {Anchor} anchor @returns {boolean}
 */
function hasHostRadius(anchor) {
  return Number.isFinite(anchor.hostRadius) && anchor.hostRadius > 0;
}

const DEG_TO_RAD = Math.PI / 180;

/**
 * THE TIGHT FOOTPRINT, NORMALISED — the ONE place `viewRadius` divides (#204).
 *
 * ⚠️ RULING 7c, THE UNITS. `footprintSolve` is homogeneous: every coefficient is
 * degree 2 in length, so it solves for the multiplier in whatever frame `u` and
 * `fr` arrive in. Hand it RAW glyph-local `fc`/`fr` against world obstacles and
 * its root is `s = R / viewRadius` (the `placementMatrix` scale,
 * `instancing.js:77`); hand it `fc / viewRadius` and `fr / viewRadius` and its
 * root is `R` itself. BOTH compute cleanly and produce a plausible answer — one
 * of them is wrong by a factor of `viewRadius`, silently. The engine normalises
 * HERE, at the glyph, so the reserve is `P + R·f̂c` with radius `R·f̂r` and every
 * limit that comes back is directly in `R`, alongside `naturalTarget`, `hardCap`,
 * `neighbourCap`, `min` and `packedRadius`. A returned `s` that has to be
 * REMEMBERED to multiply is exactly the silent-and-green error class §7 of the
 * spec warns about. `footprintSolve.js` is NOT changed for this — it accepts
 * whatever frame it is handed and says so.
 *
 * LOUD, NEVER DEGRADED (ruling 7d). #198 established that Welzl silently swallows
 * an interior NaN, and an undefined `footprintRadius` sails through the solver's
 * sign tests and out as `Infinity`, i.e. "this obstacle never binds" — which
 * reads as a clean placement and DRAWS AS AN OVERLAP, on a machine that cuts
 * material. Falling back to the root law instead would be worse: the layer would
 * be packed by the law the user opted out of, silently and greenly. So it throws.
 *
 * THE GROWTH TURN COMES BACK WITH IT. `root.angle` is part of the frame `fc` was
 * measured in — `placementMatrix` de-rotates by it BEFORE the core scale/rotate
 * (`instancing.js:63`), so the reserve has to as well. An absent or non-finite
 * angle reads as 0, which is what every built-in carries and what
 * `importMotif.js` hard-codes; only the pen editor produces anything else.
 *
 * @param {object|null|undefined} glyph
 * @param {string} anchorId  named in the message — the failure is per-glyph.
 * @returns {{cx:number, cy:number, r:number, angle:number}} `f̂c` and `f̂r`, in
 *   units of `R`, plus `root.angle` in degrees.
 */
function normalisedFootprint(glyph, anchorId) {
  if (!glyph || typeof glyph !== 'object') {
    throw new TypeError(
      `placementEngine: sizing.footprint 'tight' needs a glyph for anchor "${anchorId}" — ` +
        'pass `opts.glyph` (and `opts.glyphMap` when the layer is sequenced)'
    );
  }
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
    throw new TypeError(
      `placementEngine: glyph "${glyph && glyph.id}" (anchor "${anchorId}") is missing a ` +
        'measured footprint — `footprintCenter`, `footprintRadius` and a positive ' +
        "`viewRadius` are all required under sizing.footprint 'tight'"
    );
  }
  const root = glyph.root;
  const angle = root && Number.isFinite(root.angle) ? root.angle : 0;
  return { cx: fc.x / viewRadius, cy: fc.y / viewRadius, r: fr / viewRadius, angle };
}

/**
 * Resolve effective orientation for a role: perRole[role] merged (per field)
 * over the base orientation. Never mutates either input.
 * @param {object} base
 * @param {string} role
 * @returns {{policy:string, useNormal:boolean, offset:number}}
 */
function resolveOrientation(base, role) {
  const b = base || {};
  const eff = {
    policy: b.policy != null ? b.policy : 'path',
    useNormal: b.useNormal != null ? b.useNormal : true,
    offset: b.offset != null ? b.offset : 0,
  };
  const per = b.perRole && b.perRole[role];
  if (per) {
    if (per.policy != null) eff.policy = per.policy;
    if (per.useNormal != null) eff.useNormal = per.useNormal;
    if (per.offset != null) eff.offset = per.offset;
  }
  return eff;
}

/**
 * TRANSFORM + ACCEPTANCE stage of the motif placement engine.
 *
 * @param {Anchor[]} survivors  SELECTION survivors, in input order.
 * @param {{
 *   sequence?: string[] | {type:'sequence', mode?:'cycle'|'random', continuous?:boolean, seed?:number, slots:object[]},
 *   flip?: boolean,
 *   orientation?: {policy?:'path'|'page', useNormal?:boolean, offset?:number, perRole?:object},
 *   jitter?: {seed?:number, lateral?:number, along?:number, rotation?:number, scale?:number,
 *             lateralRange?:number, alongRange?:number, rotationRange?:number, scaleRange?:number},
 *   sizing?: {mode?:'proportional'|'fixed', size?:number, min?:number, margin?:number,
 *             footprint?:'root'|'tight'},
 *   junction?: 'center'|'skip',
 * }} [config]
 *
 *   `sizing.footprint` (#204) selects the PACKING LAW. **Only the exact string
 *   `'tight'` opts in**; absent, `'root'` and anything else run the legacy arm,
 *   byte-identically (decision 7b / ADR-0005).
 *
 * @param {{boundary?: null|{type:'rect',width:number,height:number}|{type:'polygon',points:{x:number,y:number}[]},
 *          overrideRecords?: Map<string, {ref:*, hidden?:boolean, scale?:number, angle?:number}>,
 *          glyph?: object, glyphMap?: Record<string, object>}} [opts]
 *
 *   `glyph` / `glyphMap` are read ONLY by the `'tight'` arm — the legacy arm is
 *   glyph-agnostic and must stay so. Resolution mirrors the render loop's own rule
 *   (`MotifPattern.js`, per-placement glyph resolution): a sequenced slot's
 *   `glyphRef` resolves through `glyphMap`, everything else uses the base `glyph`,
 *   and an unresolved ref falls back to the base rather than being skipped — the
 *   engine cannot "draw nothing", it can only reserve space. A `'tight'` layer
 *   whose glyph carries no measured footprint THROWS (see `normalisedFootprint`).
 * @returns {{placements: Placement[], rejected: Rejection[], placementStats: {total:number, placed:number}}}
 */
export function resolvePlacements(survivors, config = {}, opts = {}) {
  const rawList = Array.isArray(survivors) ? survivors : [];
  const cfg = config || {};

  // Placement budget: keep the leading MAX_PLACEMENTS survivors in sequence
  // order. Truncate HERE — before dealSlots and the acceptance loop — so slot
  // assignment stays aligned with the kept survivors and the expensive
  // empty-circle work is bounded to the cap. `placementStats.total` is the
  // pre-truncation candidate count (what the warning reports as "N"); `placed`
  // is min(total, cap). truncated ⇔ total > placed.
  const total = rawList.length;
  const list = total > MAX_PLACEMENTS ? rawList.slice(0, MAX_PLACEMENTS) : rawList;
  const placementStats = { total, placed: list.length };

  const sequence =
    Array.isArray(cfg.sequence) && cfg.sequence.length > 0
      ? cfg.sequence
      : PLACEMENT_DEFAULTS.sequence;
  // New object-form Sequencer block? Deal Slots FIRST (pure, hashRng-only) so
  // each survivor's sizeScale is known BEFORE the acceptance loop sizes it. Null
  // ⇒ no sequence ⇒ the legacy string-array path below stays byte-identical.
  const seqBlock = isSequenceBlock(cfg.sequence) ? cfg.sequence : null;
  const assignments = seqBlock ? dealSlots(list, seqBlock) : null;
  const flipEnabled = !!cfg.flip;
  const orientation = cfg.orientation || PLACEMENT_DEFAULTS.orientation;
  const j = { ...PLACEMENT_DEFAULTS.jitter, ...(cfg.jitter || {}) };
  const sizing = { ...PLACEMENT_DEFAULTS.sizing, ...(cfg.sizing || {}) };
  const junction = cfg.junction != null ? cfg.junction : PLACEMENT_DEFAULTS.junction;
  const boundary = opts && opts.boundary != null ? opts.boundary : null;
  // THE PACKING LAW (#204, decision 7b). ONLY the exact string opts in: absent,
  // `'root'` and any other value run the legacy arm literally. The dispatch is a
  // string comparison hoisted out of the loop; nothing else about it is clever,
  // and that is the point — ADR-0005 is a byte-identity contract, not an
  // algebraic one, so `'root'` may not be expressed as the `fc = (0,0)`,
  // `fr = viewRadius` case of the tight law however true that is on paper.
  const tightFootprint = sizing.footprint === 'tight';
  const baseGlyph = opts && opts.glyph != null ? opts.glyph : null;
  const glyphMap = opts && opts.glyphMap != null ? opts.glyphMap : null;

  const rand = mulberry32(j.seed);
  const placed = []; // accepted footprints {x,y,r}, grown greedily in order.
  const placements = [];
  const rejected = [];

  list.forEach((anchor, i) => {
    // ── ALWAYS draw 4, in fixed order, BEFORE any early return ──────────────
    // This is the determinism keystone: every survivor consumes exactly four
    // RNG values regardless of junction/accept outcome, so the stream is
    // independent of those flags. Do not move any draw below a return.
    const dLat = rand();
    const dAlong = rand();
    const dRot = rand();
    const dScale = rand();

    // 1. Junction policy.
    //
    // BARE `{anchorId, reason}` — no rejection geometry (#191), and the same at
    // the Rest below. Both reject HERE, above the transform at step 4, so `x`/`y`
    // do not exist yet; and neither is a rejection the user needs a ring for (a
    // skipped junction and a Rest are both things they asked for). Only the two
    // SIZING-stage reasons carry geometry.
    if (anchor.meta && anchor.meta.junction === true && junction === 'skip') {
      rejected.push({ anchorId: anchor.id, reason: 'junction-skip' });
      return;
    }

    // 1b. Sequencer Rest — a real gap. The 4 jitter draws above already ran (so
    //     the stream is independent of which slots are rests), but a Rest emits
    //     NO placement and reserves NO footprint (never pushed to `placed`), so
    //     it leaves neighbors' space untouched instead of shoving them around.
    const assignment = assignments ? assignments[i] : null;
    if (assignment && assignment.rest) {
      rejected.push({ anchorId: anchor.id, reason: 'rest' });
      return;
    }

    // 2. Sequence + flip. Sequenced: seqId/glyphRef/modifiers come from the dealt
    //    Slot; slot flip (when SPECIFIED) REPLACES the legacy 2-cycle, else falls
    //    back to it. Legacy: the string-array cycle + 2-cycle flip, byte-identical.
    let seqId;
    let flip;
    let glyphRef;
    let sizeScale = 1;
    let slotRotation = 0;
    if (assignment) {
      seqId = assignment.seqId;
      glyphRef = assignment.glyphRef;
      sizeScale = assignment.sizeScale;
      slotRotation = assignment.rotationOffset + assignment.rotationRandomDelta;
      flip = assignment.flipSpecified ? assignment.flip : flipEnabled && i % 2 === 1;
    } else {
      seqId = sequence[i % sequence.length];
      flip = flipEnabled && i % 2 === 1;
    }

    // 3. Orientation. `flip` is intentionally NOT folded into rotation.
    const eff = resolveOrientation(orientation, anchor.role);
    const baseDeg =
      eff.policy === 'page' ? 0 : toDegrees(eff.useNormal ? anchor.normal : anchor.tangent);
    let rotation = baseDeg + eff.offset;

    // 4. Jitter. signed d ∈ [-1,1). Lateral along the NORMAL, along the
    //    TANGENT; rotation additive (deg); scale multiplicative.
    const sLat = dLat * 2 - 1;
    const sAlong = dAlong * 2 - 1;
    const sRot = dRot * 2 - 1;
    const sScale = dScale * 2 - 1;

    const lateralDisp = sLat * j.lateral * j.lateralRange;
    const alongDisp = sAlong * j.along * j.alongRange;
    rotation += sRot * j.rotation * j.rotationRange;
    // Slot rotation (static offset + hash-driven rotationRandom) is additive on
    // top of the jittered rotation; 0 when unsequenced.
    rotation += slotRotation;
    let scaleFactor = 1 + sScale * j.scale * j.scaleRange;
    if (scaleFactor < MIN_SCALE_FACTOR) scaleFactor = MIN_SCALE_FACTOR;

    const x =
      anchor.x + lateralDisp * Math.cos(anchor.normal) + alongDisp * Math.cos(anchor.tangent);
    const y =
      anchor.y + lateralDisp * Math.sin(anchor.normal) + alongDisp * Math.sin(anchor.tangent);
    const center = { x, y };

    // 5. Sizing + test-before-place, against current `placed` + boundary.
    //
    // The two empty-circle terms come back APART (#185) because they are not
    // the same kind of limit: the obstacle term is SOFT (a held glyph may
    // overlap a neighbour) while the boundary term is HARD. `R` below is
    // `Math.min` of the two, which is `largestEmptyCircleRadius` by definition
    // and byte-identical to it — required under ADR-0005.
    const size = sizing.size;
    const min = sizing.min;
    const parts = largestEmptyCircleParts(center, placed, boundary);
    const R = Math.min(parts.boundary, parts.obstacles);
    let radius;

    // The seven sizing diagnostics (#186, decisions 15/15b), ALWAYS emitted, in
    // both sizing modes. Filled in by whichever branch below did the capping —
    // never re-derived from geometry by a caller.
    let packedRadius; // what was reserved into `placed`
    let drawnRadius; // what was drawn (=== radius)
    let neighbourCap; // the SOFT cap; `hold` negotiates this one
    let hardCap; // the HARD cap; `hold` may never cross it
    let capBy; // 'natural' | 'neighbour' | 'boundary' | 'host'
    let saturated; // the drag hit the hard cap and further `hold` does nothing
    let capObstacle; // a COPY of the capping disc, or null

    // THE RESERVE (#204, ruling 6e). Null under the legacy law and in `fixed`
    // mode, where the reserve IS the anchor-centred disc `(P, R)` at every
    // radius. The tight arm fills it with `f̂c`/`f̂r` — the offset and radius per
    // unit of `R` — and the two places that need the actual disc (the `placed`
    // obstacle record and the emitted `footprintCenter`) build it from
    // `packedRadius` at the bottom of the loop, where `packedRadius` exists.
    let footprint = null;

    if (sizing.mode === 'fixed') {
      // sizeScale (slot modifier, default 1) grows the footprint BEFORE the
      // acceptance test so a bigger slot claims more space.
      radius = size * scaleFactor * sizeScale;
      // Both rejections carry the ring the overlay draws (#191). In `fixed` mode
      // the fixed radius IS the natural target — the very same expression — so
      // `wantedRadius` is `radius` with nothing to hoist.
      if (R <= 0 || !fitsAt(center, radius, placed, boundary)) {
        rejected.push({
          anchorId: anchor.id,
          reason: 'no-fit',
          x,
          y,
          rotation,
          wantedRadius: radius,
        });
        return;
      }
      if (radius < min) {
        rejected.push({
          anchorId: anchor.id,
          reason: 'below-floor',
          x,
          y,
          rotation,
          wantedRadius: radius,
        });
        return;
      }
      // `fixed` mode's CONTROL FLOW is untouched by #186 and `hold` is honestly
      // inert here: the glyph is its natural target, nothing capped it, and the
      // lerp would be identically a no-op because packedRadius === naturalTarget
      // (decision 5). It still emits all seven keys — decision 15 says "always
      // present, no conditional shape", and that includes this branch.
      packedRadius = radius;
      drawnRadius = radius;
      hardCap = radius; // fixed mode's naturalTarget
      // Infinity, not a number: `margin` is NOT applied in fixed mode, so there
      // is no honest computed neighbour cap to report. "Nothing constrains me
      // from that side" is the truthful value.
      neighbourCap = Infinity;
      capBy = 'natural';
      saturated = false;
      capObstacle = null;
    } else {
      // proportional: scale-to-context, but never larger than the natural size
      // (size*scaleFactor) and never larger than the empty circle it must fit
      // inside. `margin` (clamped to (0,1]) is the fraction of the empty circle
      // to fill. packedRadius <= R still holds, so accepted footprints never
      // overlap and an unbounded region (R=Inf) simply falls back to the natural
      // size — no Infinity leaks out.
      //
      // sizeScale grows only the NATURAL target, never the boundary/neighbour
      // caps nor the host-container cap, so the no-overlap invariant is
      // preserved and a Slot's size scale can never break containment.
      // `sizeScale` is INSIDE naturalTarget (decision 7), which is what makes
      // the pair read "Scale = the size I want; `hold` = how much packing is
      // allowed to take it away".
      //
      // HOISTED ABOVE THE `R <= 0` RETURN (#191) so that rejection can report the
      // radius it wanted — the only radius it will ever have, since it bails out
      // before any cap is computed. The move is byte-identical: this is pure
      // arithmetic over `size`, `scaleFactor` and `sizeScale`, all three fixed by
      // now, and all four RNG draws were consumed at the top of the loop, so the
      // determinism keystone ("exactly four draws per survivor, before any early
      // return") is untouched.
      const naturalTarget = size * scaleFactor * sizeScale;

      // `no-fit` at R <= 0 means the centre is INSIDE an already-committed disc.
      // That is not "capped by a neighbour", it is coincident with one, so it
      // stays a hard drop at every value of `hold` (decision 5).
      if (R <= 0) {
        rejected.push({
          anchorId: anchor.id,
          reason: 'no-fit',
          x,
          y,
          rotation,
          wantedRadius: naturalTarget,
        });
        return;
      }
      const margin = Math.min(1, Math.max(0, sizing.margin));

      // margin × one term, with the single IEEE754 product that would lie here:
      // `0 * Infinity` is NaN, but an INFINITE term means "this side does not
      // constrain at all", and scaling a non-constraint by any margin leaves it
      // a non-constraint. The fused `margin * Math.min(boundary, obstacles)`
      // this replaced never met that product unless BOTH terms were infinite,
      // because the finite term won the min first; splitting the terms exposes
      // it. Without the guard, `margin: 0` with a real boundary turns the FIRST
      // placement of a run from radius 0 into NaN. (§4b's code sketch omits
      // this — it is a gap in the sketch, not a liberty taken here.)
      const capOf = (term) => (term === Infinity ? Infinity : margin * term);

      // ── THE PACKING LAW, DISPATCHED ON `sizing.footprint` (#204, decision 7b) ──
      //
      // Two arms, deliberately not one parameterised expression. The tight law
      // reduces to the legacy one at `fc = (0,0)`, `fr = viewRadius` ALGEBRAICALLY
      // and NOT in IEEE754: `√(rⱼ² + |a|² − rⱼ²) − rⱼ` does not return `|a| − rⱼ`
      // bit-for-bit (the add-then-subtract eats mantissa whenever `rⱼ > |a|` and
      // the trailing `− rⱼ` cancels catastrophically on top), and `Math.hypot` is
      // deliberately not `√(dx² + dy²)` bit-for-bit either. ADR-0005 is a
      // BYTE-IDENTITY contract, so the legacy arm below runs today's expressions
      // literally — not refactored, not extracted, not sharing a cap expression
      // with the tight arm. That is the entire reason the solve is a sibling
      // module and `emptyCircle.js` has a zero-line diff.
      //
      // What is shared above this point is shared because it is IDENTICAL in both
      // laws and computes no clearance: `naturalTarget`, the `R <= 0` guard (still
      // read from `parts`, the obstacle-identity loop is untouched), `margin` and
      // `capOf`. What is shared BELOW is everything that CONSUMES the two caps —
      // §5e: "the footprint change moves what `neighbourCap` and `hardCap` are; it
      // does not touch what is done with them."
      let hardCapBy;
      // The obstacle that produced `neighbourCap` — recorded by the code that lost
      // to it, never re-derived from geometry by a caller (#185/#186 rule).
      let capWinner;

      if (tightFootprint) {
        // ── THE TIGHT LAW ────────────────────────────────────────────────────
        // The reserve is no longer `(P, R)`. It is the glyph's minimal enclosing
        // circle carried into the world: centre `P + R·f̂c`, radius `R·f̂r`, with
        // `f̂c = Rot(θ)·footprintCenter / viewRadius` — so both the centre and the
        // radius scale with the radius being solved for, and each clearance test
        // becomes one quadratic where there is one division on the legacy arm.
        //
        // ⚠️ UNITS: `normalisedFootprint` already divided by `viewRadius` (ruling
        // 7c), so every limit returned below is directly in `R`.
        const glyph =
          (glyphRef != null && glyphMap ? glyphMap[glyphRef] : null) || baseGlyph;
        const f = normalisedFootprint(glyph, anchor.id);

        // `u = Rot(rotation)·f̂c`, ONE cos/sin pair per survivor and NO RNG:
        // `rotation` is fully resolved above (base orientation + jitter + slot
        // rotation), below all four draws, so the determinism keystone is
        // untouched — decision 1 needs no pipeline reorder.
        //
        // ⚠️ `flip` MIRRORS THE RESERVE, because it mirrors the ART. The renderer
        // folds flip into `sx` (`instancing.js:78`), so a flipped glyph's ink sits
        // at `Rot(θ)·(−fc.x, fc.y)`. §5e writes `u = Rot(θ)·fc` without mentioning
        // flip; reserving the UNMIRRORED disc for mirrored art would put the ink
        // outside the space the packer cleared — and under the hard tier it would
        // put a CUT outside the material or outside its cell, which #146 and the
        // PRD's story 8 call inviolable. So the mirror is applied here, in the one
        // expression that reads the glyph, and costs nothing.
        //
        // ⚠️ THE GROWTH TURN IS PART OF THE COMPOSITION, and leaving it out is a
        // CUT OUTSIDE THE MATERIAL. `placementMatrix` composes
        //     M = T(P) · R(θ) · S(sx,sy) · R(−φ) · T(−root),   φ = root.angle
        // (`instancing.js:63`), so a root-relative art point `q` lands at
        // `P + R(θ)·diag(σ,1)·s·R(−φ)·q` with `σ = −1` when flipped. Since
        // `R(θ)·R(−φ) = R(θ−φ)` and `diag(−1,1)·R(−φ) = R(φ)·diag(−1,1)`, the
        // reserve offset is `R(θ−φ)·f̂c` unflipped and `R(θ+φ)·(−f̂c.x, f̂c.y)`
        // flipped — ONE angle either way, so this still costs one cos/sin pair.
        // `Rot(θ)·f̂c` alone is correct only at φ = 0; measured, `slice100` given
        // a 90° turn put ink 74.9% of the reserve radius outside the committed
        // disc. Latent because all 62 built-ins and `importMotif.js:116` are 0 —
        // `PenCanvas.jsx:433-435` is not.
        //
        // φ === 0 short-circuits to the bare `rotation`, mirroring
        // `placementMatrix`'s own default-root short-circuit: it keeps every
        // shipped glyph bit-identical instead of relying on `±0` arithmetic.
        const localX = flip ? -f.cx : f.cx;
        const turned = f.angle === 0 ? rotation : flip ? rotation + f.angle : rotation - f.angle;
        const theta = turned * DEG_TO_RAD;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const u = { x: localX * cosT - f.cy * sinT, y: localX * sinT + f.cy * cosT };

        // HARD TIER — boundary AND host, each the LARGER of the two bounds
        // (decision 5-rev, ruled by Majed 2026-07-29, superseding 5/5b/5c/5d).
        //
        // Decision 5 restated this tier against the tight disc ALONE, on the
        // grounds that it is "the same guarantee with less waste". The first half
        // is true and the second is backwards. `viewRadius` is measured from the
        // root to the farthest point and the root sits ON the minimal enclosing
        // circle, so `|f̂c| + f̂r ≥ 1` by the triangle inequality — ALWAYS. At an
        // undisplaced centre the tight law therefore reads `R ≤ H/(|f̂c| + f̂r)`,
        // which is never better than the root law's `R ≤ H`: 61 of the 62
        // built-ins SHRANK, `slice100` (reach 1.2058) to 0.829×. The minimal
        // enclosing circle bulges past the ink on the far side, so as an envelope
        // for containment measured FROM A POINT it is strictly looser, even
        // though it is strictly tighter disc-against-disc.
        //
        // Both bounds are INDEPENDENTLY SOUND CONTAINMENT CERTIFICATES — art
        // inside the root disc guarantees art inside the container, and so does
        // art inside the tight disc — so taking whichever permits the larger `R`
        // is safe and is never worse than either. Root wins at an undisplaced
        // centre; tight wins once jitter displaces the glyph away from the
        // direction it leans, which is where decision 5's 2× actually lives.
        //
        // ⚠️ WHAT SURVIVES IS *ART* INSIDE THE CONTAINER, NOT *RESERVE* INSIDE THE
        // CONTAINER. When the root bound wins, the committed tight disc may poke
        // outside the cell or the region — legitimately, because it bulges past
        // the ink. Anything asserting containment must assert it of the flattened
        // art, not of `footprintCenter ± packedRadius·f̂r`.
        //
        // ⚠️ THE NEIGHBOUR TERM IS NOT TOUCHED. It is genuinely disc-vs-disc, the
        // tight disc is correct there, and the entire 4× recovery lives in it.
        //
        // The root-side expressions below are COPIED from the legacy arm, not
        // shared with it: ADR-0005 is a byte-identity contract and the legacy arm
        // must keep running its own literal lines (decision 7b).
        const boundaryCap = Math.max(
          capOf(parts.boundary),
          capOf(boundaryLimit({ x, y }, u, f.r, boundary))
        );
        hardCap = Math.min(naturalTarget, boundaryCap);
        hardCapBy = boundaryCap < naturalTarget ? 'boundary' : 'natural';

        if (hasHostRadius(anchor)) {
          // The SAME displacement the legacy arm takes `d = |v|` of — the rule is
          // still stated against the DISPLACED centre, it is just no longer a
          // distance subtraction, because the disc now inflates and drifts at
          // once. Decision 5c: `hostCap <= 0 → reject` restates as "no positive R
          // satisfies the containment inequality → reject", which is exactly what
          // `hostLimit`'s `-1` (centre already outside the container) reports.
          const v = { x: x - anchor.x, y: y - anchor.y };
          const lim = hostLimit(v, u, f.r, anchor.hostRadius);
          // `capOf`, not a bare `margin * lim`, for the reason recorded at the
          // guard's definition above: a container that never binds comes back
          // `Infinity`, and `0 * Infinity` is NaN. On every finite `lim` this is
          // the identical product §5e writes. A non-positive `lim` — `-1` for a
          // centre already outside the container — contributes NOTHING to the max
          // rather than a negative number, so it can never drag the root bound
          // down; it just loses.
          const tightHostCap = lim > 0 ? capOf(lim) : 0;
          // The root-law bound, COPIED verbatim from the legacy arm below (the
          // same `d`, the same `Math.max(0, …)` clamp, the same `margin ×`).
          const d = Math.hypot(x - anchor.x, y - anchor.y);
          const rootHostCap = margin * Math.max(0, anchor.hostRadius - d);
          const hostCap = Math.max(rootHostCap, tightHostCap);
          // Decision 5c, restated for the max: reject only when NEITHER bound
          // permits a positive `R`. Under the root law that is "displaced clean
          // out of the container"; under the tight law it is `hostLimit`'s `-1`,
          // which is the same condition. They agree, so this stays a single guard.
          if (hostCap <= 0) {
            rejected.push({
              anchorId: anchor.id,
              reason: 'no-fit',
              x,
              y,
              rotation,
              wantedRadius: naturalTarget,
            });
            return;
          }
          // The same `<=` tie-break, for the same recorded reason (the boundary is
          // already on screen; the host container has no visual representation).
          if (hostCap <= hardCap) {
            hardCap = hostCap;
            hardCapBy = 'host';
          }
        }

        // SOFT TIER — one `neighbourLimit` per obstacle where the legacy arm has
        // one subtraction. Min-reduced with the SAME `<` accumulation and
        // `Infinity` seed as `emptyCircle.js:125-135`, so a NaN limit can never
        // displace a good one (`NaN < x` is false, where `Math.min` would
        // propagate it) and exact ties select the first obstacle encountered.
        //
        // ⚠️ THE WINNER IS FOUND DIFFERENTLY (decision 6b). The legacy captor is
        // the obstacle minimising `d − r`; this one is the obstacle yielding the
        // SMALLEST MAX-`R`. Those are not the same ordering once the reserve is
        // offset — a disc further away in the direction the art leans can bind
        // harder than a nearer one behind the root. `capBy`'s MEANING is unchanged:
        // it still names what bound the radius the user sees.
        //
        // `neighbourLimit` returns `-1` when the centre is already INSIDE an
        // obstacle. That is the same condition the `R <= 0` guard above rejected
        // on (`parts.obstacles = |a| − rⱼ < 0`), so it is unreachable here except
        // through a float disagreement at exact tangency between `|a| − rⱼ` and
        // `|a|² − rⱼ²`; it degrades to a negative cap and then to a `below-floor`
        // rejection, never to a negative reserved radius. No extra branch.
        let limit = Infinity;
        for (const obstacle of placed) {
          const a = { x: x - obstacle.x, y: y - obstacle.y };
          const lim = neighbourLimit(a, u, f.r, obstacle.r);
          if (lim < limit) {
            limit = lim;
            capWinner = obstacle;
          }
        }
        // ⚠️ SOLVE-THEN-SCALE (decision 6d), the single most misapplicable line in
        // this build. `capOf(limit)` — NOT `neighbourLimit(a, u, f.r / margin, rⱼ)`,
        // which is a DIFFERENT NUMBER: `fr` appears in `B = 2(a·u − rⱼ·fr)` as well
        // as in `A`, and the offset `R·u` scales with `R` too, so an inflated
        // reserve also sits further out — inflating moves the tangency point rather
        // than just growing the circle. The binding condition solved here is
        // `|a + R·u| = R·f̂r + rⱼ`, distance between centres equal to the sum of
        // radii, which IS external tangency by definition; that is what the
        // overlay's captor link draws (decision 6c), and inflate-then-solve would
        // quietly falsify it while every test stayed green.
        neighbourCap = capOf(limit);
        // Carried to the bottom of the loop, where `packedRadius` exists: the
        // committed obstacle disc and the emitted `footprintCenter` are both built
        // from it (ruling 6e).
        footprint = { ux: u.x, uy: u.y, fr: f.r };
      } else {
        // HARD TIER — the boundary and the host container, together. `hold` can
        // NEVER relax this (decision 4): a cut outside the material and a glyph
        // escaping its cell are not aesthetic choices, and #146 already declares
        // containment inviolable.
        const boundaryCap = capOf(parts.boundary);
        hardCap = Math.min(naturalTarget, boundaryCap);
        hardCapBy = boundaryCap < naturalTarget ? 'boundary' : 'natural';

        // HOST-SIZE CHANNEL (#146). An anchor may declare the radius of the
        // CONTAINER it occupies as an optional TOP-LEVEL `hostRadius`. Containment
        // is a DISTANCE rule, not a radius cap: the four jitter draws above have
        // already displaced the placement centre along the anchor's normal and
        // tangent, so a glyph clamped to margin*hostRadius alone still crosses its
        // container whenever the centre moved. The rule is stated against the
        // DISPLACED centre, using the GEOMETRIC displacement (the two differ once
        // tangent and normal are not perpendicular):
        //     radius <= margin * max(0, hostRadius - d),  d = |centre - anchor|
        // It enters as a further argument to the SAME minimum, so it can only ever
        // shrink a glyph — the empty-circle terms and the no-overlap invariant are
        // untouched, and the layer's size stays a ceiling.
        //
        // A zero/negative cap (the centre was displaced clean out of its
        // container) is a rejection, never a negative radius — and it is decided
        // HERE, before any drawn radius exists, so `hold` cannot rescue it. The
        // guard is gated STRICTLY inside this branch: a document with margin 0 and
        // NO hostRadius still produces the accepted zero-radius placement it
        // produces today.
        if (hasHostRadius(anchor)) {
          const d = Math.hypot(x - anchor.x, y - anchor.y);
          const hostCap = margin * Math.max(0, anchor.hostRadius - d);
          if (hostCap <= 0) {
            rejected.push({
              anchorId: anchor.id,
              reason: 'no-fit',
              x,
              y,
              rotation,
              wantedRadius: naturalTarget,
            });
            return;
          }
          // TIE-BREAK, deliberate: at hostCap === boundaryCap we report 'host'.
          // The region boundary is already visible on screen and decision 17
          // forbids drawing it; the host container has no visual representation at
          // all, so naming the host is the strictly more informative answer.
          if (hostCap <= hardCap) {
            hardCap = hostCap;
            hardCapBy = 'host';
          }
        }

        // SOFT TIER — the neighbour term, the only thing `hold` negotiates.
        neighbourCap = capOf(parts.obstacles);
        capWinner = parts.obstacle;
      }

      // The radius RESERVED into `placed`. This is exactly the radius the engine
      // produced before #186, and it is what every following glyph sizes around
      // (decision 1): a held glyph draws bigger but claims no extra space, so
      // "who wins when two neighbours both refuse to shrink" dissolves — nobody
      // claims, they simply overlap — and the change stays order-independent.
      packedRadius = Math.min(hardCap, neighbourCap);

      // ⚠️ POLARITY (decision 3): w = 1 is NEVER SHRINK, w = 0 is the pre-#186
      // engine and the migration default. No inversion layer exists anywhere.
      // `hold` draws NO RNG — it is read here, below all four jitter draws, so
      // ADR-0005's "exactly four draws per survivor" keystone is untouched.
      const w = clamp01(assignment ? assignment.hold : 0);
      // Linear in RADIUS (decision 10), not area and not gamma — every size
      // quantity in this engine is a radius and the overlay draws radii.
      // At w = 0 this is `packedRadius + 0`, i.e. packedRadius EXACTLY, so
      // drawnRadius === packedRadius to the last bit. That is the migration
      // guarantee: absent hold ⇒ 0 ⇒ nothing below moves.
      const lerp = packedRadius + (naturalTarget - packedRadius) * w;
      drawnRadius = Math.min(hardCap, lerp);

      // Decision 5: the floor tests the DRAWN radius, so `hold` can rescue a
      // glyph that packing shrank out of existence.
      if (drawnRadius < min) {
        // `wantedRadius` is naturalTarget, NOT `drawnRadius` (#191): drawnRadius
        // is by definition below the floor here, so a ring drawn at it would be
        // the invisible speck the overlay exists to replace.
        rejected.push({
          anchorId: anchor.id,
          reason: 'below-floor',
          x,
          y,
          rotation,
          wantedRadius: naturalTarget,
        });
        return;
      }

      // `capBy` names what bound the radius the USER SEES (decision 15b).
      // Defining it against the reserve would report 'neighbour' in the
      // saturation case — true of the reserve, and useless to the person
      // dragging, who needs to know why the drag stopped.
      //   • 'natural' wins hardCap ties by the ordering, which is right: "you
      //     got the size you asked for" beats "the page edge also happened to be
      //     exactly there".
      //   • the equality is EXACT, not approximate: drawnRadius is literally
      //     Math.min(hardCap, lerp), so `=== hardCap` is exact when hardCap won.
      //     No epsilon belongs here.
      if (drawnRadius >= naturalTarget) capBy = 'natural';
      else if (drawnRadius === hardCap) capBy = hardCapBy;
      else capBy = 'neighbour';
      // STRICT `>`: at w = 0 the lerp IS packedRadius (<= hardCap), so a
      // document without `hold` is never reported as saturated.
      saturated = lerp > hardCap;
      // #185 reports the winning obstacle unconditionally; the reduction to
      // null happens HERE, where capBy is derived. The three numbers are COPIED
      // — a reference into `placed` would alias an array the loop keeps
      // mutating, and the overlay must be able to draw the disc without
      // reaching back into engine internals.
      //
      // `capWinner` is whichever arm above lost to it: `parts.obstacle` on the
      // legacy arm (the `d − r` minimiser, unchanged), the smallest-max-`R`
      // winner on the tight arm (decision 6b). Recorded by the code that did the
      // capping, never re-derived here.
      capObstacle =
        capBy === 'neighbour' && capWinner
          ? { x: capWinner.x, y: capWinner.y, r: capWinner.r }
          : null;

      radius = drawnRadius;
    }

    const scale = radius / size;
    // Decisions 1 + 6: `placed` ALWAYS receives packedRadius, INCLUDING a glyph
    // rescued from below the floor. There is no third "drawn but invisible to
    // the packer" state, and the reserved-disc no-overlap invariant is exactly
    // as strong as it was before #186.
    //
    // ⚠️ RULING 6e — UNDER THE TIGHT LAW THE COMMITTED DISC IS THE OFFSET ONE:
    // `{x: P + R·f̂c, r: R·f̂r}` with `R = packedRadius`. Not a choice, and the
    // single place this slice could have gone silently inert: keeping obstacles
    // anchor-centred would size tight discs against root-centred ones — precisely
    // the mixed model decision 5b rejects — and the reserve the NEIGHBOURS see is
    // the only reserve that matters, so the fix would have measured as "no
    // change" while every existing test still passed. Decision 6 is unaffected:
    // this is still a bare `{x, y, r}` with no back-reference to the glyph.
    // `footprint` is null on the legacy arm and in `fixed` mode, where the
    // reserve genuinely IS `(P, R)`.
    const reserve = footprint
      ? {
          x: x + packedRadius * footprint.ux,
          y: y + packedRadius * footprint.uy,
          r: packedRadius * footprint.fr,
        }
      : { x, y, r: packedRadius };
    placed.push(reserve);
    const placement = {
      anchorId: anchor.id,
      role: anchor.role,
      index: i,
      x,
      y,
      rotation,
      scale,
      radius,
      packedRadius,
      drawnRadius,
      neighbourCap,
      hardCap,
      capBy,
      saturated,
      capObstacle,
      // The world centre of the disc just committed, stated AT `packedRadius` —
      // the same two numbers as `reserve`, COPIED rather than shared, because
      // `reserve` is now an entry in the obstacle list the loop keeps growing and
      // an alias would let a reader mutate the packer's own state (the same rule
      // `capObstacle` is copied under). `{x, y}` on the legacy arm and in `fixed`
      // mode: the root law's reserve is anchor-centred at every radius.
      footprintCenter: { x: reserve.x, y: reserve.y },
      seqId,
      flip,
    };
    // `glyphRef` is present IFF this placement was sequenced. The legacy path
    // MUST NOT emit the key at all (not even `undefined`) so unsequenced output
    // stays byte-identical in shape — B1 keys per-instance glyph resolution off
    // its presence.
    if (assignment) placement.glyphRef = glyphRef;
    placements.push(placement);
  });

  // POST-PLACEMENT per-glyph overrides (#137). Deliberately the LAST thing that
  // happens, outside the loop: `placed` was grown from the un-overridden radii,
  // so packing, the `min` floor and every accept/reject decision above were all
  // made on the natural footprint. A scaled-up glyph therefore may overlap its
  // neighbours — accepted, and the only alternative (re-packing) would make a
  // drag on one glyph shove unrelated ones around. No-op (same array back) when
  // no record carries a usable scale/angle, so the RNG stream and the emitted
  // placement shape stay byte-identical for every document without them.
  return {
    placements: applyGlyphOverrides(placements, opts && opts.overrideRecords),
    rejected,
    placementStats,
  };
}

/**
 * End-to-end composer: SELECT survivors, then RESOLVE placements.
 * `binding = { selection, placement }`; `opts` is passed straight to both
 * stages (selection reads canvasW/canvasH; resolution reads boundary).
 *
 * @param {Anchor[]} anchors
 * @param {{selection?: object, placement?: object}} [binding]
 * @param {{canvasW?:number, canvasH?:number, boundary?:object|null}} [opts]
 * @returns {{placements: Placement[], orphans: OverrideRef[], rejected: Rejection[], placementStats: {total:number, placed:number}}}
 */
export function placeMotifs(anchors, binding = {}, opts = {}) {
  const b = binding || {};
  const { survivors, orphans, overrideRecords } = selectAnchors(anchors, b.selection || {}, opts);
  // Thread the resolved records into the placement stage so the per-glyph
  // scale/angle apply is automatic for every caller of this composer (#137).
  const { placements, rejected, placementStats } = resolvePlacements(survivors, b.placement || {}, {
    ...opts,
    overrideRecords,
  });
  return { placements, orphans, rejected, placementStats };
}
