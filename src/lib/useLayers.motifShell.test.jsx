// Motif-shell (D) useLayers hardening — the audit 2026-07 bug fixes:
//   bug 1: changeLayerPattern must REFUSE motif layers (a swap corrupted the
//          layer into a half-motif rendering the new pattern with junk params);
//   bug 2: removing a motif HOST must cascade-remove its adorning motifs
//          (orphans render nothing, warn nowhere, and can't be re-homed).
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';

function seedHostWithMotif(result) {
  act(() => {
    result.current.addLayer('grid');
  });
  const host = result.current.layers[result.current.layers.length - 1];
  let ret;
  act(() => {
    ret = result.current.addMotifLayer(host.id, { glyphRef: 'leaf' });
  });
  return { host, motifId: ret.id };
}

describe('changeLayerPattern — motif guard (audit bug 1)', () => {
  it('refuses to swap a motif layer and leaves it untouched', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const { motifId } = seedHostWithMotif(result);

    let ret;
    act(() => {
      ret = result.current.changeLayerPattern(motifId, { patternType: 'grid' });
    });

    expect(ret).toEqual({ ok: false, blocked: false });
    const motif = result.current.layers.find((l) => l.id === motifId);
    expect(motif.type).toBe('motif');
    expect(motif.patternType).toBe('motif');
  });

  it('still swaps ordinary layers', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => {
      result.current.addLayer('grid');
    });
    const layer = result.current.layers[result.current.layers.length - 1];

    let ret;
    act(() => {
      ret = result.current.changeLayerPattern(layer.id, { patternType: 'spiral' });
    });

    expect(ret.ok).toBe(true);
    expect(
      result.current.layers.find((l) => l.id === layer.id).patternType
    ).toBe('spiral');
  });
});

describe('removeLayer — motif-host cascade (audit bug 2)', () => {
  it('removing a host also removes its adorning motif layers', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const { host, motifId } = seedHostWithMotif(result);

    act(() => {
      result.current.removeLayer(host.id);
    });

    const ids = result.current.layers.map((l) => l.id);
    expect(ids).not.toContain(host.id);
    expect(ids).not.toContain(motifId);
  });

  it('removing just the motif leaves the host', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const { host, motifId } = seedHostWithMotif(result);

    act(() => {
      result.current.removeLayer(motifId);
    });

    const ids = result.current.layers.map((l) => l.id);
    expect(ids).toContain(host.id);
    expect(ids).not.toContain(motifId);
  });

  it('respects the min-1 rule on the post-cascade count', () => {
    // Document = exactly [host, motif]; removing the host would empty it.
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    // Shrink to a single seeded layer, use it as host.
    const seed = result.current.layers[0];
    let ret;
    act(() => {
      ret = result.current.addMotifLayer(seed.id, { glyphRef: 'leaf' });
    });
    // Remove every OTHER layer so only [seed, motif] remain.
    const keep = new Set([seed.id, ret.id]);
    for (const l of result.current.layers.filter((x) => !keep.has(x.id))) {
      act(() => {
        result.current.removeLayer(l.id);
      });
    }
    expect(result.current.layers).toHaveLength(2);

    act(() => {
      result.current.removeLayer(seed.id);
    });
    // Cascade would leave 0 layers → refused, both survive.
    expect(result.current.layers).toHaveLength(2);
  });
});
