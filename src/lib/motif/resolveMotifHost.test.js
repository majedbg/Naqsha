// Unit tests for resolveMotifHostParams — the pure cross-layer host-params read
// that useCanvas merges into a motif layer's render params. Mirrors the
// tolerate-dangling / pure-read contract of resolveModulationForTarget.

import { describe, it, expect } from 'vitest';
import { resolveMotifHostParams } from './resolveMotifHost.js';
import { MOTIF_TYPE } from './motifLayer.js';
import {
  resolveModulationsForTarget,
  composeModulationParam,
} from '../fields/resolveModulationForTarget.js';
import { getSemanticAnchors } from './semanticAnchors.js';

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

// B seam (#112) — resolveMotifHostParams must resolve the host's OWN modulation
// in-place, via the EXACT composition useCanvas runs (composeModulationParam ∘
// resolveModulationsForTarget), so the math extractors reading hostParams SEE
// the warp channel the paint pass paints. A warp GUIDE layer maps to the host.
describe('resolveMotifHostParams — B seam: resolves host modulation in-place', () => {
  // A chladni guide is a real field producer (fieldForLayer → ScalarField); its
  // map targets the grid host on channel 'warp'.
  const warpGuide = (targetId = 'host-1') => ({
    id: 'guide-1',
    patternType: 'chladni',
    params: { m: 2, n: 1 },
    modulator: { maps: [{ targetLayerId: targetId, channel: 'warp', amount: 1 }] },
  });

  it('folds the host warp modulation into hostParams.modulation (the key the extractor reads)', () => {
    const g = warpGuide();
    const layers = [g, gridHost, motifLayer('host-1')];
    const out = resolveMotifHostParams(layers[2], layers);
    // Byte-for-byte the composition useCanvas uses (probe line 270 / paint 437-439).
    const expected = composeModulationParam(resolveModulationsForTarget(gridHost, layers));
    expect(out.hostParams.modulation).toEqual(expected);
    // The nested shape the extractor's guard inspects: channel + field.
    expect(out.hostParams.modulation.channel).toBe('warp');
    expect(typeof out.hostParams.modulation.field.sampleSigned).toBe('function');
    // Base params still present (the fold enriches, does not replace).
    expect(out.hostParams.cols).toBe(gridHost.params.cols);
  });

  it('surfaces warp to a REAL math extractor: a warped recursive host now refuses straight reconstruction', () => {
    // recursiveAnchors reconstructs from straight math and bails the moment a warp
    // channel is present (semanticAnchors.js). With B, the extractor SEES warp via
    // hostParams.modulation and refuses (→ null); a later slice makes it warp-aware.
    const recHost = { id: 'r', patternType: 'recursive', params: { shape: 'triangle', depth: 3 } };
    const motif = {
      id: 'rm', type: MOTIF_TYPE, patternType: MOTIF_TYPE,
      params: { glyphRef: 'leaf', hostLayerId: 'r', anchorMode: 'semantic' },
    };
    const g = warpGuide('r');

    const straight = resolveMotifHostParams(motif, [recHost, motif]);
    const warped = resolveMotifHostParams(motif, [g, recHost, motif]);

    // Baseline (no guide): extractor sees straight params → emits anchors.
    const straightAnchors = getSemanticAnchors('recursive', straight.hostParams, 800, 600, {});
    expect(Array.isArray(straightAnchors)).toBe(true);
    expect(straightAnchors.length).toBeGreaterThan(0);

    // With the warp guide surfaced in-place, the extractor now detects warp → null.
    const warpedAnchors = getSemanticAnchors('recursive', warped.hostParams, 800, 600, {});
    expect(warpedAnchors).toBeNull();
  });

  it('is order-independent: the guide above vs below the host resolves the same modulation', () => {
    // A single guide produces one source regardless of its array position, so the
    // composite is identical — no dependence on layer (render) order.
    const g = warpGuide();
    const motif = motifLayer('host-1');
    const above = resolveMotifHostParams(motif, [g, gridHost, motif]);
    const below = resolveMotifHostParams(motif, [gridHost, motif, g]);
    expect(above.hostParams.modulation).toEqual(below.hostParams.modulation);
  });

  it('NO-WARP regression: unmodulated hostParams is the SAME reference as host.params (byte-identical)', () => {
    const layers = [gridHost, motifLayer('host-1')];
    const out = resolveMotifHostParams(layers[1], layers);
    // No guide maps → composeModulationParam is undefined → no clone, reference held.
    expect(out.hostParams).toBe(gridHost.params);
    expect(out.hostParams).not.toHaveProperty('modulation');
  });

  it('is pure: does NOT mutate host.params (no modulation key leaks onto the host layer)', () => {
    const g = warpGuide();
    const layers = [g, gridHost, motifLayer('host-1')];
    resolveMotifHostParams(layers[2], layers);
    expect(gridHost.params).not.toHaveProperty('modulation');
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

describe('resolveMotifHostParams — arbitrary-edge host capture (B2)', () => {
  const flowHost = { id: 'fh', patternType: 'flowfield', params: { particleCount: 400 } };
  const edgeMotif = {
    id: 'em',
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    // Motif created with the 'semantic' DEFAULT — resolve must FORCE edge here.
    params: { glyphRef: 'leaf', hostLayerId: 'fh', anchorMode: 'semantic' },
  };
  const hostPaths = [
    { points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], closed: false },
    { points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], closed: true },
  ];

  it('forces anchorMode:edge and forwards captured hostPaths when present', () => {
    const layers = [flowHost, edgeMotif];
    const out = resolveMotifHostParams(edgeMotif, layers, { fh: { hostPaths } });
    expect(out.hostPatternType).toBe('flowfield');
    expect(out.anchorMode).toBe('edge');
    expect(out.hostPaths).toBe(hostPaths);
    // No semantic voronoi fields leak onto an edge host.
    expect(out).not.toHaveProperty('drawnEdges');
    expect(out).not.toHaveProperty('sites');
    expect(out).not.toHaveProperty('drawnCells');
  });

  it('still forces anchorMode:edge but omits hostPaths when the host has not been probed', () => {
    const layers = [flowHost, edgeMotif];
    const out = resolveMotifHostParams(edgeMotif, layers, {});
    expect(out.anchorMode).toBe('edge');
    expect(out).not.toHaveProperty('hostPaths');
  });

  it('omits hostPaths when hostGeometry arg is omitted entirely (2-arg call)', () => {
    const layers = [flowHost, edgeMotif];
    const out = resolveMotifHostParams(edgeMotif, layers);
    expect(out.anchorMode).toBe('edge');
    expect(out).not.toHaveProperty('hostPaths');
  });

  it('does not treat an unknown / non-host patternType as an edge host', () => {
    const textHost = { id: 'th', patternType: 'text', params: {} };
    const m = {
      id: 'm3',
      type: MOTIF_TYPE,
      patternType: MOTIF_TYPE,
      params: { glyphRef: 'leaf', hostLayerId: 'th', anchorMode: 'edge' },
    };
    const layers = [textHost, m];
    const out = resolveMotifHostParams(m, layers, { th: { hostPaths } });
    // text is neither semantic nor edge → no forced anchorMode, no hostPaths.
    expect(out).toEqual({ hostPatternType: 'text', hostParams: textHost.params });
  });
});

describe('resolveMotifHostParams — single-axis grid routes to edge capture', () => {
  const hostPaths = [{ points: [{ x: 0, y: -100 }, { x: 0, y: 100 }], closed: false }];
  const motifOn = (hostId) => ({
    id: 'm',
    type: MOTIF_TYPE,
    patternType: MOTIF_TYPE,
    // Created with the semantic default (as a grid motif is) — resolve must FORCE edge.
    params: { glyphRef: 'leaf', hostLayerId: hostId, anchorMode: 'semantic' },
  });

  it('forces anchorMode:edge + forwards hostPaths for a columns-only grid', () => {
    const host = { id: 'g', patternType: 'grid', params: { cols: 8, rows: 6, drawHorizontal: 0 } };
    const m = motifOn('g');
    const out = resolveMotifHostParams(m, [host, m], { g: { hostPaths } });
    expect(out.anchorMode).toBe('edge');
    expect(out.hostPaths).toBe(hostPaths);
  });

  it('stays SEMANTIC (no forced edge, no hostPaths) for a two-axis grid', () => {
    const host = { id: 'g', patternType: 'grid', params: { cols: 8, rows: 6 } }; // both axes
    const m = motifOn('g');
    const out = resolveMotifHostParams(m, [host, m], { g: { hostPaths } });
    expect(out).not.toHaveProperty('anchorMode');
    expect(out).not.toHaveProperty('hostPaths');
    // Semantic grid still threads its host seed for the lattice replay.
    expect(out.hostPatternType).toBe('grid');
  });
});
