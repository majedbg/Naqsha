// hostKinds — the single source of truth for which pattern types can HOST a
// motif, and by which anchoring mechanism. Previously the legal-host set was
// duplicated as an inline `MOTIF_HOSTS` literal in Inspector.jsx and
// AnchorGhostOverlay.jsx; B2 (arbitrary-edge host capture, docs/motif-chain-plan
// D8) widens the host set and the two consumers need DIFFERENT slices of it, so
// the classification lives here.
//
// Two kinds of host:
//   • SEMANTIC hosts expose structural anchors (crossing/tip/cell) derived from
//     their params or captured cells — grid/recursive/spiral/voronoi. Their
//     anchor extractors live in semanticAnchors.js and their pre-render ghost
//     preview works in AnchorGhostOverlay.
//   • EDGE hosts are ANY polyline-emitting formula pattern (flowfield, wave,
//     spirograph, …). They have NO semantic extractor; a motif on them samples
//     generic Edge anchors along the host's DRAWN polylines, captured
//     order-independently via the record-mode adapter + capturePolylines.js.
//     (See resolveMotifHost.js / useCanvas.js prepass.)
//
// A host qualifies as an EDGE host only if its generate() actually emits
// capturable polylines (ctx.line / beginShape+vertex) AND reseeds its RNG at the
// top of generate() (ctx.randomSeed/noiseSeed) — the reseed is what keeps the
// probe generation from shifting the host's painted realization. Every type
// below was verified against both conditions before inclusion.

/** Hosts with a structural (crossing/tip/cell) anchor extractor. */
export const SEMANTIC_MOTIF_HOSTS = Object.freeze(
  new Set(['grid', 'recursive', 'spiral', 'voronoi'])
);

/**
 * Polyline-emitting hosts that support generic EDGE-mode motifs via drawn-
 * geometry capture. Each was confirmed to (1) emit ctx.line or beginShape/vertex
 * polylines in generate() and (2) reseed (randomSeed/noiseSeed) at the top of
 * generate() so the capture probe does not perturb the painted output.
 */
// Keys are the PATTERN_CLASSES registry ids (src/lib/patterns/index.js), NOT the
// class names: WaveInterference→'wave', PhyllotaxisDash→'phyllodash',
// DifferentialGrowth→'diffgrowth'.
export const EDGE_MOTIF_HOSTS = Object.freeze(
  new Set([
    'flowfield', // FlowField — particle-trail beginShape/vertex polylines
    'wave', // WaveInterference — contour beginShape/vertex polylines
    'spirograph', // Spirograph — single beginShape/vertex curve
    'topographic', // TopographicContours — iso-contour beginShape/vertex polylines
    'phyllodash', // PhyllotaxisDash — ctx.line dash segments
    'diffgrowth', // DifferentialGrowth — grown-blob beginShape/vertex polyline
    'dendrite', // Dendrite — ctx.line branch segments (node ellipses ignored)
  ])
);

/** Union of every pattern type that may host a motif (Inspector device gate). */
export const MOTIF_HOSTS = Object.freeze(
  new Set([...SEMANTIC_MOTIF_HOSTS, ...EDGE_MOTIF_HOSTS])
);

// The selection role a motif takes when FIRST added to a host. It MUST be a role
// the host actually PRODUCES under DEFAULT params — otherwise the initial
// selection is empty, nothing renders, and every chain option the user then
// toggles operates on an empty set. grid/recursive/voronoi always emit `crossing`
// (grid: lattice intersections; recursive: polygon vertices; voronoi: shared
// circumcenters), so they keep it. SPIRAL does NOT: its only `crossing` is the
// center hub, emitted solely when armCount>1 AND the arms share the origin
// (startR===0). The app default innerRadius (5, DEFAULT_PARAMS.spiral) keeps
// startR≠0, so a default spiral yields NO crossing anchors — it defaults to
// `edge` (arc-length samples along each arm), which it always produces. Any host
// not listed (edge hosts, unknown) falls back to `edge`, matching the generic
// Edge-anchor path. Keyed by PATTERN_CLASSES registry id.
const DEFAULT_SEMANTIC_ROLE = Object.freeze({
  grid: 'crossing',
  recursive: 'crossing',
  voronoi: 'crossing',
  spiral: 'edge',
});

/**
 * Default selection role(s) for a motif freshly added to `patternType`. Always a
 * role the host emits under DEFAULT params, so the first placement is non-empty
 * (fixes the blanket-`crossing` dead-default on spiral). Edge hosts and any host
 * without a semantic mapping → ['edge'].
 * @param {string} patternType
 * @returns {string[]}
 */
export function defaultRolesForHost(patternType) {
  return [DEFAULT_SEMANTIC_ROLE[patternType] ?? 'edge'];
}

/** @param {string} patternType @returns {boolean} */
export function isSemanticHost(patternType) {
  return SEMANTIC_MOTIF_HOSTS.has(patternType);
}

/** @param {string} patternType @returns {boolean} */
export function isEdgeHost(patternType) {
  return EDGE_MOTIF_HOSTS.has(patternType);
}

/** @param {string} patternType @returns {boolean} */
export function isMotifHost(patternType) {
  return MOTIF_HOSTS.has(patternType);
}
