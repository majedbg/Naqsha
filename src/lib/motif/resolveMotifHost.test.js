// Unit tests for resolveMotifHostParams — the pure cross-layer host-params read
// that useCanvas merges into a motif layer's render params. Mirrors the
// tolerate-dangling / pure-read contract of resolveModulationForTarget.

import { describe, it, expect } from 'vitest';
import { resolveMotifHostParams } from './resolveMotifHost.js';
import { MOTIF_TYPE } from './motifLayer.js';

const gridHost = {
  id: 'host-1',
  patternType: 'grid',
  params: { cols: 8, rows: 6, spacing: 24 },
};

function motifLayer(hostLayerId) {
  return {
    id: 'motif-1',
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: { glyphRef: 'leaf', hostLayerId, anchorMode: 'semantic' },
  };
}

describe('resolveMotifHostParams', () => {
  it('returns the host patternType + params for a motif pointing at a grid host', () => {
    const layers = [gridHost, motifLayer('host-1')];
    const out = resolveMotifHostParams(layers[1], layers);
    expect(out).toEqual({
      hostPatternType: 'grid',
      hostParams: gridHost.params,
    });
    // Passes the host params object through by reference (pure read, no clone).
    expect(out.hostParams).toBe(gridHost.params);
  });

  it('forwards the grid host seed as hostSeed (threads the live-p5 jitter/symmetry lattice)', () => {
    const seededGridHost = { ...gridHost, seed: 12345 };
    const layers = [seededGridHost, motifLayer('host-1')];
    const out = resolveMotifHostParams(layers[1], layers);
    expect(out.hostSeed).toBe(12345);
    expect(out.hostPatternType).toBe('grid');
    expect(out.hostParams).toBe(seededGridHost.params);
  });

  it('returns null for a non-motif layer', () => {
    const layers = [gridHost, motifLayer('host-1')];
    expect(resolveMotifHostParams(gridHost, layers)).toBeNull();
  });

  it('returns null when the hostLayerId dangles (host missing)', () => {
    const layers = [motifLayer('does-not-exist')];
    expect(resolveMotifHostParams(layers[0], layers)).toBeNull();
  });

  it('returns null when the motif has no hostLayerId', () => {
    const layers = [motifLayer(null)];
    expect(resolveMotifHostParams(layers[0], layers)).toBeNull();
  });

  it('is deterministic — repeated calls yield equal results', () => {
    const layers = [gridHost, motifLayer('host-1')];
    const a = resolveMotifHostParams(layers[1], layers);
    const b = resolveMotifHostParams(layers[1], layers);
    expect(a).toEqual(b);
  });

  it('does NOT add drawnCells for a formula host even when hostGeometry has an entry', () => {
    const layers = [gridHost, motifLayer('host-1')];
    const hostGeometry = { 'host-1': { drawnCells: [{ vertices: [], site: { x: 0, y: 0 } }] } };
    const out = resolveMotifHostParams(layers[1], layers, hostGeometry);
    expect(out).toEqual({ hostPatternType: 'grid', hostParams: gridHost.params });
    expect(out).not.toHaveProperty('drawnCells');
  });
});

describe('resolveMotifHostParams — voronoi drawn-geometry seam', () => {
  const voronoiHost = { id: 'vh', patternType: 'voronoi', params: { cellCount: 40 } };
  const motif = {
    id: 'm',
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    params: { glyphRef: 'leaf', hostLayerId: 'vh', anchorMode: 'semantic' },
  };
  const cells = [{ vertices: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }], site: { x: 3, y: 4 } }];

  it('forwards drawnCells when the voronoi host geometry is present', () => {
    const layers = [voronoiHost, motif];
    const out = resolveMotifHostParams(motif, layers, { vh: { drawnCells: cells } });
    expect(out.hostPatternType).toBe('voronoi');
    expect(out.hostParams).toBe(voronoiHost.params);
    expect(out.drawnCells).toBe(cells);
  });

  it('omits drawnCells when the voronoi host has not rendered (absent geometry)', () => {
    const layers = [voronoiHost, motif];
    const out = resolveMotifHostParams(motif, layers, {});
    expect(out).toEqual({ hostPatternType: 'voronoi', hostParams: voronoiHost.params });
    expect(out).not.toHaveProperty('drawnCells');
  });

  it('omits drawnCells when hostGeometry arg is omitted entirely (2-arg call)', () => {
    const layers = [voronoiHost, motif];
    const out = resolveMotifHostParams(motif, layers);
    expect(out).not.toHaveProperty('drawnCells');
  });

  it('forwards drawnEdges + sites (the boundary-hardened seam) when present', () => {
    const layers = [voronoiHost, motif];
    const drawnEdges = [{ x1: 1, y1: 2, x2: 3, y2: 4 }];
    const geomSites = [{ x: 2, y: 3 }];
    const out = resolveMotifHostParams(motif, layers, {
      vh: { drawnEdges, sites: geomSites },
    });
    expect(out.hostPatternType).toBe('voronoi');
    expect(out.drawnEdges).toBe(drawnEdges);
    expect(out.sites).toBe(geomSites);
    expect(out).not.toHaveProperty('drawnCells');
  });

  it('forwards drawnEdges/sites AND legacy drawnCells together (all present)', () => {
    const layers = [voronoiHost, motif];
    const drawnEdges = [{ x1: 0, y1: 0, x2: 5, y2: 5 }];
    const geomSites = [{ x: 1, y: 1 }];
    const out = resolveMotifHostParams(motif, layers, {
      vh: { drawnEdges, sites: geomSites, drawnCells: cells },
    });
    expect(out.drawnEdges).toBe(drawnEdges);
    expect(out.sites).toBe(geomSites);
    expect(out.drawnCells).toBe(cells);
  });

  it('does NOT forward drawnEdges/sites for a formula (grid) host', () => {
    const gridMotif = {
      id: 'm2',
      type: MOTIF_TYPE,
      patternType: MOTIF_TYPE,
      params: { glyphRef: 'leaf', hostLayerId: 'host-1', anchorMode: 'semantic' },
    };
    const layers = [gridHost, gridMotif];
    const out = resolveMotifHostParams(gridMotif, layers, {
      'host-1': { drawnEdges: [{ x1: 0, y1: 0, x2: 1, y2: 1 }], sites: [{ x: 0, y: 0 }] },
    });
    expect(out).toEqual({ hostPatternType: 'grid', hostParams: gridHost.params });
    expect(out).not.toHaveProperty('drawnEdges');
    expect(out).not.toHaveProperty('sites');
  });
});
