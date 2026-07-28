// defaultBinding — the ONE place that knows what a freshly-added motif's
// options look like for a given host (motif-shell, D). Extracted verbatim
// from MotifDevice's "+ Add Motif" handler so the library panel's drag-apply
// and the device's button can never drift: same host-aware anchor mode
// (semantic hosts expose structural anchors; edge hosts get polyline-capture
// edge mode), same role defaults, same proportional sizing tail.
import { isSemanticHost } from './hostKinds';
import { defaultRolesFor } from './hostRoles';

/**
 * Options for addMotifLayer(hostLayerId, opts) when adding a motif to a host.
 * @param {string} hostPatternType the host layer's patternType
 * @param {string} glyphRef        glyph id to bind (built-in, custom, or library uuid)
 * @param {object} [hostParams]    the host layer's live params (#154 step 2). What a
 *   host emits can depend on its params — a columns-only Grid has no crossings —
 *   so the role written HERE is params-aware and a create-time writer can no
 *   longer store a role the host does not offer. Omitting it keeps the by-type
 *   answer, so every existing caller is byte-identical.
 */
export function defaultMotifAddOpts(hostPatternType, glyphRef, hostParams) {
  return {
    glyphRef,
    anchorMode: isSemanticHost(hostPatternType, hostParams) ? 'semantic' : 'edge',
    binding: {
      selection: {
        roles: defaultRolesFor(hostPatternType, hostParams),
        rate: { n: 1 },
      },
      placement: {
        sizing: { mode: 'proportional', size: 18, min: 3, margin: 0.85 },
        orientation: { policy: 'path', useNormal: true },
        flip: false,
      },
    },
  };
}
