// Per-anchor include/exclude OVERRIDE resolution — the fixed final say that
// sits AFTER anchor selection (both the legacy `selectAnchors` pipeline and
// the new reorderable `runSelectionChain`). Overrides are deliberately NOT a
// Block (ADR-0004): they are a fixed post-chain step so a user's canvas pin
// can never be buried under a reordered filter. Both callers import this ONE
// implementation so the resolution semantics (id → legacy `:0` fallback →
// spatial rebind → orphan; exclude wins; unresolved include → orphan) live in
// exactly one place.
//
// This module was extracted verbatim from placementEngine.selectAnchors so the
// two call sites share it byte-for-byte; the extraction is behavior-preserving
// and pinned by placementEngine.test.js staying green unchanged.

/**
 * @typedef {{id:string, role:string, x:number, y:number, tangent:number, normal:number, s:number, meta:object}} Anchor
 * @typedef {string | {id?:string, x?:number, y?:number, role?:string}} OverrideRef
 */

export const DEFAULT_TOLERANCE = 8;

/**
 * Resolve an override ref to a concrete anchor from the FULL input list.
 *
 * Resolution order:
 *   1. exact `id` match (ignores role) — the ref's `id` string, or `ref.id`.
 *   1b. legacy base-copy fallback: `${id}:0`. Before the grid-geometry-core
 *      refactor a symmetry>1 grid host emitted only the BASE COPY, keyed by an
 *      un-suffixed id (e.g. `crossing:1:1`); the core now suffixes the copy
 *      index, so that copy is `crossing:1:1:0`. Binding a legacy ref to copy 0
 *      keeps overrides saved before the refactor working. Only fires on an exact
 *      miss, so sym=1 (un-suffixed) ids still match at step 1; and only grid
 *      sym>1 anchors ever carry a `:k` suffix, so `${id}:0` matches nothing in
 *      recursive/spiral/voronoi sets (no false rebind).
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
export function resolveRef(ref, anchors, byId, tolerance) {
  const id = typeof ref === 'string' ? ref : ref && ref.id;
  if (id != null) {
    const hit = byId.get(id);
    if (hit) return hit;
    // Legacy base-copy fallback (see step 1b above): bind a pre-refactor
    // un-suffixed grid override to the symmetry copy 0 anchor.
    const base = byId.get(`${id}:0`);
    if (base) return base;
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
 * Apply include/exclude overrides to a survivor-id set, IN PLACE. Include adds
 * resolved anchors back (a rule-dropped anchor can be re-pinned); exclude runs
 * SECOND so it wins on conflict. Unresolved include refs are collected verbatim
 * as orphans and returned; exclude misses are silently ignored.
 *
 * @param {Set<string>} survivorIds  mutated in place
 * @param {Anchor[]} list  full input list
 * @param {Map<string, Anchor>} byId
 * @param {undefined|{include?:OverrideRef[], exclude?:OverrideRef[], tolerance?:number}} overrides
 * @param {number} [defaultTolerance=DEFAULT_TOLERANCE]
 * @returns {OverrideRef[]} orphans (unresolved include refs, verbatim)
 */
export function applyOverrides(survivorIds, list, byId, overrides, defaultTolerance = DEFAULT_TOLERANCE) {
  const orphans = [];
  if (!overrides) return orphans;

  const tolerance = overrides.tolerance != null ? overrides.tolerance : defaultTolerance;
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

  return orphans;
}
