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
});
