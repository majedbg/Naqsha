// hostAnchors — THE shared host-anchor resolver (module F of PRD #143, #149).
//
// ONE QUESTION: "given a host layer and its harvested geometry, what are its
// anchors?" Two call sites ask it and they must never diverge:
//
//   • the RENDER path — MotifPattern.generate, through the params its router
//     (resolveMotifHost) prepared;
//   • the CANVAS OVERLAY — AnchorGhostOverlay, which draws the editable
//     per-glyph dots and opens the glyph popover on them.
//
// Before this module the overlay answered the question itself and hardcoded
// `voronoi` as the only stash-backed host; every other structural host fell
// through to a params-only call. Circle Packing (#146) is a second stash-backed
// host and Module Grid (#151), Girih (#152) and Truchet (#153) are three more, so
// as things stood they painted glyphs with NO dots and NO popover — the ornament
// looked right and was uneditable. That hardcoded branch is gone; its removal is
// the thing that shows this is the right seam.
//
// ── ADDING A NEW STASH HOST ────────────────────────────────────────────────
// A host REGISTERS; it does not add a branch here. Nothing in this file names a
// pattern. To inherit working override dots a new stash host needs exactly:
//   1. its registry id in `SEMANTIC_MOTIF_HOSTS` and `STASH_MOTIF_HOSTS`
//      (hostKinds.js) — the first makes it a structural host, the second tells
//      the render router to forward its stash;
//   2. its geometry key(s) in `STASH_GEOMETRY_KEYS` (hostKinds.js) — this module
//      and resolveMotifHost both forward that list verbatim;
//   3. its pattern stashing that geometry on `instance.motifHostGeometry` during
//      generate(), in the painted frame and consuming no RNG;
//   4. a `case` in `getSemanticAnchors` (semanticAnchors.js) turning that
//      geometry into anchors — the extractor DISPATCH is per-host by nature and
//      is the one place a new host still writes its own line;
//   5. optionally an entry in `NARROW_ROLES` (hostRoles.js) if it emits fewer
//      than all four roles.
// Steps 1–3 are registration. Step 4 is the host's own extractor, which is the
// work the host ticket is for. NOTHING in the overlay, the render router or this
// resolver changes.
//
// ── WHAT THIS MODULE DELIBERATELY DOES NOT DO ──────────────────────────────
// It does not decide which ROLES a host offers — that is `hostRoles.rolesForHost`
// (module E), the single params-aware capability seam. It does not run the
// selection chain or place glyphs. It is a pure function of (host kind, host
// params, harvested geometry) → anchors.

import { getSemanticAnchors } from './semanticAnchors.js';
import { sampleEdgeAnchors } from './anchors.js';
import { isEdgeHost, STASH_GEOMETRY_KEYS } from './hostKinds.js';

/**
 * The stash keys present on `source`, as the opts bag `getSemanticAnchors`
 * expects. Driven by the single `STASH_GEOMETRY_KEYS` list — never a hardcoded
 * subset — so a new stash host is a new key, not a new branch.
 *
 * `source` may be a host instance's `motifHostGeometry` (the overlay's shape) OR
 * the motif's render params, on which the router has already flattened those same
 * keys (MotifPattern's shape). Both are read identically.
 *
 * @param {object} [source]
 * @returns {object|null} the picked keys, or null when none are present.
 */
export function pickStashGeometry(source) {
  if (!source || typeof source !== 'object') return null;
  let out = null;
  for (const key of STASH_GEOMETRY_KEYS) {
    // Truthiness, matching resolveMotifHost's forward: an EMPTY array is truthy
    // and IS forwarded, because "[] circles" (a packing that genuinely placed
    // nothing) is an honest empty anchor set, distinct from "no circles key at
    // all" (a host that has not been probed yet).
    if (source[key]) {
      if (!out) out = {};
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * The anchors a host layer offers a motif, or `null` when it offers none.
 *
 * `null` means "nothing to resolve" and is never an error: a host that has not
 * been probed yet, a pattern with no extractor, an edge host with no captured
 * polylines. Callers render nothing / place nothing. It never throws on a missing
 * host, missing geometry or an unknown pattern type.
 *
 * @param {object} input
 * @param {string} [input.patternType]  the HOST layer's PATTERN_CLASSES registry id.
 * @param {object} [input.params]       the HOST layer's params (params-aware routing).
 * @param {number} input.canvasW
 * @param {number} input.canvasH
 * @param {object} [input.geometry]     geometry harvested for THIS host — the
 *   instance's `motifHostGeometry` (stash keys and/or `hostPaths`), or the motif's
 *   render params with those keys already flattened on. Absent ⇒ unprobed.
 * @param {number} [input.hostSeed]     the host layer's seed (the grid extractor's
 *   live-p5 jitter/symmetry stream; every other extractor ignores it).
 * @param {object} [input.edgeOpts]     the MOTIF's edge sampling opts. Absent ⇒
 *   `{}`, which is the render's own fallback and samples nothing.
 * @param {'semantic'|'edge'} [input.mode]  force the anchoring mode. Omitted ⇒
 *   derived from the params-aware `isEdgeHost`. The render path passes the
 *   `anchorMode` its router resolved, which is authoritative there.
 * @returns {Array<object>|null}
 */
export function resolveHostAnchors({
  patternType,
  params,
  canvasW,
  canvasH,
  geometry,
  hostSeed,
  edgeOpts,
  mode,
} = {}) {
  const resolvedMode = mode || (isEdgeHost(patternType, params) ? 'edge' : 'semantic');

  if (resolvedMode === 'edge') {
    // EDGE host (flowfield/wave/… or a single-axis grid): anchors come from the
    // SAME record-mode polyline capture the render samples, resampled with the
    // MOTIF's own edgeOpts so the ghost dots land where the glyphs do. No
    // capture (host not yet probed) ⇒ null.
    const hostPaths = geometry && geometry.hostPaths;
    if (!Array.isArray(hostPaths) || hostPaths.length === 0) return null;
    return sampleEdgeAnchors(hostPaths, edgeOpts || {});
  }

  // SEMANTIC host. Formula hosts (grid/recursive/spiral) re-derive from params
  // and ignore `geometry`; STASH hosts (voronoi, circlepacking, …) read the keys
  // harvested from their generate(). Both go through the one extractor entry
  // point, with the stash keys forwarded generically — so this branch has no
  // per-host knowledge at all, and getSemanticAnchors returns null for a pattern
  // with no extractor (an unknown type, a host whose slice has not landed).
  const opts = { hostSeed };
  const stash = pickStashGeometry(geometry);
  if (stash) Object.assign(opts, stash);
  return getSemanticAnchors(patternType, params, canvasW, canvasH, opts);
}
