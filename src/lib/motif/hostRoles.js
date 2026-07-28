// hostRoles — THE single params-aware host→roles capability seam.
//
// WHY THIS MODULE EXISTS. Several tickets of PRD #143 carry a criterion of the
// form "the Route block offers X and no other role on <host>". Every one of them
// is a slice of the same question, and the failure mode of answering it locally
// is well understood: an ad-hoc conditional in the Inspector, another in the
// Route UI, a third in the anchor-ghost overlay, and three answers that drift.
// So the question is answered HERE, once, and the UI calls this function.
//
// #146 creates the seam and registers `circlepacking`. #154 owns the rest of
// module E — narrowing Voronoi (which still offers a dead Tips option) and Spiral
// (which still offers a dead Cells option), and the repair affordance for a
// stored Route asking for a role its host cannot serve. This module therefore
// returns the CURRENT option set verbatim for every pre-existing host: narrowing
// them is a user-visible behaviour change with its own acceptance criteria, and
// doing it here would smuggle #154's work into #146's diff.
//
// #144 added `radialetch` / `hilbert` / `lissajous` as EDGE hosts and made
// MotifBlockRack derive its Route options from this function. They need NO entry
// in the table below: an edge host's roles are answered by `isEdgeHost`, and a
// new edge host is therefore a one-line change in hostKinds.js alone. Only a
// SEMANTIC host whose emitted set is narrower than all four needs a row here.
//
// PARAMS-AWARE by contract. What a host emits can depend on its params — the
// single-axis Grid already does (columns-only ⇒ edges alone, no crossings), and
// Chladni will (equal mode numbers ⇒ a blank plate, no roles at all). Callers
// pass the host's live params; omitting them keeps the by-type default, matching
// `isSemanticHost`/`isEdgeHost`'s single-arg back-compat.
//
// DERIVED AT RENDER, NEVER STORED. Nothing here is written to the document. A
// stored Route asking for an unavailable role keeps its stored value; the UI just
// stops OFFERING roles the host cannot serve.
//
// ── HOW THIS COMPOSES WITH hostCapability.js ────────────────────────────────
// Two adjacent but genuinely different questions, and each has exactly one
// owner:
//
//   hostCapability.hostAvailability(type, params) → {available, reason}
//     "CAN this host be used at all right now, and if not, WHY?" It owns the
//     maker-facing copy. Chladni at equal mode numbers draws literally nothing,
//     so no role and no Route choice can place a glyph (#145).
//
//   hostRoles.rolesForHost(type, params) → string[]
//     "WHICH anchor roles does this host emit?" It owns the option set.
//
// rolesForHost CONSULTS hostAvailability and returns `[]` for an unavailable
// host — an empty plate emits no anchors, so it emits no roles. That gives #154
// a SINGLE entry point for role availability while the human-readable `reason`
// stays reachable from hostCapability for the Inspector's notice. The dependency
// runs one way only (roles → capability); hostCapability must never import this
// module back.

import { isEdgeHost, isSemanticHost } from './hostKinds.js';
import { hostAvailability } from './hostCapability.js';

/** The four structural anchor roles, in the studio's canonical display order. */
export const ALL_ROLES = Object.freeze(['crossing', 'edge', 'tip', 'cell']);

// Hosts whose emitted role set is NARROWER than "everything a semantic host can
// do". Add an entry here rather than a conditional at a call site.
//
//   circlepacking — one anchor per packed circle, at its centre (#146). No
//                   lattice to cross, no strand to run along, no free terminus.
//   modulegrid    — one anchor per module, at its centre (#151). Its lattice is
//                   IMPLICIT: the pattern paints modules, not grid lines, so a
//                   glyph at an intersection would sit on nothing visible and
//                   there are no crossings to offer. Cells alone, at every
//                   params — the module shape is a look, not a capability, so
//                   there is nothing here for params to switch on.
//   girih         — crossings (where straps meet), edges (riding the straps) and
//                   tips (where a strap is cut at the crop margin), #152. NO
//                   cells: recovering the enclosed tiles from the strap skeleton
//                   needs planar face traversal, which is materially different
//                   work from graph degree and strand walking and is explicitly
//                   out of scope for PRD #143.
//   truchet       — one anchor per tile PLUS a run along every drawn path
//                   (#153). Cells AND edges, and NO params gating: every tile
//                   set, the triangles included, yields both, because Truchet is
//                   a STASH host and the belief that triangles yield nothing is a
//                   capture-channel concern (PRD #143 records it as a mistake
//                   already made once). No crossings — a Truchet has no lattice
//                   intersection — and no tips: every arc endpoint is shared with
//                   the neighbouring tile's arc, so nothing terminates freely.
//                   Listed in ALL_ROLES order, which is what the docstring below
//                   promises and what the Route UI's own option list assumes.
//
// NOT listed, deliberately, and owned by #154:
//   voronoi — a tessellation has no free termini, so `tip` is dead today.
//   spiral  — an open arm encloses no region, so `cell` is dead today.
const NARROW_ROLES = Object.freeze({
  circlepacking: Object.freeze(['cell']),
  modulegrid: Object.freeze(['cell']),
  girih: Object.freeze(['crossing', 'edge', 'tip']),
  truchet: Object.freeze(['edge', 'cell']),
});

/**
 * The anchor roles `patternType` actually emits under `params` — i.e. the roles a
 * Route block should offer.
 *
 * `params` is optional and behaves exactly as it does in hostKinds: omitting it
 * keeps the by-type answer, so a grid stays two-axis (semantic) for the
 * pre-render binding writers that call by type alone.
 *
 * A type that hosts no motif at all returns `[]` — NOT the `['edge']` universal
 * anchor fallback. Offering Edges on a non-host is a plausible-looking wrong
 * answer, so #154's per-host tables must OVERRIDE the answers here rather than
 * assume they are extending a non-empty one. A host that IS a motif host but is
 * currently UNAVAILABLE (hostCapability) returns `[]` for the same reason: it
 * emits no geometry, so it emits no roles.
 *
 * @param {string} patternType  PATTERN_CLASSES / registry id (NOT the class name).
 * @param {object} [params]     the host's live params (params-aware hosts only).
 * @returns {string[]} a fresh array in canonical order; `[]` for a non-host or an
 *                     unavailable one.
 */
export function rolesForHost(patternType, params) {
  // AVAILABILITY FIRST, before the edge/semantic dispatch. hostAvailability
  // deliberately answers `available: true` for types that host no motif at all
  // (it is a capability question, not a classification one), so checking it
  // after the dispatch would be a no-op for exactly the case it exists for.
  if (!hostAvailability(patternType, params).available) return [];
  // An EDGE host (native, or a single-axis grid) samples arc-length anchors along
  // its drawn polylines and has no structural anchors at all.
  if (isEdgeHost(patternType, params)) return ['edge'];
  if (!isSemanticHost(patternType, params)) return [];
  const narrow = NARROW_ROLES[patternType];
  return narrow ? [...narrow] : [...ALL_ROLES];
}
