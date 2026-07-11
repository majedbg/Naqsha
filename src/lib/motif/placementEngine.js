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
import { largestEmptyCircleRadius, fitsAt } from './emptyCircle.js';
import { applyOverrides } from './overrides.js';

/**
 * @typedef {import('./anchors.js')} Anchors
 * @typedef {{id:string, role:string, x:number, y:number, tangent:number, normal:number, s:number, meta:object}} Anchor
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
 *   overrides?: {include?: OverrideRef[], exclude?: OverrideRef[], tolerance?: number},
 * }} [rules]
 * @param {{canvasW?:number, canvasH?:number}} [opts]
 * @returns {{survivors: Anchor[], orphans: OverrideRef[]}}
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

  // 7. Return survivors in ORIGINAL input order.
  const survivors = list.filter((a) => survivorIds.has(a.id));

  return { survivors, orphans };
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
// NOTE: proportional sizing requires a BOUNDED region. With a null boundary
// and no obstacles, largestEmptyCircleRadius is Infinity, so radius would be
// margin * Infinity = Infinity. Pass opts.boundary for proportional layouts.
//
// See docs/motif-adorn-arch-brief.md §8/§9.
// ---------------------------------------------------------------------------

/**
 * @typedef {{anchorId:string, role:string, index:number, x:number, y:number, rotation:number, scale:number, radius:number, seqId:string, flip:boolean}} Placement
 * @typedef {{anchorId:string, reason:'junction-skip'|'below-floor'|'no-fit'}} Rejection
 */

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
 *   sequence?: string[],
 *   flip?: boolean,
 *   orientation?: {policy?:'path'|'page', useNormal?:boolean, offset?:number, perRole?:object},
 *   jitter?: {seed?:number, lateral?:number, along?:number, rotation?:number, scale?:number,
 *             lateralRange?:number, alongRange?:number, rotationRange?:number, scaleRange?:number},
 *   sizing?: {mode?:'proportional'|'fixed', size?:number, min?:number, margin?:number},
 *   junction?: 'center'|'skip',
 * }} [config]
 * @param {{boundary?: null|{type:'rect',width:number,height:number}|{type:'polygon',points:{x:number,y:number}[]}}} [opts]
 * @returns {{placements: Placement[], rejected: Rejection[]}}
 */
export function resolvePlacements(survivors, config = {}, opts = {}) {
  const list = Array.isArray(survivors) ? survivors : [];
  const cfg = config || {};

  const sequence =
    Array.isArray(cfg.sequence) && cfg.sequence.length > 0
      ? cfg.sequence
      : PLACEMENT_DEFAULTS.sequence;
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

    // 2. Sequence + flip (independent counters).
    const seqId = sequence[i % sequence.length];
    const flip = flipEnabled && i % 2 === 1;

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
    let scaleFactor = 1 + sScale * j.scale * j.scaleRange;
    if (scaleFactor < MIN_SCALE_FACTOR) scaleFactor = MIN_SCALE_FACTOR;

    const x =
      anchor.x + lateralDisp * Math.cos(anchor.normal) + alongDisp * Math.cos(anchor.tangent);
    const y =
      anchor.y + lateralDisp * Math.sin(anchor.normal) + alongDisp * Math.sin(anchor.tangent);
    const center = { x, y };

    // 5. Sizing + test-before-place, against current `placed` + boundary.
    const size = sizing.size;
    const min = sizing.min;
    const R = largestEmptyCircleRadius(center, placed, boundary);
    let radius;

    if (sizing.mode === 'fixed') {
      radius = size * scaleFactor;
      if (R <= 0 || !fitsAt(center, radius, placed, boundary)) {
        rejected.push({ anchorId: anchor.id, reason: 'no-fit' });
        return;
      }
      if (radius < min) {
        rejected.push({ anchorId: anchor.id, reason: 'below-floor' });
        return;
      }
    } else {
      // proportional: scale-to-context, but never larger than the natural size
      // (size*scaleFactor) and never larger than the empty circle it must fit
      // inside. `margin` (clamped to (0,1]) is the fraction of the empty circle
      // to fill. radius = min(naturalTarget, margin*R) guarantees radius <= R,
      // so accepted footprints never overlap and an unbounded region (R=Inf)
      // simply falls back to the natural size — no Infinity leaks out.
      if (R <= 0) {
        rejected.push({ anchorId: anchor.id, reason: 'no-fit' });
        return;
      }
      const margin = Math.min(1, Math.max(0, sizing.margin));
      const naturalTarget = size * scaleFactor;
      radius = Math.min(naturalTarget, margin * R);
      if (radius < min) {
        rejected.push({ anchorId: anchor.id, reason: 'below-floor' });
        return;
      }
    }

    const scale = radius / size;
    placed.push({ x, y, r: radius });
    placements.push({
      anchorId: anchor.id,
      role: anchor.role,
      index: i,
      x,
      y,
      rotation,
      scale,
      radius,
      seqId,
      flip,
    });
  });

  return { placements, rejected };
}

/**
 * End-to-end composer: SELECT survivors, then RESOLVE placements.
 * `binding = { selection, placement }`; `opts` is passed straight to both
 * stages (selection reads canvasW/canvasH; resolution reads boundary).
 *
 * @param {Anchor[]} anchors
 * @param {{selection?: object, placement?: object}} [binding]
 * @param {{canvasW?:number, canvasH?:number, boundary?:object|null}} [opts]
 * @returns {{placements: Placement[], orphans: OverrideRef[], rejected: Rejection[]}}
 */
export function placeMotifs(anchors, binding = {}, opts = {}) {
  const b = binding || {};
  const { survivors, orphans } = selectAnchors(anchors, b.selection || {}, opts);
  const { placements, rejected } = resolvePlacements(survivors, b.placement || {}, opts);
  return { placements, orphans, rejected };
}
