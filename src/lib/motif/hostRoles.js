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
// PARAMS-AWARE by contract. What a host emits can depend on its params — the
// single-axis Grid already does (columns-only ⇒ edges alone, no crossings), and
// Chladni will (equal mode numbers ⇒ a blank plate, no roles at all). Callers
// pass the host's live params; omitting them keeps the by-type default, matching
// `isSemanticHost`/`isEdgeHost`'s single-arg back-compat.
//
// DERIVED AT RENDER, NEVER STORED. Nothing here is written to the document. A
// stored Route asking for an unavailable role keeps its stored value; the UI just
// stops OFFERING roles the host cannot serve.

import { isEdgeHost, isSemanticHost } from './hostKinds.js';

/** The four structural anchor roles, in the studio's canonical display order. */
export const ALL_ROLES = Object.freeze(['crossing', 'edge', 'tip', 'cell']);

// Hosts whose emitted role set is NARROWER than "everything a semantic host can
// do". Add an entry here rather than a conditional at a call site.
//
//   circlepacking — one anchor per packed circle, at its centre (#146). No
//                   lattice to cross, no strand to run along, no free terminus.
//
// NOT listed, deliberately, and owned by #154:
//   voronoi — a tessellation has no free termini, so `tip` is dead today.
//   spiral  — an open arm encloses no region, so `cell` is dead today.
const NARROW_ROLES = Object.freeze({
  circlepacking: Object.freeze(['cell']),
});

/**
 * The anchor roles `patternType` actually emits under `params` — i.e. the roles a
 * Route block should offer.
 *
 * @param {string} patternType  PATTERN_CLASSES registry id.
 * @param {object} [params]     the host's live params (params-aware hosts only).
 * @returns {string[]} a fresh array in canonical order; `[]` for a non-host.
 */
export function rolesForHost(patternType, params) {
  // An EDGE host (native, or a single-axis grid) samples arc-length anchors along
  // its drawn polylines and has no structural anchors at all.
  if (isEdgeHost(patternType, params)) return ['edge'];
  if (!isSemanticHost(patternType, params)) return [];
  const narrow = NARROW_ROLES[patternType];
  return narrow ? [...narrow] : [...ALL_ROLES];
}
