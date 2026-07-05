import { describe, it, expect } from 'vitest';
import {
  MOTIF_TYPE,
  isMotifLayer,
  createMotifParams,
  motifHostId,
  motifAutoName,
} from './motifLayer';

// motifLayer.js — schema helpers for the motif layer flat model (mirrors
// useLayers.js createLayer conventions §3 of docs/motif-adorn-arch-brief.md).
// A motif layer is a normal flat layer whose type/patternType is 'motif' and
// whose params carry {glyphRef, hostLayerId, binding, anchorMode, edgeOpts,
// source}. No cascade/cleanup logic lives here — dangling references are
// tolerated and only resolved (or dropped) at adornGraph derivation time.

describe('MOTIF_TYPE', () => {
  it('is the string "motif"', () => {
    expect(MOTIF_TYPE).toBe('motif');
  });
});

describe('isMotifLayer', () => {
  it('is true when layer.type === "motif"', () => {
    expect(isMotifLayer({ type: 'motif' })).toBe(true);
  });

  it('is true when layer.patternType === "motif"', () => {
    expect(isMotifLayer({ patternType: 'motif' })).toBe(true);
  });

  it('is true when BOTH type and patternType are "motif"', () => {
    expect(isMotifLayer({ type: 'motif', patternType: 'motif' })).toBe(true);
  });

  it('is false for a normal pattern layer', () => {
    expect(isMotifLayer({ patternType: 'voronoi' })).toBe(false);
  });

  it('is false for import/text layers', () => {
    expect(isMotifLayer({ type: 'import', patternType: 'import' })).toBe(false);
    expect(isMotifLayer({ type: 'text', patternType: 'text' })).toBe(false);
  });

  it('tolerates null/undefined/empty input without throwing', () => {
    expect(isMotifLayer(null)).toBe(false);
    expect(isMotifLayer(undefined)).toBe(false);
    expect(isMotifLayer({})).toBe(false);
  });
});

describe('createMotifParams', () => {
  it('stores glyphRef, hostLayerId, anchorMode, edgeOpts, source verbatim when provided', () => {
    const params = createMotifParams({
      glyphRef: 'leaf-01',
      hostLayerId: 'layer-3',
      anchorMode: 'crossing',
      edgeOpts: { spacing: 40 },
      source: { kind: 'library', id: 'leaf-01' },
      binding: { selection: { roles: ['crossing'] }, placement: { sizing: { mode: 'fixed' } } },
    });
    expect(params.glyphRef).toBe('leaf-01');
    expect(params.hostLayerId).toBe('layer-3');
    expect(params.anchorMode).toBe('crossing');
    expect(params.edgeOpts).toEqual({ spacing: 40 });
    expect(params.source).toEqual({ kind: 'library', id: 'leaf-01' });
    expect(params.binding).toEqual({
      selection: { roles: ['crossing'] },
      placement: { sizing: { mode: 'fixed' } },
    });
  });

  it('defaults anchorMode to "edge"', () => {
    const params = createMotifParams({ glyphRef: 'leaf-01', hostLayerId: 'layer-1' });
    expect(params.anchorMode).toBe('edge');
  });

  it('defaults edgeOpts to { spacing: 24 } when omitted', () => {
    const params = createMotifParams({ glyphRef: 'leaf-01', hostLayerId: 'layer-1' });
    expect(params.edgeOpts).toEqual({ spacing: 24 });
  });

  it('defaults source to null when omitted', () => {
    const params = createMotifParams({ glyphRef: 'leaf-01', hostLayerId: 'layer-1' });
    expect(params.source).toBeNull();
  });

  it('defaults binding to { selection: {}, placement: {} } when omitted (so placeMotifs uses its own defaults)', () => {
    const params = createMotifParams({ glyphRef: 'leaf-01', hostLayerId: 'layer-1' });
    expect(params.binding).toEqual({ selection: {}, placement: {} });
  });

  it('normalizes a partial binding (missing selection or placement) by filling the missing half with {}', () => {
    const withSelectionOnly = createMotifParams({ binding: { selection: { roles: ['tip'] } } });
    expect(withSelectionOnly.binding).toEqual({ selection: { roles: ['tip'] }, placement: {} });

    const withPlacementOnly = createMotifParams({ binding: { placement: { flip: true } } });
    expect(withPlacementOnly.binding).toEqual({ selection: {}, placement: { flip: true } });
  });

  it('tolerates being called with no argument at all', () => {
    const params = createMotifParams();
    expect(params).toEqual({
      glyphRef: undefined,
      hostLayerId: undefined,
      binding: { selection: {}, placement: {} },
      anchorMode: 'edge',
      edgeOpts: { spacing: 24 },
      source: null,
    });
  });
});

describe('motifHostId', () => {
  it('reads layer.params.hostLayerId', () => {
    expect(motifHostId({ params: { hostLayerId: 'layer-9' } })).toBe('layer-9');
  });

  it('returns null when params is missing', () => {
    expect(motifHostId({})).toBeNull();
  });

  it('returns null when hostLayerId is not set', () => {
    expect(motifHostId({ params: {} })).toBeNull();
  });

  it('returns null for null/undefined layer', () => {
    expect(motifHostId(null)).toBeNull();
    expect(motifHostId(undefined)).toBeNull();
  });
});

describe('motifAutoName', () => {
  it('formats "<glyph name> on <host name>"', () => {
    const host = { name: 'Voronoi 1' };
    const glyph = { name: 'Leaf' };
    expect(motifAutoName(host, glyph)).toBe('Leaf on Voronoi 1');
  });

  it('falls back to "Motif" when glyph is missing', () => {
    const host = { name: 'Voronoi 1' };
    expect(motifAutoName(host, null)).toBe('Motif on Voronoi 1');
    expect(motifAutoName(host, undefined)).toBe('Motif on Voronoi 1');
    expect(motifAutoName(host, {})).toBe('Motif on Voronoi 1');
  });

  it('falls back to "layer" when host is missing', () => {
    const glyph = { name: 'Leaf' };
    expect(motifAutoName(null, glyph)).toBe('Leaf on layer');
    expect(motifAutoName(undefined, glyph)).toBe('Leaf on layer');
    expect(motifAutoName({}, glyph)).toBe('Leaf on layer');
  });

  it('falls back to both defaults when host and glyph are missing', () => {
    expect(motifAutoName(null, null)).toBe('Motif on layer');
  });
});
