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
});
