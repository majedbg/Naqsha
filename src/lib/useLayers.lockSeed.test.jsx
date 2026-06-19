// @vitest-environment jsdom
//
// Two behaviors added alongside full lock enforcement:
//
//   1. SEEDLESS reseed fallback — patterns whose generate() ignores the seed
//      (spirograph, recursive, feather, moire) can't change on a reseed, so
//      randomizeLayer / randomizeAll fall back to randomizing the layer's CHECKED
//      params for them. Seed-using patterns (flowfield) keep reseed-only behavior
//      and leave params untouched.
//
//   2. Locked layers are protected from bulk randomize — randomizeAll and
//      randomizeAllParams skip any layer with `locked: true`.
//
// Math.random is stubbed so randomValueForDef is deterministic: with random()=0,
// a [min..max] step-1 param resolves to `min`.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers';

function setup() {
  return renderHook(() => useLayers({ persistToLocal: false, maxLayers: 6 }));
}

// Add a layer of `type`, then set its params + checked keys (+ optional lock).
// Returns the new layer's id.
function addConfigured(result, type, patch) {
  act(() => result.current.addLayer(type));
  const id = result.current.layers[result.current.layers.length - 1].id;
  act(() => result.current.updateLayer(id, patch));
  return id;
}

afterEach(() => vi.restoreAllMocks());

describe('useLayers — seedless reseed fallback', () => {
  it('randomizeLayer on a SEEDLESS pattern (spirograph) re-rolls the checked params', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // → revolutions resolves to its min (1)
    const { result } = setup();
    const id = addConfigured(result, 'spirograph', {
      params: { revolutions: 40 },
      randomizeKeys: ['revolutions'],
    });

    act(() => result.current.randomizeLayer(id));

    const layer = result.current.layers.find((l) => l.id === id);
    // revolutions min is 1 → with random()=0 it must have re-rolled 40 → 1.
    expect(layer.params.revolutions).toBe(1);
  });

  it('randomizeLayer on a SEED-USING pattern (flowfield) leaves params untouched', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = setup();
    const id = addConfigured(result, 'flowfield', {
      params: { particleCount: 500 },
      randomizeKeys: ['particleCount'],
    });

    act(() => result.current.randomizeLayer(id));

    const layer = result.current.layers.find((l) => l.id === id);
    // Seed-using pattern: the die reseeds only — checked params are NOT re-rolled.
    expect(layer.params.particleCount).toBe(500);
  });
});

describe('useLayers — locked layers are protected from bulk randomize', () => {
  it('randomizeAll skips locked layers (params + seed preserved), randomizes unlocked', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = setup();
    const lockedId = addConfigured(result, 'spirograph', {
      params: { revolutions: 40 },
      randomizeKeys: ['revolutions'],
      locked: true,
    });
    const freeId = addConfigured(result, 'spirograph', {
      params: { revolutions: 40 },
      randomizeKeys: ['revolutions'],
    });

    act(() => result.current.randomizeAll());

    const locked = result.current.layers.find((l) => l.id === lockedId);
    const free = result.current.layers.find((l) => l.id === freeId);
    expect(locked.params.revolutions).toBe(40); // untouched — locked
    expect(free.params.revolutions).toBe(1); // re-rolled — unlocked seedless fallback
  });

  it('randomizeAllParams skips locked layers', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = setup();
    const lockedId = addConfigured(result, 'flowfield', {
      params: { particleCount: 500 },
      randomizeKeys: ['particleCount'],
      locked: true,
    });
    const freeId = addConfigured(result, 'flowfield', {
      params: { particleCount: 500 },
      randomizeKeys: ['particleCount'],
    });

    act(() => result.current.randomizeAllParams());

    const locked = result.current.layers.find((l) => l.id === lockedId);
    const free = result.current.layers.find((l) => l.id === freeId);
    expect(locked.params.particleCount).toBe(500); // untouched — locked
    expect(free.params.particleCount).toBe(100); // re-rolled to its min (100) — unlocked
  });
});
