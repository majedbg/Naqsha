// Starter chips (C5, issue #79) — curated, DATA-ONLY chain presets for the
// Motif device's quick-start row. One tap creates a NEW motif on the host,
// pre-populated with the chip's chain + slots, using ONLY built-in glyphs
// (see src/lib/motif/glyphs.js MOTIF_GLYPHS — no customGlyphs, so a chip
// works in any document, including one with none imported yet).
//
// Pure module — no p5/DOM/React. `chip.build(hostIsSemantic)` returns the
// SAME shape `Inspector.jsx`'s `addMotif` already passes to `onAddMotif`
// (`{glyphRef, anchorMode, binding}`), except `binding` is already CHAIN-FORM
// (`{chain, placement}`) rather than legacy `{selection, placement}` — C1's
// `createMotifParams`/`normalizeBinding` preserve `binding.chain` verbatim
// (D9: chain-form is detected by `.chain` PRESENCE alone), so a chip-created
// motif is chain-form from birth and the rack (C2/C3) renders its Blocks
// immediately, no first-edit rewrite needed.
//
// HOST-AWARENESS (reusing the existing addMotif host-aware logic,
// Inspector.jsx ~687): a chip's ROUTE block adapts roles + path scope to the
// host via `hostAwareRoute` below —
//   • semantic host (grid/recursive/spiral/voronoi): anchorMode 'semantic',
//     roles ['crossing'], scope NEVER 'closed'/'picked' (A2 — those anchors
//     carry no meta.closed/pathIndex, so those scopes would silently empty
//     the selection; 'open' is a safe superset there, per
//     docs/motif-chain-ORCHESTRATOR.md A2 forward-note).
//   • edge host (flowfield/wave/…): anchorMode 'edge', roles ['edge'], the
//     requested scope used as-is ('all'/'open'/'closed' are all legal there).
// Every other block (sequence/density/everyN) is host-agnostic authored data
// — it runs unchanged regardless of which host the chip lands on.
//
// Correctness (proven in starterChips.test.js, the whole job of this data
// module): every chip's chain is ENGINE-VALID (`runSelectionChain` never
// throws; any `sequence` block is terminal + at-most-one, the load-bearing
// rack invariant from chainEditor.js), every glyphRef resolves to a BUILT-IN
// (`getGlyph(ref)` truthy with NO customGlyphs arg), and both host branches
// produce the documented anchorMode/roles/scope.

/**
 * @typedef {{glyphRef?:string, sizeScale?:number, rotationOffset?:number,
 *   flip?:boolean, rotationRandom?:{range:number, spread:'flat'|'bell'},
 *   weight?:number, rest?:boolean}} Slot
 * @typedef {{id:string, label:string, build:(hostIsSemantic:boolean) =>
 *   {glyphRef:string, anchorMode:'semantic'|'edge', binding:{chain:Array<object>, placement:object}}}} StarterChip
 */

// Fixed placement tail (ADR-0004 — not a chain block) shared by every chip;
// mirrors Inspector.jsx addMotif's default so a chip-created motif sizes the
// same as a plain "+ Add Motif" one.
const PLACEMENT = {
  sizing: { mode: 'proportional', size: 18, min: 3, margin: 0.85 },
  orientation: { policy: 'path', useNormal: true },
  flip: false,
};

/**
 * Host-aware ROUTE block shared by every chip. `edgeScope` is used verbatim
 * on an edge host; on a semantic host it is downgraded to 'all'/'open' only
 * (never 'closed'/'picked' — A2).
 * @param {boolean} hostIsSemantic
 * @param {'all'|'open'|'closed'} edgeScope
 * @returns {{type:'route', roles:string[], pathScope:'all'|'open'|'closed'}}
 */
function hostAwareRoute(hostIsSemantic, edgeScope = 'all') {
  return {
    type: 'route',
    roles: hostIsSemantic ? ['crossing'] : ['edge'],
    pathScope: hostIsSemantic ? (edgeScope === 'all' ? 'all' : 'open') : edgeScope,
  };
}

/** @type {StarterChip[]} */
export const STARTER_CHIPS = [
  {
    id: 'alternate-xo',
    label: 'Alternate x‑o',
    build(hostIsSemantic) {
      return {
        glyphRef: 'diamond',
        anchorMode: hostIsSemantic ? 'semantic' : 'edge',
        binding: {
          chain: [
            hostAwareRoute(hostIsSemantic, 'all'),
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
    label: 'Vine 🌸‑🌿‑🌿',
    build(hostIsSemantic) {
      return {
        glyphRef: 'rosette',
        anchorMode: hostIsSemantic ? 'semantic' : 'edge',
        binding: {
          chain: [
            hostAwareRoute(hostIsSemantic, 'all'),
            {
              type: 'sequence',
              mode: 'cycle',
              slots: [
                { glyphRef: 'rosette' },
                { glyphRef: 'leaf' },
                { glyphRef: 'leaf' },
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
    build(hostIsSemantic) {
      return {
        glyphRef: 'dot',
        anchorMode: hostIsSemantic ? 'semantic' : 'edge',
        binding: {
          chain: [
            hostAwareRoute(hostIsSemantic, 'all'),
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
    build(hostIsSemantic) {
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
            hostAwareRoute(hostIsSemantic, 'open'),
            { type: 'everyN', n: 3, offset: 0, continuous: false },
          ],
          placement: PLACEMENT,
        },
      };
    },
  },
];
