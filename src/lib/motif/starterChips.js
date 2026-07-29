// Starter chips (C5, issue #79) — curated, DATA-ONLY chain presets for the
// Motif device's quick-start row. One tap creates a NEW motif on the host,
// pre-populated with the chip's chain + slots, using ONLY built-in glyphs
// (see src/lib/motif/glyphs.js MOTIF_GLYPHS — no customGlyphs, so a chip
// works in any document, including one with none imported yet).
//
// Pure module — no p5/DOM/React. `chip.build(patternType, params)` returns the
// SAME shape `Inspector.jsx`'s `addMotif` already passes to `onAddMotif`
// (`{glyphRef, anchorMode, binding}`), except `binding` is already CHAIN-FORM
// (`{chain, placement}`) rather than legacy `{selection, placement}` — C1's
// `createMotifParams`/`normalizeBinding` preserve `binding.chain` verbatim
// (D9: chain-form is detected by `.chain` PRESENCE alone), so a chip-created
// motif is chain-form from birth and the rack (C2/C3) renders its Blocks
// immediately, no first-edit rewrite needed.
//
// HOST-AWARENESS (reusing the existing addMotif host-aware logic,
// Inspector.jsx ~697): a chip's ROUTE block adapts roles + path scope to the
// host via `hostAwareRoute` below, keyed by the host's `patternType` —
//   • semantic host (grid/recursive/spiral/voronoi): anchorMode 'semantic',
//     roles from `defaultRolesForHost` (grid/recursive/voronoi → ['crossing'],
//     SPIRAL → ['edge'] — a default spiral emits no `crossing` hub, so
//     ['crossing'] would silently empty the selection and no glyphs would show;
//     same dead-default as addMotif, fixed the same way), scope NEVER
//     'closed'/'picked' (A2 — those anchors carry no meta.closed/pathIndex, so
//     those scopes would silently empty the selection; 'open' is a safe superset
//     there, per docs/motif-chain-ORCHESTRATOR.md A2 forward-note).
//   • edge host (flowfield/wave/…): anchorMode 'edge', roles ['edge'] (the
//     `defaultRolesForHost` fallback), the requested scope used as-is
//     ('all'/'open'/'closed' are all legal there).
// Every other block (sequence/density/everyN) is host-agnostic authored data
// — it runs unchanged regardless of which host the chip lands on.

import { isSemanticHost } from './hostKinds.js';
import { rolesForHost, defaultRolesFor } from './hostRoles.js';
//
// Correctness (proven in starterChips.test.js, the whole job of this data
// module): every chip's chain is ENGINE-VALID (`runSelectionChain` never
// throws; any `sequence` block is terminal + at-most-one, the load-bearing
// rack invariant from chainEditor.js), every glyphRef resolves to a BUILT-IN
// (`getGlyph(ref)` truthy with NO customGlyphs arg), and both host branches
// produce the documented anchorMode/roles/scope.

/**
 * @typedef {{glyphRef?:string, sizeScale?:number, rotationOffset?:number,
 *   flip?:boolean, side?:number, rotationRandom?:{range:number, spread:'flat'|'bell'},
 *   weight?:number, rest?:boolean}} Slot
 * @typedef {{id:string, label:string, build:(patternType:string) =>
 *   {glyphRef:string, anchorMode:'semantic'|'edge', binding:{chain:Array<object>, placement:object}}}} StarterChip
 */

// Fixed placement tail (ADR-0004 — not a chain block) shared by every chip;
// mirrors Inspector.jsx addMotif's default so a chip-created motif sizes the
// same as a plain "+ Add Motif" one.
// `footprint: 'tight'` (#207, decision 3) — a NEW layer packs against the glyph's
// measured minimal enclosing circle, not a disc of `viewRadius` about its root.
// Written EXPLICITLY here rather than left to the engine's default, which stays
// `'root'` so that a pre-v2 document carrying no `sizing` object cannot repack on
// load. `motifLayer.js`'s `normalizeBinding` would stamp it anyway; stating it
// here keeps the chip's tail readable as the whole tail it is.
const PLACEMENT = {
  sizing: { mode: 'proportional', size: 18, min: 3, margin: 0.85, footprint: 'tight' },
  orientation: { policy: 'path', useNormal: true },
  flip: false,
};

/**
 * Host-aware ROUTE block shared by every chip. Roles come from the shared
 * `defaultRolesForHost` (a role the host actually PRODUCES under default params —
 * so spiral gets 'edge', not the dead 'crossing'). `edgeScope` is used verbatim
 * on an edge host; on a semantic host it is downgraded to 'all'/'open' only
 * (never 'closed'/'picked' — A2).
 *
 * `zoned` (ADR 0008, amended #150) widens the roles for a ZONED chip, whose Zones
 * together consume more than the single default role: the Vine's Apex reads
 * `tip`, its Stem reads `edge`∪`crossing` and its Cell reads `cell`, so the Route
 * must admit whatever union THIS host actually offers. That answer comes from
 * `rolesForHost` — the ONE params-aware host→roles capability seam — rather than
 * a literal list.
 *
 * WHY THAT MATTERS (#150). The literal it replaces was `['crossing','edge','tip']`
 * on every semantic host. Circle Packing and Module Grid emit `cell` and nothing
 * else, so the Route filtered every anchor away and a Vine on a packing placed
 * ZERO glyphs — before the Sequencer, before the Zones, before anything the Cell
 * Zone could fix. Fixing it at CREATE time (rather than repairing stored Routes)
 * is what constraint (a) of PRD #143 asks for: one seam, no ad-hoc conditionals.
 *
 * `rolesForHost` answers `[]` for a type that hosts no motif at all, so the
 * `defaultRolesForHost` fallback stays — a chip's chain must be engine-valid on
 * ANY type it is asked to build for.
 *
 * Omit `zoned` and behavior is byte-identical to before, so the three flat chips
 * are unchanged.
 * @param {string} patternType
 * @param {'all'|'open'|'closed'} edgeScope
 * @param {boolean} [zoned]  route the union of roles this host emits, not the default one.
 * @returns {{type:'route', roles:string[], pathScope:'all'|'open'|'closed'}}
 */
function hostAwareRoute(patternType, edgeScope = 'all', zoned = false, params) {
  const hostIsSemantic = isSemanticHost(patternType, params);
  const emitted = zoned ? rolesForHost(patternType, params) : [];
  return {
    type: 'route',
    roles: emitted.length > 0 ? emitted : defaultRolesFor(patternType, params),
    pathScope: hostIsSemantic ? (edgeScope === 'all' ? 'all' : 'open') : edgeScope,
  };
}

/** @type {StarterChip[]} */
export const STARTER_CHIPS = [
  {
    id: 'alternate-xo',
    label: 'Alternate x‑o',
    build(patternType, params) {
      const hostIsSemantic = isSemanticHost(patternType, params);
      return {
        glyphRef: 'diamond',
        anchorMode: hostIsSemantic ? 'semantic' : 'edge',
        binding: {
          chain: [
            hostAwareRoute(patternType, 'all', false, params),
            {
              type: 'sequence',
              mode: 'cycle',
              slots: [{ glyphRef: 'diamond' }, { rest: true }],
            },
          ],
          placement: PLACEMENT,
        },
      };
    },
  },
  {
    id: 'vine',
    label: 'Vine',
    build(patternType, params) {
      const hostIsSemantic = isSemanticHost(patternType, params);
      return {
        glyphRef: 'rosette',
        anchorMode: hostIsSemantic ? 'semantic' : 'edge',
        binding: {
          chain: [
            // The Vine is the ZONED preset (ADR 0008): one motif that flowers at
            // the path ends, leafs along the body and fills the enclosed regions.
            // All three Zones draw from ONE Route, so it must admit the UNION of
            // the roles they consume — Apex reads `tip` (path termini), Stem
            // reads `edge`∪`crossing` (interior samples and junctions), Cell
            // reads `cell`. That union is exactly "every role this host emits",
            // so it comes from `rolesForHost` rather than a literal list: on
            // Circle Packing it collapses to `['cell']`, on an edge host to
            // `['edge']`, on a Grid it is all four.
            hostAwareRoute(patternType, 'all', true, params),
            {
              type: 'sequence',
              // ZONED sequencer: named partitions of the survivor set, each
              // dealing its own slots. `zones` PRESENCE marks this block zoned —
              // there is no flat `slots`/`mode`/`continuous` at the block level.
              zones: [
                // Apex = the flowers. Cycle over a single rosette; `continuous`
                // so the flower index runs ACROSS paths (a per-path restart over
                // ≤2 termini would pin every strand's end to slot 0 — "flowers
                // cycling" would never visibly cycle, ADR 0008). `ends:'both'`
                // flowers every terminus (upper AND lower).
                {
                  zone: 'apex',
                  mode: 'cycle',
                  continuous: true,
                  ends: 'both',
                  slots: [{ glyphRef: 'rosette' }],
                },
                // Stem = the leaves. Cycle of two leaves that alternate sides of
                // the host line: the base-at-origin leaf hangs off ONE side
                // (glyphs.js), so turning the SECOND leaf 180° (`rotationOffset`
                // in DEGREES — placementEngine adds it to the degree-valued
                // rotation) swings its blade to the OTHER side, reading
                // leaf-above, leaf-below. A 180° turn (not `flip`) is deliberate:
                // flip is a pure x-mirror, whereas the leaf's midrib asymmetry
                // makes the half-turn visibly distinct (see glyphs.js LEAF_D).
                {
                  zone: 'stem',
                  mode: 'cycle',
                  slots: [{ glyphRef: 'leaf' }, { glyphRef: 'leaf', rotationOffset: 180 }],
                },
                // Cell = the enclosed regions the host encloses — a packed
                // circle, a tile, a face. APPENDED, never inserted: Zones render
                // and deal in stored order, so Apex → Stem → Cell reads
                // top-to-bottom as ends → body → ground, the same sentence the
                // Vine already tells (#150 decision, variant A).
                //
                // One rosette per region, matching the Apex flower rather than
                // the Stem's alternation: a cell has no direction to alternate
                // along, and on a mixed host like Truchet this reads as the
                // headline the PRD describes — tiles fill while arcs run. No
                // `continuous` key: the Cell default is per-path (false, like
                // Stem) and stating it here would be authoring a value the maker
                // cannot see or change.
                {
                  zone: 'cell',
                  mode: 'cycle',
                  slots: [{ glyphRef: 'rosette' }],
                },
              ],
            },
          ],
          placement: PLACEMENT,
        },
      };
    },
  },
  {
    id: 'sparse-scatter',
    label: 'Sparse scatter',
    build(patternType, params) {
      const hostIsSemantic = isSemanticHost(patternType, params);
      return {
        glyphRef: 'dot',
        anchorMode: hostIsSemantic ? 'semantic' : 'edge',
        binding: {
          chain: [
            hostAwareRoute(patternType, 'all', false, params),
            { type: 'density', density: 0.25, seed: 1, rngMode: 'hash' },
          ],
          placement: PLACEMENT,
        },
      };
    },
  },
  {
    id: 'border-march',
    label: 'Border march',
    build(patternType, params) {
      const hostIsSemantic = isSemanticHost(patternType, params);
      return {
        glyphRef: 'diamond',
        anchorMode: hostIsSemantic ? 'semantic' : 'edge',
        binding: {
          chain: [
            // 'open' (not 'closed'): the named browser-verify edge host
            // (flowfield) emits OPEN streamlines (meta.closed stays false),
            // so a 'closed' scope would silently place nothing there. 'open'
            // is the safe, always-populated choice on both host kinds; the
            // everyN rhythm below is what earns the "march" name.
            hostAwareRoute(patternType, 'open', false, params),
            { type: 'everyN', n: 3, offset: 0, continuous: false },
          ],
          placement: PLACEMENT,
        },
      };
    },
  },
];
