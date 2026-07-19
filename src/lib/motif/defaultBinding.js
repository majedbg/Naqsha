// defaultBinding — the ONE place that knows what a freshly-added motif's
// options look like for a given host (motif-shell, D). Extracted verbatim
// from MotifDevice's "+ Add Motif" handler so the library panel's drag-apply
// and the device's button can never drift: same host-aware anchor mode
// (semantic hosts expose structural anchors; edge hosts get polyline-capture
// edge mode), same role defaults, same proportional sizing tail.
import { defaultRolesForHost, isSemanticHost } from './hostKinds';

/**
 * Options for addMotifLayer(hostLayerId, opts) when adding a motif to a host.
 * @param {string} hostPatternType the host layer's patternType
 * @param {string} glyphRef        glyph id to bind (built-in, custom, or library uuid)
 */
export function defaultMotifAddOpts(hostPatternType, glyphRef) {
  return {
    glyphRef,
    anchorMode: isSemanticHost(hostPatternType) ? 'semantic' : 'edge',
    binding: {
      selection: {
        roles: defaultRolesForHost(hostPatternType),
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
