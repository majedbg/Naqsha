// motifLayer — schema helpers for the motif layer (flat layer model, mirrors
// createLayer conventions in src/lib/useLayers.js, docs/motif-adorn-arch-brief.md §3).
//
// A motif layer is a normal flat layer whose type/patternType is MOTIF_TYPE.
// Its params carry a reference to a glyph, a reference to the host layer it
// adorns, the selection+placement binding consumed by placeMotifs (see
// src/lib/motif/placementEngine.js), an anchor-mode hint, edge-spacing opts,
// and provenance (`source`). No cross-layer cleanup lives here — dangling
// hostLayerId references are tolerated and resolved only at buildAdornGraph
// derivation time (tolerate-dangling precedent, same as modulator.maps).

import { compileSelectionToChain } from './compileSelectionToChain.js';

export const MOTIF_TYPE = 'motif';

/**
 * @param {object} layer
 * @returns {boolean} true iff layer is a motif layer (by type or patternType).
 */
export function isMotifLayer(layer) {
  return !!(layer && (layer.type === MOTIF_TYPE || layer.patternType === MOTIF_TYPE));
}

/**
 * Normalize a (possibly partial) binding to the shape the engine expects.
 * Two mutually exclusive input shapes (D9 — chain-form is detected by
 * `binding.chain` PRESENCE alone, no version stamp):
 *   • CHAIN-FORM (`binding.chain` present, an array): preserved verbatim
 *     alongside `placement` — `{chain, overrides?, placement}`. `overrides`
 *     is carried only when present on the input (never invented). This is
 *     the B3-flagged fix: earlier this function silently dropped `.chain`/
 *     `.overrides`, so a chain never survived `createMotifParams`.
 *   • LEGACY (no `.chain`): `{selection, placement}`, missing halves default
 *     to {} so placeMotifs/resolveSelection fall back to THEIR OWN defaults
 *     (selectAnchors/resolvePlacements DEFAULTS) rather than motifLayer.js
 *     duplicating them. Byte-identical to the pre-C1 behavior.
 * Shapes are never forced to coexist — whichever the input carries is what
 * comes out (a chain-form input never gains a `selection` key and vice
 * versa).
 * @param {{selection?: object, chain?: Array<object>, overrides?: object, placement?: object}} [binding]
 */
function normalizeBinding(binding) {
  const b = binding || {};
  if (Array.isArray(b.chain)) {
    const out = { chain: b.chain, placement: b.placement || {} };
    if (b.overrides !== undefined) out.overrides = b.overrides;
    return out;
  }
  return {
    selection: b.selection || {},
    placement: b.placement || {},
  };
}

/**
 * Build the params object stored on a motif layer.
 * @param {{
 *   glyphRef?: string,
 *   hostLayerId?: string,
 *   binding?: {selection?: object, placement?: object} | {chain?: Array<object>, overrides?: object, placement?: object},
 *   anchorMode?: string,
 *   edgeOpts?: object,
 *   source?: object|null,
 * }} [opts]
 */
export function createMotifParams({
  glyphRef,
  hostLayerId,
  binding,
  anchorMode = 'edge',
  edgeOpts,
  source,
} = {}) {
  return {
    glyphRef,
    hostLayerId,
    binding: normalizeBinding(binding),
    anchorMode,
    edgeOpts: edgeOpts || { spacing: 24 },
    source: source || null,
  };
}

/**
 * @param {object} layer
 * @returns {string|null} the host layer id this motif adorns, or null.
 */
export function motifHostId(layer) {
  return layer?.params?.hostLayerId ?? null;
}

/**
 * Lazy-compile-on-READ accessor (C1) — the effective chain array for
 * DISPLAY, consumed by the rack UI (C2/C3) so it can render Blocks uniformly
 * whether or not the binding has been rewritten to chain-form yet. Pure, no
 * mutation, no side effects — mirrors the render seam's own gating
 * (`resolveSelection` in compileSelectionToChain.js) so the two never
 * disagree on which shape a binding is in.
 *   • `binding.chain` present ⇒ returned AS-IS, same reference (no defensive
 *     copy — callers that mutate a chain returned here are already breaking
 *     the "never mutate" contract of every helper in this module).
 *   • else ⇒ `compileSelectionToChain(binding.selection).chain` (legacy).
 *   • empty/undefined binding ⇒ `compileSelectionToChain({}).chain`, i.e.
 *     the same all-defaults chain `resolveSelection` would run for `{}`.
 * @param {{chain?: Array<object>, selection?: object}} [binding]
 * @returns {Array<object>}
 */
export function readChain(binding) {
  const b = binding || {};
  if (Array.isArray(b.chain)) return b.chain;
  return compileSelectionToChain(b.selection).chain;
}

/**
 * The first-edit rewrite primitive (C1, D9): "rewrite legacy→chain on first
 * block edit as ONE undo entry" is satisfied by the rack UI calling this
 * ONCE and feeding its result into a single `updateLayer` patch (one
 * coalescing undo entry — see useLayers.updateLayer). This helper only
 * COMPUTES the new binding; it never touches useLayers/undo itself.
 *   • `binding.chain` already present ⇒ returned UNCHANGED, same reference
 *     (idempotent — no needless rewrite, no needless undo-entry churn if a
 *     caller calls this defensively on every edit).
 *   • else (legacy) ⇒ a NEW chain-form binding `{...binding, chain,
 *     overrides?, placement}` compiled via `compileSelectionToChain`, with
 *     `selection` DROPPED (not retained).
 *
 * Retain-vs-drop `selection`, decided: DROP. The render seam
 * (`resolveSelection`) keys off `chain` presence alone, so a stale
 * `selection` sitting alongside a chain would be inert at render time —
 * but it is not inert as DATA: it would silently re-diverge from `chain`
 * the moment either is edited independently (e.g. a future bug path, or a
 * dev tool that still writes `.selection`), and it permanently confuses
 * "which shape is this binding" for anything that inspects the object
 * directly (devtools, serialization diffs, future migration code) instead
 * of routing through `readChain`. Since D9 defines chain-form purely by
 * `.chain` presence with no version stamp, keeping the shapes mutually
 * exclusive is what makes that presence check trustworthy. The rewrite is a
 * genuine transition, not an overlay — write pure chain-form.
 *
 * Never mutates the input binding.
 * @param {{chain?: Array<object>, selection?: object, overrides?: object, placement?: object}} [binding]
 * @returns {{chain: Array<object>, overrides?: object, placement?: object}}
 */
export function ensureChainForm(binding) {
  const b = binding || {};
  if (Array.isArray(b.chain)) return b;
  const { chain, overrides } = compileSelectionToChain(b.selection);
  const out = { ...b, chain };
  delete out.selection;
  if (overrides !== undefined) out.overrides = overrides;
  return out;
}

/**
 * Recursively merge a partial binding patch into the current binding WITHOUT
 * dropping sibling branches — a patch of only `{ selection: { rate: { n } } }`
 * must preserve `selection.roles` AND the whole `placement` subtree. Plain
 * objects merge; everything else (arrays like `selection.roles`, scalars)
 * REPLACES wholesale. Used by the Motif device UI, where every write must
 * rebuild `params.binding` whole (onUpdateLayer shallow-merges only the top
 * level, so a partial nested patch would otherwise clobber other branches).
 * @param {object} base
 * @param {object} patch
 * @returns {object} a new merged binding (inputs are never mutated).
 */
export function deepMergeBinding(base, patch) {
  const isPlain = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
  const out = { ...(base || {}) };
  for (const key of Object.keys(patch || {})) {
    const pv = patch[key];
    const bv = out[key];
    out[key] = isPlain(bv) && isPlain(pv) ? deepMergeBinding(bv, pv) : pv;
  }
  return out;
}

/**
 * Auto-generated display name for a newly created motif layer.
 * @param {object} hostLayer
 * @param {object} glyph
 * @returns {string} e.g. "Leaf on Voronoi 1"
 */
export function motifAutoName(hostLayer, glyph) {
  return `${glyph?.name ?? 'Motif'} on ${hostLayer?.name ?? 'layer'}`;
}
