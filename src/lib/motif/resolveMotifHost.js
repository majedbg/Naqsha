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
import { isEdgeHost } from './hostKinds.js';
import {
  resolveModulationsForTarget,
  composeModulationParam,
} from '../fields/resolveModulationForTarget.js';

/**
 * Extra render params a motif layer needs, or null when the layer is not a
 * motif or its host is missing (dangling id tolerated → motif renders nothing).
 * Pure: reads host.patternType + host.params from the layers array; also
 * forwards host.seed as `hostSeed` so the grid semantic extractor can replay the
 * host's LIVE-p5 jitter/symmetry lattice (makeP5Random(hostSeed)). For a voronoi
 * host, additionally forwards captured host geometry (drawnEdges + sites, and/or
 * legacy drawnCells) from hostGeometry when present.
 * @param {object} layer
 * @param {object[]} layers
 * @param {Object<string, {drawnEdges?: object[], sites?: object[], drawnCells?: object[]}>} [hostGeometry]
 *   per-frame map of host layer id → geometry captured during that host's
 *   generate() run.
 * @returns {{hostPatternType: string, hostParams: object, hostSeed: (number|undefined), drawnEdges?: object[], sites?: object[], drawnCells?: object[]}|null}
 */
export function resolveMotifHostParams(layer, layers, hostGeometry = {}) {
  if (!isMotifLayer(layer)) return null;
  const hostId = motifHostId(layer);
  const host = hostId ? layers.find((l) => l.id === hostId) : null;
  if (!host) return null; // dangling host → tolerate (motif renders nothing)
  // B seam (#112) — resolve the host's OWN modulation IN-PLACE, via the EXACT
  // same composition the capture probe (useCanvas ~L270) and the paint pass
  // (useCanvas ~L437-439) run: composeModulationParam(resolveModulationsForTarget
  // (host, layers)). Today the math extractors (semanticAnchors / gridAnchors)
  // reconstruct from STRAIGHT host.params — modulation is resolved at render time
  // and never stored on params, so they never learn a warp channel is active and
  // silently place anchors on stale unwarped geometry. Folding the composite into
  // hostParams.modulation surfaces that channel to the extractor's warp guard
  // (`params.modulation.channel==='warp'`), matching the warp the paint pass sees.
  // This slice only SURFACES warp; the extractors that consume it are later slices.
  //   • Pure + order-INDEPENDENT: resolveModulationsForTarget reads the `layers`
  //     array directly (guide → target maps), never the reverse render order.
  //   • No modulation → composeModulationParam returns undefined → hostParams is
  //     the SAME host.params reference (byte-identical to pre-#112; regression
  //     fixture). The spread (never a mutation) also leaves host.params untouched.
  const hostMod = composeModulationParam(resolveModulationsForTarget(host, layers));
  const hostParams = hostMod ? { ...host.params, modulation: hostMod } : host.params;
  // hostSeed threads the grid host's layer seed to the semantic extractor, which
  // feeds makeP5Random(hostSeed) into the geometry core to reproduce the LIVE-p5
  // jittered / symmetry-replicated lattice (see semanticAnchors GRID header).
  const out = { hostPatternType: host.patternType, hostParams, hostSeed: host.seed };
  if (host.patternType === 'voronoi') {
    // Forward the WHOLE captured host geometry: drawnEdges + sites (the
    // boundary-hardened seam the extractor prefers) and/or legacy drawnCells.
    // Absent → omit (graceful null anchors → nothing placed).
    const geom = hostGeometry[hostId];
    if (geom) {
      if (geom.drawnEdges) out.drawnEdges = geom.drawnEdges;
      if (geom.sites) out.sites = geom.sites;
      if (geom.drawnCells) out.drawnCells = geom.drawnCells; // legacy
    }
  } else if (isEdgeHost(host.patternType, host.params)) {
    // B2 — arbitrary-edge host (flowfield/wave/…) OR a single-axis grid (params-
    // aware isEdgeHost): the host has NO usable semantic extractor for this case,
    // so FORCE edge anchoring and forward the polylines captured by the record-
    // mode prepass (capturePolylines) as `hostPaths`. anchorMode:'edge'
    // overrides whatever the binding stored (motifs are created with the
    // 'semantic' default) so the motif samples generic Edge anchors along the
    // host's drawn geometry. Absent hostPaths (host not yet probed) → omit → the
    // motif degrades to empty edge anchors → nothing placed (graceful, z-order-
    // independent once the prepass has run).
    out.anchorMode = 'edge';
    const geom = hostGeometry[hostId];
    if (geom && geom.hostPaths) out.hostPaths = geom.hostPaths;
  }
  return out;
}
