// @vitest-environment jsdom
// Guest onboarding S1 (D10) — `initialSeedLayers` prop on the SHARED
// useLayers hook. Kept generic (array-or-factory, applies only when there's
// no saved work) so the guest-gating decision lives entirely at the caller
// (Studio.jsx), not inside this shared hook — MobileStudio.jsx (D23) passes
// nothing and must be provably unaffected.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import useLayers, { createLayer } from './useLayers';

const LAYERS_KEY = 'sonoform-layers';

function seedLayer() {
  const layer = createLayer(0, 'phyllotaxis');
  return { ...layer, id: 'seed-layer-1', params: { ...layer.params, angle: 137.5 } };
}

describe('useLayers — initialSeedLayers (guest onboarding S1)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('(a) with initialSeedLayers array and no saved work, uses the seed', () => {
    const seed = [seedLayer()];
    const { result } = renderHook(() => useLayers({ persistToLocal: false, initialSeedLayers: seed }));
    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers[0].id).toBe('seed-layer-1');
    expect(result.current.layers[0].patternType).toBe('phyllotaxis');
    expect(result.current.layers[0].params.angle).toBe(137.5);
  });

  it('(a) with initialSeedLayers as a lazy factory and no saved work, uses the seed', () => {
    const { result } = renderHook(() =>
      useLayers({ persistToLocal: false, initialSeedLayers: () => [seedLayer()] })
    );
    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers[0].id).toBe('seed-layer-1');
  });

  it('(b) with initialSeedLayers BUT existing saved work, keeps the saved work (no clobber)', () => {
    const savedLayer = { ...createLayer(0, 'voronoi'), id: 'saved-layer-1' };
    localStorage.setItem(LAYERS_KEY, JSON.stringify([savedLayer]));

    const seed = [seedLayer()];
    const { result } = renderHook(() => useLayers({ persistToLocal: true, initialSeedLayers: seed }));

    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers[0].id).toBe('saved-layer-1');
    expect(result.current.layers[0].patternType).toBe('voronoi');
  });

  it('(c) without the prop, behaves exactly as before (regression) — persistToLocal:false → single default layer', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers[0].id).not.toBe('seed-layer-1');
  });

  it('(c) without the prop, behaves exactly as before (regression) — persistToLocal:true + no saved work → two default layers', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: true }));
    expect(result.current.layers.length).toBe(2);
  });

  it('an empty seed array is treated as "no seed" (falls through to defaults, never an empty document)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false, initialSeedLayers: [] }));
    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers[0].id).not.toBe('seed-layer-1');
  });

  it('(NIT) with saved work present, the seed factory is never invoked (no wasted work building/discarding a seed doc)', () => {
    const savedLayer = { ...createLayer(0, 'voronoi'), id: 'saved-layer-1' };
    localStorage.setItem(LAYERS_KEY, JSON.stringify([savedLayer]));

    const factory = vi.fn(() => [seedLayer()]);
    const { result } = renderHook(() => useLayers({ persistToLocal: true, initialSeedLayers: factory }));

    expect(factory).not.toHaveBeenCalled();
    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers[0].id).toBe('saved-layer-1');
  });
});
