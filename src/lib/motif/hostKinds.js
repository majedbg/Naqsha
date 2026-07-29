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
// `branch` (space colonization, T3) is semantic rather than edge BY DESIGN: a
// rooted skeleton has REAL termini and REAL junctions, so "flowers at the tip" is
// `tip` semantics (zones.js routes role:'tip' straight to the Apex zone) rather
// than an approximation derived from min-/max-`s` edge samples. It emits its own
// `edge` anchors — semantic hosts never route through capture (see isEdgeHost).
export const SEMANTIC_MOTIF_HOSTS = Object.freeze(
  new Set([
    'grid',
    'recursive',
    'spiral',
    'voronoi',
    'circlepacking',
    'modulegrid',
    'girih',
    'truchet',
    'branch',
  ])
);

/**
 * SEMANTIC hosts whose geometry is NOT reconstructible from params — they are
 * seed-driven, so the pattern STASHES its resolved geometry on the instance
 * (`instance.motifHostGeometry`) during generate() and an order-independent
 * prepass harvests it (collectHostGeometry.js → resolveMotifHost.js).
 *
 * The distinction matters at exactly one seam: `resolveMotifHost` must forward
 * the harvested geometry for these hosts and only these. Formula hosts
 * (grid/recursive/spiral) re-derive from params and need nothing forwarded.
 *
 * The probe is a SINGLE BOOLEAN — it either records the draw stream (edge hosts)
 * or reads the stash (these), never both. A host that emits cells AND edges must
 * therefore supply BOTH from its stash, as Voronoi does, and must NOT also be
 * listed in EDGE_MOTIF_HOSTS.
 */
export const STASH_MOTIF_HOSTS = Object.freeze(
  new Set(['voronoi', 'circlepacking', 'modulegrid', 'girih', 'truchet'])
);

/**
 * Geometry keys a stash host may publish on `instance.motifHostGeometry`, and
 * which `resolveMotifHost` forwards verbatim to the extractor. Listed in one
 * place so a new stash host adds a key here rather than a new branch there.
 *   • voronoi        → drawnEdges (+ sites), legacy drawnCells
 *   • circlepacking  → circles (accepted container circles, #146)
 *   • modulegrid     → cells (resolved per-cell {x,y,half,rotation}, #151)
 *   • girih          → girihVertices + girihEdges (the de-duplicated skeleton
 *                      VERTEX GRAPH, never the draw list — that differs between
 *                      the skeleton and interlace renders, #152)
 *   • truchet        → cells (tile centres) + arcs (the tile's drawn paths, #153)
 *
 * `cells` is the GENERIC cell-grid key, matching the generic extractor
 * (cellGridAnchors.js) that reads it: Truchet (#153) reuses the same key for its
 * tile centres and adds `arcs` alongside it rather than inventing a parallel one.
 *
 * EVERY key is forwarded to EVERY stash host — resolveMotifHost and
 * pickStashGeometry both walk this one list — so each extractor must be blind to
 * the keys it does not own. That blindness is asserted in both directions
 * (moduleGrid.integration.test.js, truchet.integration.test.js); keep it true
 * when adding a key.
 */
export const STASH_GEOMETRY_KEYS = Object.freeze([
  'drawnEdges',
  'sites',
  'drawnCells',
  'circles',
  'cells',
  'girihVertices',
  'girihEdges',
  'arcs',
]);

/**
 * Whether a host supplies its motif anchors from a generate()-time STASH rather
 * than from its params. @param {string} patternType @returns {boolean}
 */
export function isStashHost(patternType) {
  return STASH_MOTIF_HOSTS.has(patternType);
}

/**
 * Polyline-emitting hosts that support generic EDGE-mode motifs via drawn-
 * geometry capture. Each was confirmed to (1) emit ctx.line or beginShape/vertex
 * polylines in generate() and (2) reseed (randomSeed/noiseSeed) at the top of
 * generate() so the capture probe does not perturb the painted output.
 */
// Keys are the pattern registry ids, NOT the class names: WaveInterference→
// 'wave', PhyllotaxisDash→'phyllodash', DifferentialGrowth→'diffgrowth'. Most
// live in the STATIC map (src/lib/patterns/index.js); the built-in extras
// (Hilbert, Lissajous, Chladni) self-register into the DYNAMIC registry at boot
// (src/lib/registerBuiltinExtras.js). Resolve either with getPatternClass(id) —
// the static map alone would report a working host as unknown.
export const EDGE_MOTIF_HOSTS = Object.freeze(
  new Set([
    'flowfield', // FlowField — particle-trail beginShape/vertex polylines
    'wave', // WaveInterference — contour beginShape/vertex polylines
    'spirograph', // Spirograph — single beginShape/vertex curve
    'topographic', // TopographicContours — iso-contour beginShape/vertex polylines
    'phyllodash', // PhyllotaxisDash — ctx.line dash segments
    'diffgrowth', // DifferentialGrowth — grown-blob beginShape/vertex polyline
    'dendrite', // Dendrite — beginShape/vertex root→tip branch polylines (S1, node ellipses ignored)
    // ── #144 (PRD #143) ──────────────────────────────────────────────────────
    // Each verified against BOTH membership conditions in the module header, in
    // the pattern source, before inclusion:
    'radialetch', // RadialEtch — ctx.line rays; randomSeed+noiseSeed at generate() top
    'hilbert', // Hilbert (extra) — ONE beginShape/vertex run; reseeds both streams
    'lissajous', // Lissajous (extra) — ONE beginShape/vertex run; reseeds both streams
    // ── #145 (PRD #143) ──────────────────────────────────────────────────────
    // Chladni — nodal-line beginShape/vertex polylines. Registered via
    // patterns/extras (patternRegistry), NOT PATTERN_CLASSES, so resolve its
    // class/defaults through getPatternClass + getDynamicDefaults. Chladni is
    // the one host with a params-aware AVAILABILITY gate: at equal mode numbers
    // its field is identically zero and it draws nothing at all. Membership here
    // is by-type and unconditional (the mechanism is edge capture whatever the
    // params); the emptiness question is answered by hostAvailability in
    // hostCapability.js, which rolesForHost consults — an unavailable host emits
    // no roles at all. That is where every capability conditional belongs.
    'chladni',
    // DELIBERATELY ABSENT — do not add by reflex:
    //   truchet — emits CELLS as well as edges. The probe is a single boolean
    //     (record the draw stream OR read the stash, never both), so listing it
    //     here would silently cost it the cell role. Its edges come from the
    //     stash, alongside its tile centres (PRD #143). SHIPPED as a stash host
    //     in #153 on exactly those terms: it is in SEMANTIC_MOTIF_HOSTS and
    //     STASH_MOTIF_HOSTS above and must stay out of this set.
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
// CIRCLE PACKING emits `cell` and nothing else (#146): one anchor per packed
// circle, at its centre. It has no lattice to cross, no strand to run along and
// no free terminus, so `cell` is both its default and its only role.
// MODULE GRID likewise emits `cell` alone (#151): one anchor per module. Its
// lattice is IMPLICIT — the pattern paints modules, not grid lines — so a glyph
// at an intersection would sit on nothing visible, and there are no crossings.
// TRUCHET emits `cell` AND `edge` (#153) and defaults to `cell`: a glyph in each
// tile is the host's headline behaviour, and the arcs are the second role a
// maker reaches for. It is listed here for the SAME reason a cell-only host must
// be — the fallback below is `'edge'`, which on Truchet would silently start
// every fresh motif on the arcs instead of the tiles.
//
// A CELL-ONLY HOST MUST BE LISTED HERE, and forgetting it fails SILENTLY: the
// fallback below is `'edge'`, `defaultMotifAddOpts` writes that straight into
// `binding.selection.roles`, the Route filter then drops every cell anchor, and
// the first motif a maker adds shows NO glyphs and NO dots — while the resolver,
// the extractor and every unit test keyed off a hand-picked role stay green.
//
// GIRIH defaults to `crossing` (#152) — and not as a copy of grid/recursive.
// A glyph at every strap crossing is exactly what the historical naqsheh work
// does (PRD #143 story 23), and girih emits crossings under every params set
// (its skeleton always has degree-4 vertices where straps meet), so the first
// placement is never empty.
//
// BRANCH gets `tip`: a space-colonization plant ALWAYS has termini under default
// params (dozens of them — that is the whole point of the host), so unlike the
// spiral hub this default can never be dead. `tip` is also the role that makes
// the first placement read as intended — a flower at every branch end.
const DEFAULT_SEMANTIC_ROLE = Object.freeze({
  grid: 'crossing',
  recursive: 'crossing',
  voronoi: 'crossing',
  spiral: 'edge',
  circlepacking: 'cell',
  modulegrid: 'cell',
  girih: 'crossing',
  truchet: 'cell',
  branch: 'tip',
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

/**
 * Whether a host anchors motifs by a structural (crossing/tip/cell) extractor.
 * Params-aware, the exact complement of isEdgeHost for a grid: a single-axis grid
 * is NOT semantic (it routes through edge capture). `params` is optional — omit it
 * and a grid stays semantic (single-arg back-compat, still relied on by callers
 * that genuinely have no params in hand).
 *
 * SUPERSEDED NOTE (#154 step 2): this docblock used to say the pre-render binding
 * writers in defaultBinding/starterChips call this BY TYPE ALONE and lean on the
 * render-time edge override to fix a grid that later goes single-axis. They no
 * longer do — both now pass the host's live params, so a motif created on a
 * columns-only grid gets `anchorMode: 'edge'` at CREATE time rather than being
 * corrected at render. The render-time override still stands as the safety net
 * for documents written before that change.
 * @param {string} patternType @param {object} [params] @returns {boolean}
 */
export function isSemanticHost(patternType, params) {
  if (!SEMANTIC_MOTIF_HOSTS.has(patternType)) return false;
  if (patternType === 'grid' && params && gridIsSingleAxis(params)) return false;
  return true;
}

/**
 * A grid drawn on exactly ONE axis (only columns OR only rows) is, for motif
 * purposes, just a bundle of parallel straight-line PATHS: it has no crossings,
 * so its semantic extractor yields only 2 `tip` anchors per line and a motif has
 * nowhere to distribute ALONG the line (the "vine up a column" case). Such a
 * grid is routed through the EDGE-host capture path instead — its drawn
 * `ctx.line` segments are captured as polylines and motifs are arc-length
 * sampled along them. Mirrors Grid.js:42/49 (>=0.5 gates whether an axis draws).
 * A WARPED single-axis grid also qualifies here (params carry no modulation to
 * distinguish it — warp is resolved from a guide layer at render). useCanvas
 * injects the resolved modulation into the capture probe so it draws the same
 * warped bezierVertex curve the canvas paints; capturePolylines flattens those
 * Béziers (shared adaptive flattenCubic, ticket #111) into exact-to-paint
 * polylines, so the vine follows the curved edge.
 * @param {object} [params] @returns {boolean}
 */
function gridIsSingleAxis(params) {
  const v = (params?.drawVertical ?? 1) >= 0.5;
  const h = (params?.drawHorizontal ?? 1) >= 0.5;
  return v !== h; // XOR: exactly one axis drawn.
}

/**
 * Whether a host anchors motifs by EDGE capture (arc-length along drawn
 * polylines) rather than a semantic extractor. Params-aware: a `grid` is an edge
 * host WHEN single-axis (see gridIsSingleAxis) so a columns-only / rows-only grid
 * distributes motifs along its lines. `params` is optional — omitting it keeps
 * the pure by-type behaviour (native edge hosts only), so single-arg callers that
 * never see a single-axis grid stay byte-identical.
 * @param {string} patternType @param {object} [params] @returns {boolean}
 */
export function isEdgeHost(patternType, params) {
  if (EDGE_MOTIF_HOSTS.has(patternType)) return true;
  if (patternType === 'grid' && params && gridIsSingleAxis(params)) return true;
  return false;
}

/**
 * Semantic hosts whose anchors carry PATH STRUCTURE — `meta.pathIndex` and
 * `meta.closed`. Every EDGE host does by construction (arc-length samples along
 * captured polylines); until girih (#152) no SEMANTIC host did, which is why the
 * Route block's `closed`/`picked` scopes and the canvas path picker were both
 * gated on `isEdgeHost`. Girih's straps ARE paths — the strand decomposition is
 * the whole point of its extractor — so it belongs to the same class for those
 * two surfaces even though its anchors are structural, not sampled.
 *
 * Kept HERE rather than in hostCapability.js on purpose: this is mechanism
 * classification (what shape do this host's anchors have), the same kind of
 * statement as `isEdgeHost` beside it. hostCapability answers ONE question with
 * ONE shape — `{available, reason}` — and its header warns against growing it.
 */
const PATH_STRUCTURED_SEMANTIC_HOSTS = Object.freeze(new Set(['girih']));

/**
 * Whether `patternType` emits anchors carrying `meta.pathIndex` / `meta.closed`,
 * i.e. whether the Route block should offer the Closed / Open / Picked path
 * scopes and the canvas strap picker. THE single predicate both the Route UI and
 * AnchorGhostOverlay ask — never an inline `patternType === 'girih'`.
 *
 * Params-aware exactly as its neighbours are: a single-axis grid routes through
 * edge capture and so does carry path structure, while a two-axis grid does not.
 * @param {string} patternType @param {object} [params] @returns {boolean}
 */
export function hostHasPathStructure(patternType, params) {
  if (isEdgeHost(patternType, params)) return true;
  return PATH_STRUCTURED_SEMANTIC_HOSTS.has(patternType);
}

/** @param {string} patternType @returns {boolean} */
export function isMotifHost(patternType) {
  return MOTIF_HOSTS.has(patternType);
}
