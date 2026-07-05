import { describe, it, expect } from 'vitest';
import { buildAdornGraph } from './adornGraph';

// buildAdornGraph(layers) mirrors buildModulationGraph (src/lib/fields/modulationGraph.js):
// one edge per motif layer whose hostLayerId resolves to an existing, non-motif
// host layer in the SAME layers array. Self-host, dangling hostLayerId, and
// motif-hosting-a-motif (out of v1 — docs/motif-adorn-research.md: "Out of v1:
// motifs-on-motifs recursion") are all skipped → orphan, not edge. Fully
// tolerant of a host being deleted out from under a motif: no cascade cleanup,
// the dangling reference just falls out as an orphan on next derivation.

const host = (id, over = {}) => ({ id, patternType: 'voronoi', name: `Host ${id}`, ...over });
const motif = (id, hostLayerId) => ({
  id,
  type: 'motif',
  patternType: 'motif',
  name: `Motif ${id}`,
  params: { glyphRef: `glyph-${id}`, hostLayerId },
});

describe('buildAdornGraph', () => {
  it('emits one edge for a single motif adorning a host', () => {
    const h = host('h1');
    const m = motif('m1', 'h1');
    const graph = buildAdornGraph([h, m]);

    expect(graph.edges).toEqual([
      { motifId: 'm1', hostId: 'h1', glyphRef: 'glyph-m1', active: true },
    ]);
    expect(graph.byHost.get('h1')).toEqual(graph.edges);
    expect(graph.byMotif.get('m1')).toEqual(graph.edges[0]);
    expect(graph.orphans).toEqual([]);
  });

  it('two motifs adorning one host: byHost lists both, in layer order (stacking)', () => {
    const h = host('h1');
    const m1 = motif('m1', 'h1');
    const m2 = motif('m2', 'h1');
    const layers = [h, m1, m2];
    const graph = buildAdornGraph(layers);

    expect(graph.edges.length).toBe(2);
    const stack = graph.byHost.get('h1');
    expect(stack.length).toBe(2);
    expect(stack[0].motifId).toBe('m1');
    expect(stack[1].motifId).toBe('m2');

    // Reordering the motif layers reorders the stack — layer-order IS the
    // stacking order, no separate priority field.
    const reversedLayers = [h, m2, m1];
    const reversedGraph = buildAdornGraph(reversedLayers);
    const reversedStack = reversedGraph.byHost.get('h1');
    expect(reversedStack[0].motifId).toBe('m2');
    expect(reversedStack[1].motifId).toBe('m1');
  });

  it('a dangling hostLayerId (host not in layers) produces an orphan, not an edge', () => {
    const m = motif('m1', 'does-not-exist');
    const graph = buildAdornGraph([m]);

    expect(graph.edges).toEqual([]);
    expect(graph.byMotif.get('m1')).toBeUndefined();
    expect(graph.orphans).toEqual([{ motifId: 'm1' }]);
  });

  it('a missing hostLayerId (null/undefined) produces an orphan', () => {
    const m1 = motif('m1', null);
    const m2 = motif('m2', undefined);
    const graph = buildAdornGraph([m1, m2]);

    expect(graph.edges).toEqual([]);
    expect(graph.orphans).toEqual([{ motifId: 'm1' }, { motifId: 'm2' }]);
  });

  it('self-host (motif referencing itself as host) is an orphan', () => {
    const m = motif('m1', 'm1');
    const graph = buildAdornGraph([m]);

    expect(graph.edges).toEqual([]);
    expect(graph.orphans).toEqual([{ motifId: 'm1' }]);
  });

  it('a motif hosting a motif is an orphan (motifs-on-motifs excluded from v1)', () => {
    const m1 = motif('m1', 'h1'); // will attempt to host m2
    const m2 = motif('m2', 'm1'); // hostLayerId points at m1, which is itself a motif
    const h = host('h1');
    const graph = buildAdornGraph([h, m1, m2]);

    // m1 resolves fine (host h1 is not a motif).
    expect(graph.byMotif.get('m1')).toEqual({
      motifId: 'm1', hostId: 'h1', glyphRef: 'glyph-m1', active: true,
    });
    // m2's host (m1) IS a motif layer -> orphan, not edge.
    expect(graph.byMotif.get('m2')).toBeUndefined();
    expect(graph.orphans).toEqual([{ motifId: 'm2' }]);
    expect(graph.edges.length).toBe(1);
  });

  it('an import or text layer is a valid host (only MOTIF hosts are excluded, not host "kind")', () => {
    const importHost = { id: 't1', type: 'import', patternType: 'import', name: 'Traced Path' };
    const m = motif('m1', 't1');
    const graph = buildAdornGraph([importHost, m]);

    expect(graph.edges).toEqual([
      { motifId: 'm1', hostId: 't1', glyphRef: 'glyph-m1', active: true },
    ]);
    expect(graph.orphans).toEqual([]);
  });

  it('non-motif layers produce no edges and are never hosts-with-empty-stacks in byHost', () => {
    const h1 = host('h1');
    const h2 = host('h2');
    const graph = buildAdornGraph([h1, h2]);

    expect(graph.edges).toEqual([]);
    expect(graph.byHost.size).toBe(0);
    expect(graph.byHost.get('h2')).toBeUndefined();
  });

  it('a host with no motifs is absent from byHost (not present with an empty array)', () => {
    const h = host('h1');
    const m = motif('m1', 'h2'); // dangling; h2 doesn't exist
    const graph = buildAdornGraph([h, m]);

    expect(graph.byHost.has('h1')).toBe(false);
  });

  it('orphans on host delete: removing the host from layers moves the motif to orphans on rebuild', () => {
    const h = host('h1');
    const m = motif('m1', 'h1');
    const layers = [h, m];

    const before = buildAdornGraph(layers);
    expect(before.edges.length).toBe(1);
    expect(before.orphans).toEqual([]);

    // Simulate removeLayer(h1) — no cascade cleanup of m.params.hostLayerId,
    // per the tolerate-dangling precedent (docs/motif-adorn-arch-brief.md §3).
    const afterRemoval = layers.filter((l) => l.id !== 'h1');
    const after = buildAdornGraph(afterRemoval);

    expect(after.edges).toEqual([]);
    expect(after.byMotif.get('m1')).toBeUndefined();
    expect(after.orphans).toEqual([{ motifId: 'm1' }]);
  });

  it('is deterministic: identical input layers produce toEqual-identical output', () => {
    const h = host('h1');
    const m1 = motif('m1', 'h1');
    const m2 = motif('m2', 'h1');
    const layers = [h, m1, m2];

    const graphA = buildAdornGraph(layers);
    const graphB = buildAdornGraph(layers);

    expect(graphA.edges).toEqual(graphB.edges);
    expect(graphA.orphans).toEqual(graphB.orphans);
    expect([...graphA.byHost.entries()]).toEqual([...graphB.byHost.entries()]);
    expect([...graphA.byMotif.entries()]).toEqual([...graphB.byMotif.entries()]);
  });

  it('tolerates missing/empty layers input', () => {
    expect(buildAdornGraph([]).edges).toEqual([]);
    expect(buildAdornGraph(undefined).edges).toEqual([]);
  });

  it('does not mutate input layers', () => {
    const h = host('h1');
    const m = motif('m1', 'h1');
    const layers = [h, m];
    const snapshot = JSON.stringify(layers);
    buildAdornGraph(layers);
    expect(JSON.stringify(layers)).toBe(snapshot);
  });

  it('glyphRef falls back to null when params.glyphRef is absent', () => {
    const h = host('h1');
    const m = { id: 'm1', type: 'motif', patternType: 'motif', params: { hostLayerId: 'h1' } };
    const graph = buildAdornGraph([h, m]);
    expect(graph.edges[0].glyphRef).toBeNull();
  });
});
