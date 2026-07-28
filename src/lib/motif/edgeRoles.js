// edgeRoles — EDGE-MODE ROLE COERCION, shared by the render seam and the canvas
// overlay.
//
// In edge mode the only anchor role that exists is 'edge' (sampleEdgeAnchors
// tags every anchor role:'edge', anchors.js), so a ROUTE/selection role filter
// naming any OTHER role filters EVERYTHING out. This bites a grid that became a
// single-axis EDGE host at render (resolveMotifHost) while its binding still
// carries the baked semantic default roles:['crossing'] (hostKinds
// defaultRolesForHost) — the vine would place nothing. Normalize such stale
// roles to ['edge']. A role already `null` (all-pass) or exactly ['edge'] is
// left untouched — so this is a byte-identical no-op for native edge hosts and
// only un-bakes a grid's 'crossing'. Clones; never mutates the stored binding.
//
// LIVES HERE, not in MotifPattern, because AnchorGhostOverlay must run the
// IDENTICAL coercion when it previews an edge host's placements (#141): a
// second implementation that drifted would make the ghost dots disagree with
// the glyphs actually drawn — silently, and only on stale bindings.

import { isEdgeHost, defaultRolesForHost } from './hostKinds.js';
import { rolesForHost } from './hostRoles.js';

const roleIsEdgeSafe = (roles) =>
  roles == null || (Array.isArray(roles) && roles.length === 1 && roles[0] === 'edge');

/**
 * Un-bake non-edge route roles from a binding for EDGE-mode resolution.
 * @param {object} binding  chain-form or legacy binding (either shape)
 * @returns {object} the SAME reference when nothing needed coercing, else a clone
 */
export function coerceEdgeRoles(binding) {
  if (!binding || typeof binding !== 'object') return binding;
  let changed = false;
  const out = { ...binding };
  if (Array.isArray(binding.chain)) {
    out.chain = binding.chain.map((block) => {
      if (block && block.type === 'route' && !roleIsEdgeSafe(block.roles)) {
        changed = true;
        return { ...block, roles: ['edge'] };
      }
      return block;
    });
  }
  if (binding.selection && !roleIsEdgeSafe(binding.selection.roles)) {
    out.selection = { ...binding.selection, roles: ['edge'] };
    changed = true;
  }
  return changed ? out : binding;
}

// ── #154 — the same idea, generalised to every host ─────────────────────────
//
// `coerceEdgeRoles` above answers ONE case: a grid that became a single-axis EDGE
// host while its binding still carried the baked semantic `['crossing']`. #154
// generalises it: at render, a Route block's stored roles are intersected with
// what the host ACTUALLY EMITS (`rolesForHost`, the one params-aware capability
// seam). Nothing is written — the document keeps the maker's stored intent, and
// availability is recomputed from live host params every frame, so turning the
// host back into one that emits the stored role brings the original behaviour
// back with no write at any point (#154 criterion 11).
//
// THE ORDER OF THE BRANCHES IS LOAD-BEARING. Do not "simplify" it:
//
//   1. THE EDGE BRANCH FIRST, VERBATIM. It has to survive on its own gate rather
//      than on `rolesForHost`'s answer, because `MotifPattern` drives edge mode
//      with NO `hostPatternType` at all (MotifPattern.test.js:449/:473) and
//      `isEdgeHost(undefined)` is false. Going through the intersection instead
//      would leave those bindings on ['crossing'] against anchors that are all
//      role:'edge' and place nothing. It is also what diverts every
//      params-dependent host — a single-axis grid included — before the fallback
//      below can ever see it, which is why `defaultRolesForHost` stays
//      params-BLIND: no host that reaches the fallback needs params to answer.
//      #154 step 2 added the params-AWARE companion next door as
//      `hostRoles.defaultRolesFor` rather than changing this one, because
//      hostRoles imports hostKinds and the reverse import would close a cycle.
//
//   2. AN EMPTY `rolesForHost` NEVER REWRITES. It answers `[]` for two genuinely
//      different reasons — the host is currently UNAVAILABLE (a blank Chladni) or
//      the type is NOT A HOST at all (absent/unknown `hostPatternType`) — and
//      "leave the stored roles alone" is right for both. An unavailable host emits
//      no anchors, so the roles cannot matter; a non-host must not have its
//      document silently rewritten to `['edge']`.
//
//   3. INTERSECT, and fall back on empty. An intersection that survives nothing
//      means every stored role is dead on this host, which renders BLANK today —
//      so the fallback is `defaultRolesForHost(type)`, the same role a motif
//      created on this host today would get. On a cell-only host that is also the
//      DENSEST possible answer (circlepacking `['crossing']` → 0 → 389 glyphs),
//      it happens with no maker action and no undo entry, and it is deliberate:
//      #154 chose "a blank motif starts rendering" over "a blank motif stays
//      blank with nothing to explain it".
//
// ONE SEAM, EVERY CONSUMER. `MotifPattern` (the render), `AnchorGhostOverlay`
// (the editable per-glyph dots) and `MotifBlockRack` (the anchor-count chip) all
// call THIS function, and the overlay calls it ONCE and feeds both its placement
// pipeline and its role-focus display filter from the single result. Two call
// sites that coerced differently is exactly the divergence that would put glyphs
// on the canvas with no dot on any of them — no dot, no popover, and the whole
// per-glyph override surface unreachable for exactly the placements this change
// creates.
//
// `anchorMode` DEFAULTS TO 'edge' when omitted, matching MotifPattern.js:86
// (`p.anchorMode ?? 'edge'`) — a motif whose render params carry no anchorMode
// renders in edge mode, and the render is the only caller that reads it off the
// params. WHAT EACH CALLER PASSES:
//   • MotifPattern — `p.anchorMode ?? 'edge'`, i.e. the mode its ROUTER already
//     resolved (resolveMotifHost forces 'edge' on an edge host), which is
//     authoritative for the render.
//   • AnchorGhostOverlay / MotifBlockRack — DERIVED from the host
//     (`isEdgeHost` / `hostIsSemantic`), because there it has to describe the
//     anchor set those surfaces actually hold: both resolve their anchors through
//     the params-aware host classification, never through the motif's stored
//     anchorMode, and coercing roles to 'edge' over a SEMANTIC anchor set would
//     filter away the very dots and counts they are about to show. On every
//     app-reachable path the two agree — defaultBinding writes 'semantic' iff
//     isSemanticHost and resolveMotifHost forces 'edge' iff isEdgeHost — so this
//     is the same answer, derived from the same fact, at each seam.
//
// DONE (#154 step 2) — this used to read "DEFERRED, DELIBERATELY". The
// create-time writers (`defaultBinding.js`, `starterChips.js`) are now
// params-aware, via `hostRoles.defaultRolesFor`, and `chip.build` /
// `modeForMotif` / `applyModeChain` went params-aware in the same change (which
// is what the deferral was waiting on: modeMatch.js rebuilt chips params-blind,
// so moving the writers alone would have made every chip on a single-axis grid
// read as Custom the instant it was created).
//
// The coercion below is therefore a SAFETY NET for documents written before that
// change, not the workflow. It still runs on every render and still owns the
// cases create-time prevention cannot reach — a host whose params change AFTER
// the motif was created, which is exactly what the Grid axis toggle does.

const sameRoles = (a, b) => a.length === b.length && a.every((r, i) => r === b[i]);

/**
 * Narrow a Route/selection role list to the roles this host emits.
 * @param {string[]|null|undefined} roles
 * @param {string[]} avail     non-empty, from rolesForHost
 * @param {string[]} fallback  defaultRolesForHost(type)
 * @returns {string[]|null|undefined} the SAME reference when nothing changed
 */
function narrowRoles(roles, avail, fallback) {
  if (roles == null) return roles; // all-pass — never narrowed into a filter.
  if (!Array.isArray(roles)) return roles;
  const kept = roles.filter((r) => avail.includes(r));
  if (kept.length === 0) return fallback;
  return sameRoles(kept, roles) ? roles : kept;
}

/**
 * Resolve a binding's Route roles against what `type` actually emits under
 * `params`, for the duration of ONE render. Clones; never mutates, never writes.
 *
 * @param {object} binding  chain-form or legacy binding (either shape)
 * @param {object} [opts]
 * @param {string} [opts.type]         the HOST's registry id (`hostPatternType`)
 * @param {object} [opts.params]       the HOST's live params
 * @param {string} [opts.anchorMode]   'edge' | 'semantic'; ABSENT ⇒ 'edge'
 * @returns {object} the SAME reference when nothing needed coercing, else a clone
 */
export function coerceRoles(binding, opts = {}) {
  if (!binding || typeof binding !== 'object') return binding;
  const { type, params, anchorMode } = opts;
  // (1) THE EDGE BRANCH, FIRST AND VERBATIM.
  if ((anchorMode ?? 'edge') === 'edge' || isEdgeHost(type, params)) return coerceEdgeRoles(binding);
  // (2) `[]` means "unavailable" OR "not a host" — never rewrite on either.
  const avail = rolesForHost(type, params);
  if (!avail.length) return binding;
  // (3) intersect; empty ⇒ the role a motif created on this host today would get.
  const fallback = defaultRolesForHost(type);

  let changed = false;
  const out = { ...binding };
  if (Array.isArray(binding.chain)) {
    out.chain = binding.chain.map((block) => {
      if (!block || block.type !== 'route') return block;
      const next = narrowRoles(block.roles, avail, fallback);
      if (next === block.roles) return block;
      changed = true;
      return { ...block, roles: next };
    });
  }
  if (binding.selection) {
    const next = narrowRoles(binding.selection.roles, avail, fallback);
    if (next !== binding.selection.roles) {
      out.selection = { ...binding.selection, roles: next };
      changed = true;
    }
  }
  return changed ? out : binding;
}
