// @vitest-environment jsdom
// WI-1 Naqsha Panels: useLayers gains panel state, load-time normalization, and
// persistence to `sonoform-panels`. These tests prove the OBSERVABLE contract:
// every layer is born with a panelId field, an auto-seeded Panel 1 absorbs
// pre-panel saved work, valid stored panels pass through, and panels round-trip.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';
import { PANELS_STORAGE_KEY } from './panels.js';

const LAYERS_KEY = 'sonoform-layers';

describe('useLayers — panels (WI-1)', () => {
  beforeEach(() => localStorage.clear());

  it('every freshly-created layer carries a panelId field', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    expect(result.current.layers.every((l) => 'panelId' in l)).toBe(true);
  });

  it('layers from addLayer / addImportedLayer / addTextLayer all carry panelId (no layer born without the field)', () => {
    const VALID_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,90 Z"/></svg>';
    const { result } = renderHook(() => useLayers({ persistToLocal: false, maxLayers: 6 }));

    act(() => result.current.addLayer());
    act(() => result.current.addImportedLayer(VALID_SVG));
    act(() => result.current.addTextLayer({ text: 'hi' }));

    // Every layer — including the three just added via distinct construction
    // paths — has the panelId field.
    expect(result.current.layers.every((l) => 'panelId' in l)).toBe(true);
    const imported = result.current.layers.find((l) => l.type === 'import');
    const text = result.current.layers.find((l) => l.type === 'text');
    expect('panelId' in imported).toBe(true);
    expect('panelId' in text).toBe(true);
  });

  it('exposes panels and setPanels in the returned object', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    expect(Array.isArray(result.current.panels)).toBe(true);
    expect(typeof result.current.setPanels).toBe('function');
  });

  it('non-persisted mount: seeds exactly one Panel 1 (acrylic) and assigns every layer to it', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    expect(result.current.panels.length).toBe(1);
    expect(result.current.panels[0].name).toBe('Panel 1');
    expect(result.current.panels[0].substrate.kind).toBe('acrylic');
    const seedId = result.current.panels[0].id;
    expect(result.current.layers.every((l) => l.panelId === seedId)).toBe(true);
  });

  it('persisted mount with NO sonoform-panels + saved layers lacking panelId: seeds Panel 1 and assigns all layers to it', () => {
    // Saved layers from before the panels feature — no panelId at all.
    const savedLayers = [
      { id: 'layer-1-aaaaaa', patternType: 'wave', visible: true, params: {} },
      { id: 'layer-2-bbbbbb', patternType: 'spirograph', visible: true, params: {} },
    ];
    localStorage.setItem(LAYERS_KEY, JSON.stringify(savedLayers));
    // No sonoform-panels key.

    const { result } = renderHook(() => useLayers({ persistToLocal: true }));

    expect(result.current.panels.length).toBe(1);
    expect(result.current.panels[0].name).toBe('Panel 1');
    const seedId = result.current.panels[0].id;
    expect(result.current.layers.length).toBe(2);
    expect(result.current.layers.every((l) => l.panelId === seedId)).toBe(true);
  });

  it('persisted mount with valid sonoform-panels matching the layers: passes through unchanged', () => {
    const panel = {
      id: 'panel-1-keepme',
      name: 'My Panel',
      substrate: { kind: 'plywood', thickness: 3, color: '#cccccc' },
      visible: true,
      order: 0,
    };
    const savedLayers = [
      { id: 'layer-1-aaaaaa', patternType: 'wave', visible: true, params: {}, panelId: panel.id },
    ];
    localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify([panel]));
    localStorage.setItem(LAYERS_KEY, JSON.stringify(savedLayers));

    const { result } = renderHook(() => useLayers({ persistToLocal: true }));

    expect(result.current.panels).toEqual([panel]);
    expect(result.current.layers[0].panelId).toBe(panel.id);
  });

  it('sonoform-panels round-trips: changing panels persists, reload yields the same panels', () => {
    vi.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() => useLayers({ persistToLocal: true }));
      const nextPanels = [
        { id: 'panel-1-rt', name: 'RT', substrate: { kind: 'mdf', thickness: 6, color: '#cccccc' }, visible: true, order: 0 },
      ];
      act(() => result.current.setPanels(nextPanels));
      // Flush the 500ms debounced persistence effect.
      act(() => vi.advanceTimersByTime(600));
      unmount();

      expect(JSON.parse(localStorage.getItem(PANELS_STORAGE_KEY))).toEqual(nextPanels);

      const { result: reloaded } = renderHook(() => useLayers({ persistToLocal: true }));
      expect(reloaded.current.panels).toEqual(nextPanels);
    } finally {
      vi.useRealTimers();
    }
  });
});
