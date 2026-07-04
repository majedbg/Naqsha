// resolveMotifHost — pure cross-layer read that supplies a motif layer with the
// extra render params it needs to place glyphs against its host (semantic mode
// reads the host's patternType + params). Mirrors the pure cross-layer pattern
// of resolveModulationForTarget: a params-only read off the `layers` array, with
// NO dependency on render ordering and NO access to drawn host geometry.
//
// Voronoi + edge-on-arbitrary-hosts are OUT of scope for this slice — they need
// the host's DRAWN geometry (hostPaths), which this helper deliberately does not
// resolve. A motif on such a host degrades gracefully: MotifPattern's semantic
// extractor returns null → falls back to edge on absent hostPaths → empty
// placements. That is the acceptable no-op this slice ships.

import { isMotifLayer, motifHostId } from './motifLayer.js';

/**
 * Extra render params a motif layer needs, or null when the layer is not a
 * motif or its host is missing (dangling id tolerated → motif renders nothing).
 * Pure: reads host.patternType + host.params from the layers array.
 * @param {object} layer
 * @param {object[]} layers
 * @returns {{hostPatternType: string, hostParams: object}|null}
 */
export function resolveMotifHostParams(layer, layers) {
  if (!isMotifLayer(layer)) return null;
  const hostId = motifHostId(layer);
  const host = hostId ? layers.find((l) => l.id === hostId) : null;
  if (!host) return null; // dangling host → tolerate (motif renders nothing)
  return { hostPatternType: host.patternType, hostParams: host.params };
}
