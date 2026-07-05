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

export const MOTIF_TYPE = 'motif';

/**
 * @param {object} layer
 * @returns {boolean} true iff layer is a motif layer (by type or patternType).
 */
export function isMotifLayer(layer) {
  return !!(layer && (layer.type === MOTIF_TYPE || layer.patternType === MOTIF_TYPE));
}

/**
 * Normalize a (possibly partial) binding to the shape placeMotifs expects:
 * `{ selection, placement }`. Missing halves default to {} so placeMotifs
 * falls back to ITS OWN defaults (selectAnchors/resolvePlacements DEFAULTS),
 * rather than motifLayer.js duplicating those defaults.
 * @param {{selection?: object, placement?: object}} [binding]
 */
function normalizeBinding(binding) {
  const b = binding || {};
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
 *   binding?: {selection?: object, placement?: object},
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
