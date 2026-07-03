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

const DEFAULT_TOLERANCE = 8;

/**
 * Resolve an override ref to a concrete anchor from the FULL input list.
 *
 * Resolution order:
 *   1. exact `id` match (ignores role) — the ref's `id` string, or `ref.id`.
 *   2. else spatial re-bind to the NEAREST anchor (euclidean) within
 *      `tolerance`. If the ref specifies a `role`, only anchors of that role
 *      are candidates. Ties broken by input order (strict `<`, first wins).
 *   3. else null (caller treats an unresolved INCLUDE ref as an orphan).
 *
 * @param {OverrideRef} ref
 * @param {Anchor[]} anchors  full input list (NOT the survivor set)
 * @param {Map<string, Anchor>} byId
 * @param {number} tolerance
 * @returns {Anchor|null}
 */
function resolveRef(ref, anchors, byId, tolerance) {
  const id = typeof ref === 'string' ? ref : ref && ref.id;
  if (id != null) {
    const hit = byId.get(id);
    if (hit) return hit;
  }

  // Spatial re-bind requires coordinates.
  if (ref == null || typeof ref === 'string') return null;
  if (ref.x == null || ref.y == null) return null;

  const role = ref.role;
  let best = null;
  let bestDist = Infinity;
  for (const anchor of anchors) {
    if (role != null && anchor.role !== role) continue;
    const dist = Math.hypot(anchor.x - ref.x, anchor.y - ref.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  if (best && bestDist <= tolerance) return best;
  return null;
}

/**
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

  const n = rate && rate.n != null ? rate.n : DEFAULTS.rate.n;
  const offset = rate && rate.offset != null ? rate.offset : DEFAULTS.rate.offset;

  // Original-index map: drives the final stable sort and lets overrides inject
  // anchors back in the right place regardless of when they were resolved.
  const indexById = new Map();
  const byId = new Map();
  list.forEach((a, i) => {
    indexById.set(a.id, i);
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
  //    FULL input list (so include can add back a rule-dropped anchor).
  const orphans = [];
  if (overrides) {
    const tolerance = overrides.tolerance != null ? overrides.tolerance : DEFAULT_TOLERANCE;
    const include = Array.isArray(overrides.include) ? overrides.include : [];
    const exclude = Array.isArray(overrides.exclude) ? overrides.exclude : [];

    // Include first: add back resolved anchors; collect verbatim orphans.
    for (const ref of include) {
      const anchor = resolveRef(ref, list, byId, tolerance);
      if (anchor) survivorIds.add(anchor.id);
      else orphans.push(ref);
    }

    // Exclude second so it WINS on conflict. Misses are silently ignored.
    for (const ref of exclude) {
      const anchor = resolveRef(ref, list, byId, tolerance);
      if (anchor) survivorIds.delete(anchor.id);
    }
  }

  // 7. Return survivors in ORIGINAL input order.
  const survivors = list.filter((a) => survivorIds.has(a.id));

  return { survivors, orphans };
}
