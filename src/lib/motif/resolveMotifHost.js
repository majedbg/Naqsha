// resolveMotifHost — pure cross-layer read that supplies a motif layer with the
// extra render params it needs to place glyphs against its host (semantic mode
// reads the host's patternType + params). Mirrors the pure cross-layer pattern
// of resolveModulationForTarget: a params-only read off the `layers` array, with
// NO dependency on render ordering for the formula hosts (grid/recursive/spiral).
//
// VORONOI is the exception: its semantic anchors cannot be derived from params
// (its sites come from ctx.random — irreproducible outside the live draw; see
// semanticAnchors.js voronoi header). Instead the host CAPTURES its resolved
// cells during generate() (VoronoiCells.motifHostGeometry) and useCanvas threads
// them here via the optional `hostGeometry` map (keyed by host layer id). When a
// voronoi host's drawnCells are present we forward them; when absent (the host
// hasn't rendered yet, e.g. a motif BELOW its host in z-order) we omit them and
// the motif degrades to null voronoi anchors → nothing placed. Edge-on-arbitrary
// hosts remain OUT of scope for this slice.

import { isMotifLayer, motifHostId } from './motifLayer.js';

/**
 * Extra render params a motif layer needs, or null when the layer is not a
 * motif or its host is missing (dangling id tolerated → motif renders nothing).
 * Pure: reads host.patternType + host.params from the layers array; for a
 * voronoi host, also forwards captured drawnCells from hostGeometry when present.
 * @param {object} layer
 * @param {object[]} layers
 * @param {Object<string, {drawnCells?: object[]}>} [hostGeometry] per-frame map
 *   of host layer id → geometry captured during that host's generate() run.
 * @returns {{hostPatternType: string, hostParams: object, drawnCells?: object[]}|null}
 */
export function resolveMotifHostParams(layer, layers, hostGeometry = {}) {
  if (!isMotifLayer(layer)) return null;
  const hostId = motifHostId(layer);
  const host = hostId ? layers.find((l) => l.id === hostId) : null;
  if (!host) return null; // dangling host → tolerate (motif renders nothing)
  const out = { hostPatternType: host.patternType, hostParams: host.params };
  if (host.patternType === 'voronoi') {
    const drawnCells = hostGeometry[hostId] && hostGeometry[hostId].drawnCells;
    if (drawnCells) out.drawnCells = drawnCells;
  }
  return out;
}
