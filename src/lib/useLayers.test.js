// Unit tests for useLayers.addLayer panel assignment + cap threading (P2).
// Drives the real hook via renderHook (jsdom) with persistToLocal:false so each
// test starts from a clean, localStorage-free seed.

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';

describe('useLayers.addLayer panel assignment', () => {
  it('assigns the new layer to opts.panelId when provided', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));

    act(() => {
      result.current.addLayer('grid', { panelId: 'p2' });
    });

    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.panelId).toBe('p2');
  });

  it('leaves panelId at createLayer default (null) when called with no opts', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));

    act(() => {
      result.current.addLayer('grid');
    });

    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.panelId).toBeNull();
  });

  it('still default-cycles and leaves panelId null when first arg is a non-string (event object)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const before = result.current.layers.length;

    act(() => {
      result.current.addLayer({}); // bare onClick={addLayer} passes an event
    });

    expect(result.current.layers.length).toBe(before + 1);
    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.panelId).toBeNull();
  });

  it('no-ops at the tier cap even when a panelId is supplied', () => {
    // maxLayers:1 → init seeds exactly one layer → already at cap.
    const { result } = renderHook(() => useLayers({ persistToLocal: false, maxLayers: 1 }));
    const before = result.current.layers.length;

    act(() => {
      result.current.addLayer('grid', { panelId: 'p2' });
    });

    expect(result.current.layers.length).toBe(before);
  });
});

describe('useLayers.cap', () => {
  it('exposes the effective tier cap as a number', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false, maxLayers: 4 }));
    expect(result.current.cap).toBe(4);
  });
});
