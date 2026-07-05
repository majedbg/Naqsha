// adornGraph — pure relationship edge model for motif↔host adornment,
// mirroring buildModulationGraph (src/lib/fields/modulationGraph.js) shape
// and skip-discipline exactly (docs/motif-adorn-arch-brief.md §2, "MIRROR
// THIS SHAPE for adornGraph").
//
// Given the layer list, derive every adorn edge motif→host: one edge per
// motif layer (isMotifLayer) whose `hostLayerId` resolves to an EXISTING,
// NON-MOTIF layer in the same array. Self-host and motif-hosting-a-motif are
// both skipped — motifs-on-motifs recursion is explicitly out of v1
// (docs/motif-adorn-research.md: "Out of v1: motifs-on-motifs recursion").
// Unlike modulationGraph (single active-edge-per-target), a host may be
// adorned by MULTIPLE motifs simultaneously — ordered rule/binding STACKING
// is a locked v1 decision (docs/motif-adorn-research.md amendment #10) — so
// every resolved edge is `active: true` and `byHost` accumulates the full
// list in LAYER ORDER (that order IS the stacking order; no separate
// priority field).
//
// Dangling hostLayerId (host missing/deleted) is NOT cleaned up anywhere —
// same tolerate-dangling precedent as modulator.maps. It simply falls out as
// an orphan the next time buildAdornGraph runs over the current layers.
//
// Pure + deterministic: fresh Maps/arrays every call, never mutates the input.

import { isMotifLayer } from './motifLayer';

/**
 * @param {object[]} layers
 * @returns {{
 *   edges: { motifId: string, hostId: string, glyphRef: string|null, active: boolean }[],
 *   byHost: Map<string, object[]>,
 *   byMotif: Map<string, object>,
 *   orphans: { motifId: string }[],
 * }}
 */
export function buildAdornGraph(layers) {
  const edges = [];
  const byHost = new Map();
  const byMotif = new Map();
  const orphans = [];

  if (!Array.isArray(layers)) return { edges, byHost, byMotif, orphans };

  const byId = new Map();
  for (const layer of layers) {
    if (layer && layer.id != null) byId.set(layer.id, layer);
  }

  for (const layer of layers) {
    if (!layer || !isMotifLayer(layer)) continue;

    const motifId = layer.id;
    const hostId = layer.params?.hostLayerId ?? null;

    // Skip (→ orphan): no hostLayerId, self-host, dangling host, or the host
    // is ITSELF a motif layer (motifs-on-motifs excluded from v1).
    if (hostId == null || hostId === motifId) {
      orphans.push({ motifId });
      continue;
    }
    const hostLayer = byId.get(hostId);
    if (!hostLayer || isMotifLayer(hostLayer)) {
      orphans.push({ motifId });
      continue;
    }

    const edge = {
      motifId,
      hostId,
      glyphRef: layer.params?.glyphRef ?? null,
      active: true,
    };
    edges.push(edge);
    byMotif.set(motifId, edge);

    const stack = byHost.get(hostId);
    if (stack) stack.push(edge);
    else byHost.set(hostId, [edge]);
  }

  return { edges, byHost, byMotif, orphans };
}

export default buildAdornGraph;
