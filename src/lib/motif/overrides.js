// Per-anchor OVERRIDE resolution — the fixed final say that sits AFTER anchor
// selection (both the legacy `selectAnchors` pipeline and the reorderable
// `runSelectionChain`). Overrides are deliberately NOT a Block (ADR-0004):
// they are a fixed post-chain step so a user's canvas pin can never be buried
// under a reordered filter. Both callers import this ONE implementation so the
// resolution semantics (id → legacy `:0` fallback → spatial rebind → orphan;
// hide wins; unresolved pin → orphan) live in exactly one place.
//
// CANONICAL SHAPE (#136) — one RECORD per ref:
//   overrides = { records: [{ref, hidden?, scale?, angle?}], tolerance? }
// The WHOLE record rides `resolveRef` and attaches / re-binds / orphans as one
// unit. `hidden:false` is the legacy include (a force-show pin beyond the
// order-filter), `hidden:true` the legacy exclude (force-hide); hidden ABSENT
// means "rules decide" — such a record never touches survivorship (it exists
// to carry per-glyph scale/angle, resolved via `resolveOverrideRecords`).
// `scale` is the per-glyph multiplier (4th cascade level); `angle` an ABSOLUTE
// screen-space bearing in degrees. Both are APPLIED here too, but strictly
// POST-PLACEMENT (#137): `resolveOverrideRecords` binds records to anchors and
// `applyGlyphOverrides` rewrites the finished placements, AFTER the chain and
// AFTER packing. Packing therefore saw the un-overridden footprints — a
// scaled-up glyph may overlap its neighbours, and that is accepted: never
// evict, never re-pack, never hide.
//
// `records` is an ARRAY (not a keyed object) deliberately: deepMergeBinding
// (motifLayer.js) deep-merges plain objects — a keyed map would resurrect
// deleted records on merge — but REPLACES arrays wholesale, preserving the
// existing write contract. Insertion order is the deterministic tie-break.
//
// LEGACY `{include, exclude}` is migrate-on-read (`normalizeOverrides`, called
// internally by `applyOverrides` / `resolveOverrideRecords`) and migrate-on-
// write (the canvas writer, AnchorGhostOverlay, always emits records). Legacy
// inputs behave byte-identically through `applyOverrides` — pinned by
// placementEngine.test.js and chain.test.js staying green unchanged.
//
// This module was extracted verbatim from placementEngine.selectAnchors so the
// two call sites share it byte-for-byte; `resolveRef` and `DEFAULT_TOLERANCE`
// remain byte-identical to that extraction.

/**
 * @typedef {{id:string, role:string, x:number, y:number, tangent:number, normal:number, s:number, meta:object}} Anchor
 * @typedef {string | {id?:string, x?:number, y?:number, role?:string}} OverrideRef
 * @typedef {{ref:OverrideRef, hidden?:boolean, scale?:number, angle?:number}} OverrideRecord
 * @typedef {{records:OverrideRecord[], tolerance?:number}} Overrides           canonical (#136)
 * @typedef {{include?:OverrideRef[], exclude?:OverrideRef[], tolerance?:number}} LegacyOverrides
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
 * Stable dedup key for an override ref. NOT an anchor id (ADR-0005 — override
 * state never folds into anchor ids): two refs with the same key are the SAME
 * user intent (one record per intent), resolved to an anchor only at read time.
 *
 *   string ref            → itself
 *   {id, ...}             → the id (coords are a rebind hint, not identity)
 *   {x, y, role?}         → `@${x},${y}` (+ `,${role}` when role present)
 *   null / keyless        → null (caller keeps such refs verbatim, no dedup)
 *
 * @param {OverrideRef} ref
 * @returns {string|null}
 */
export function refKey(ref) {
  if (typeof ref === 'string') return ref;
  if (ref == null || typeof ref !== 'object') return null;
  if (ref.id != null) return ref.id;
  if (ref.x == null || ref.y == null) return null;
  return ref.role != null ? `@${ref.x},${ref.y},${ref.role}` : `@${ref.x},${ref.y}`;
}

/**
 * Normalize EITHER overrides shape to the canonical `{records, tolerance?}`.
 * The single migrate-on-read seam: everything downstream (applyOverrides,
 * resolveOverrideRecords, the canvas overlay) speaks records only.
 *
 *   • null/undefined → undefined (caller treats as "no overrides").
 *   • `records` Array present → AUTHORITATIVE: stray include/exclude keys are
 *     ignored (stale legacy leftovers must not resurrect); records dedup by
 *     refKey, FIRST occurrence wins; keyless refs are kept verbatim.
 *   • else legacy: include refs → `{ref, hidden:false}` in order, then exclude
 *     refs → `{ref, hidden:true}`; a ref (by refKey) in BOTH arrays collapses
 *     to ONE `{ref, hidden:true}` record — exclude wins, preserving the legacy
 *     conflict semantics.
 *
 * Never mutates its input; refs ride into records verbatim (same reference).
 *
 * @param {undefined|null|Overrides|LegacyOverrides} overrides
 * @returns {Overrides|undefined}
 */
export function normalizeOverrides(overrides) {
  if (overrides == null) return undefined;
  const tolerance = overrides.tolerance;

  // New shape passthrough — dedup by refKey, first occurrence wins.
  if (Array.isArray(overrides.records)) {
    const seen = new Set();
    const records = [];
    for (const rec of overrides.records) {
      if (rec == null || typeof rec !== 'object') continue;
      const key = refKey(rec.ref);
      if (key != null) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      records.push(rec);
    }
    return tolerance != null ? { records, tolerance } : { records };
  }

  // Legacy migration. Include pass first (records in include order), then the
  // exclude pass FLIPS a matching record to hidden:true in place (collapse —
  // exclude wins) or appends a fresh hide record. Keyless refs can never
  // collide, so they always append.
  const include = Array.isArray(overrides.include) ? overrides.include : [];
  const exclude = Array.isArray(overrides.exclude) ? overrides.exclude : [];
  const records = [];
  const byKey = new Map();

  for (const ref of include) {
    const key = refKey(ref);
    if (key != null && byKey.has(key)) continue; // first occurrence wins
    const rec = { ref, hidden: false };
    if (key != null) byKey.set(key, rec);
    records.push(rec);
  }
  for (const ref of exclude) {
    const key = refKey(ref);
    const existing = key != null ? byKey.get(key) : undefined;
    if (existing) {
      existing.hidden = true; // collapse: exclude wins (our synthesized record)
      continue;
    }
    const rec = { ref, hidden: true };
    if (key != null) byKey.set(key, rec);
    records.push(rec);
  }
  return tolerance != null ? { records, tolerance } : { records };
}

/**
 * Apply visibility overrides to a survivor-id set, IN PLACE. Accepts BOTH
 * shapes (normalized internally). Pass 1 — pins (`hidden === false`): resolved
 * anchors are added back (a rule-dropped anchor can be re-pinned), unresolved
 * pin refs are collected VERBATIM as orphans. Pass 2 — hides
 * (`hidden === true`) runs second so it WINS on conflict; misses are silently
 * ignored. Records with `hidden` ABSENT (scale/angle-only) never touch
 * survivorship and are never orphans. Legacy-shape inputs behave
 * byte-identically to the pre-#136 include/exclude implementation.
 *
 * @param {Set<string>} survivorIds  mutated in place
 * @param {Anchor[]} list  full input list
 * @param {Map<string, Anchor>} byId
 * @param {undefined|Overrides|LegacyOverrides} overrides
 * @param {number} [defaultTolerance=DEFAULT_TOLERANCE]
 * @returns {OverrideRef[]} orphans (unresolved PIN refs, verbatim)
 */
export function applyOverrides(survivorIds, list, byId, overrides, defaultTolerance = DEFAULT_TOLERANCE) {
  const orphans = [];
  const norm = normalizeOverrides(overrides);
  if (!norm) return orphans;

  const tolerance = norm.tolerance != null ? norm.tolerance : defaultTolerance;

  // Pass 1 — pins: add back resolved anchors; collect verbatim orphans.
  for (const rec of norm.records) {
    if (rec.hidden !== false) continue;
    const anchor = resolveRef(rec.ref, list, byId, tolerance);
    if (anchor) survivorIds.add(anchor.id);
    else orphans.push(rec.ref);
  }

  // Pass 2 — hides run second so they WIN on conflict. Misses silently ignored.
  for (const rec of norm.records) {
    if (rec.hidden !== true) continue;
    const anchor = resolveRef(rec.ref, list, byId, tolerance);
    if (anchor) survivorIds.delete(anchor.id);
  }

  return orphans;
}

/**
 * Apply per-glyph `scale` and `angle` to resolved PLACEMENTS — the fixed
 * POST-PLACEMENT step (#137), run after the selection chain AND after packing.
 *
 * Packing (`largestEmptyCircleRadius` / `fitsAt` and the growing `placed`
 * obstacle list in resolvePlacements) has ALREADY run against the un-overridden
 * footprint by the time we get here, so a scaled-up glyph may overlap its
 * neighbours. That is the settled behavior (map #134, consistent with ADR-0004's
 * post-chain placement of overrides): never evict, never re-pack, never hide.
 * Survivorship (`hidden`) is decided upstream by `applyOverrides`; this pass is
 * blind to it.
 *
 *   • `scale` — a PURE MULTIPLIER, the 4th cascade level after
 *     `size × scaleFactor(jitter) × sizeScale(slot)`. Multiplies BOTH `radius`
 *     (what `placementMatrix` reads) and `scale` (`radius / size`), so the
 *     invariant between them survives. Default 1. A non-finite or NON-POSITIVE
 *     scale is IGNORED rather than applied: 0 would vanish the glyph and a
 *     negative would silently mirror it, and neither is a thing this step is
 *     allowed to do (flip stays a separate renderer concern).
 *   • `angle` — an ABSOLUTE screen-space bearing in degrees that REPLACES the
 *     resolved `baseDeg + offset + jitter + slotRotation`. Tested with
 *     `Number.isFinite` ONLY: `angle: 0` ("faces up") is a legitimate bearing
 *     that any truthiness check would silently drop.
 *
 * Pure: never mutates the input placements. Returns the SAME array reference
 * when nothing was overridden, so a document with no scale/angle records is a
 * byte-identical no-op. Touched placements are shallow clones, which preserves
 * the `glyphRef` KEY-PRESENCE discipline (present IFF sequenced).
 *
 * @param {object[]} placements  resolvePlacements output, in placement order
 * @param {Map<string, OverrideRecord>|null|undefined} byAnchorId  from resolveOverrideRecords
 * @returns {object[]}
 */
export function applyGlyphOverrides(placements, byAnchorId) {
  if (!Array.isArray(placements) || !byAnchorId || byAnchorId.size === 0) return placements;

  let touched = false;
  const out = placements.map((placement) => {
    const rec = byAnchorId.get(placement.anchorId);
    if (!rec) return placement;

    const scale = Number.isFinite(rec.scale) && rec.scale > 0 ? rec.scale : null;
    const angle = Number.isFinite(rec.angle) ? rec.angle : null;
    if (scale == null && angle == null) return placement;

    touched = true;
    const next = { ...placement };
    if (scale != null) {
      next.radius = placement.radius * scale;
      next.scale = placement.scale * scale;
    }
    if (angle != null) next.rotation = angle;
    return next;
  });

  return touched ? out : placements;
}

/**
 * Resolve EVERY override record to its anchor — the resolution seam the
 * post-placement consumer (`applyGlyphOverrides`, #137) reads. Accepts BOTH
 * shapes (normalized internally, so legacy input yields synthesized records).
 * The FIRST record (insertion order) to resolve to a given anchor CLAIMS it;
 * later claimants are ignored — the same deterministic tie-break the records
 * array's order encodes. Orphans follow the exact applyOverrides rule: refs
 * (verbatim) of unresolved records with `hidden === false` only.
 *
 * @param {Anchor[]} list  full input list
 * @param {Map<string, Anchor>} byId
 * @param {undefined|Overrides|LegacyOverrides} overrides
 * @param {number} [defaultTolerance=DEFAULT_TOLERANCE]
 * @returns {{byAnchorId: Map<string, OverrideRecord>, orphans: OverrideRef[]}}
 */
export function resolveOverrideRecords(list, byId, overrides, defaultTolerance = DEFAULT_TOLERANCE) {
  const byAnchorId = new Map();
  const orphans = [];
  const norm = normalizeOverrides(overrides);
  if (!norm) return { byAnchorId, orphans };

  const tolerance = norm.tolerance != null ? norm.tolerance : defaultTolerance;
  for (const rec of norm.records) {
    const anchor = resolveRef(rec.ref, list, byId, tolerance);
    if (anchor) {
      if (!byAnchorId.has(anchor.id)) byAnchorId.set(anchor.id, rec); // first claim wins
    } else if (rec.hidden === false) {
      orphans.push(rec.ref); // unresolved PIN — same orphan rule as applyOverrides
    }
  }
  return { byAnchorId, orphans };
}
