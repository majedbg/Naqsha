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
 *            seqId:string|number, flip:boolean, glyphRef?:string}} Placement
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
 * @typedef {{anchorId:string, reason:'junction-skip'|'below-floor'|'no-fit'|'rest'}} Rejection
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

const PLACEMENT_DEFAULTS = {
  sequence: ['A'],
  flip: false,
  orientation: { policy: 'path', useNormal: true, offset: 0, perRole: {} },
  jitter: {
    seed: 1,
    lateral: 0, along: 0, rotation: 0, scale: 0,
    lateralRange: 0, alongRange: 0, rotationRange: 0, scaleRange: 0,
  },
  sizing: { mode: 'proportional', size: 10, min: 0, margin: 1.0 },
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
 *   sizing?: {mode?:'proportional'|'fixed', size?:number, min?:number, margin?:number},
 *   junction?: 'center'|'skip',
 * }} [config]
 * @param {{boundary?: null|{type:'rect',width:number,height:number}|{type:'polygon',points:{x:number,y:number}[]},
 *          overrideRecords?: Map<string, {ref:*, hidden?:boolean, scale?:number, angle?:number}>}} [opts]
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

    if (sizing.mode === 'fixed') {
      // sizeScale (slot modifier, default 1) grows the footprint BEFORE the
      // acceptance test so a bigger slot claims more space.
      radius = size * scaleFactor * sizeScale;
      if (R <= 0 || !fitsAt(center, radius, placed, boundary)) {
        rejected.push({ anchorId: anchor.id, reason: 'no-fit' });
        return;
      }
      if (radius < min) {
        rejected.push({ anchorId: anchor.id, reason: 'below-floor' });
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
      // `no-fit` at R <= 0 means the centre is INSIDE an already-committed disc.
      // That is not "capped by a neighbour", it is coincident with one, so it
      // stays a hard drop at every value of `hold` (decision 5).
      if (R <= 0) {
        rejected.push({ anchorId: anchor.id, reason: 'no-fit' });
        return;
      }
      const margin = Math.min(1, Math.max(0, sizing.margin));
      // sizeScale grows only the NATURAL target, never the boundary/neighbour
      // caps nor the host-container cap, so the no-overlap invariant is
      // preserved and a Slot's size scale can never break containment.
      // `sizeScale` is INSIDE naturalTarget (decision 7), which is what makes
      // the pair read "Scale = the size I want; `hold` = how much packing is
      // allowed to take it away".
      const naturalTarget = size * scaleFactor * sizeScale;

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

      // HARD TIER — the boundary and the host container, together. `hold` can
      // NEVER relax this (decision 4): a cut outside the material and a glyph
      // escaping its cell are not aesthetic choices, and #146 already declares
      // containment inviolable.
      const boundaryCap = capOf(parts.boundary);
      hardCap = Math.min(naturalTarget, boundaryCap);
      let hardCapBy = boundaryCap < naturalTarget ? 'boundary' : 'natural';

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
          rejected.push({ anchorId: anchor.id, reason: 'no-fit' });
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
        rejected.push({ anchorId: anchor.id, reason: 'below-floor' });
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
      capObstacle =
        capBy === 'neighbour' && parts.obstacle
          ? { x: parts.obstacle.x, y: parts.obstacle.y, r: parts.obstacle.r }
          : null;

      radius = drawnRadius;
    }

    const scale = radius / size;
    // Decisions 1 + 6: `placed` ALWAYS receives packedRadius, INCLUDING a glyph
    // rescued from below the floor. There is no third "drawn but invisible to
    // the packer" state, and the reserved-disc no-overlap invariant is exactly
    // as strong as it was before #186.
    placed.push({ x, y, r: packedRadius });
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
