// Interaction tests for the Etch layer creation + persistence (Raster Etch S1,
// issue #80). Drives the real useLayers hook (no DOM canvas) and asserts that
// creating an Etch adds ONE engrave-role layer carrying the source data-URI +
// DPI, and that the etch layer round-trips through save (localStorage) → load.

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';
import { migrateLayer } from './migration.js';
import { isEtchLayer, DEFAULT_ETCH_DPI } from './etch/etchLayer.js';

const SOURCE = 'data:image/png;base64,iVBORw0KGgoAAAANS';

describe('useLayers.addEtchLayer', () => {
  beforeEach(() => localStorage.clear());

  it('adds exactly one Etch layer: engrave role/operation, source + DPI on params', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const before = result.current.layers.length;

    let outcome;
    act(() => {
      outcome = result.current.addEtchLayer({ source: SOURCE, sourceWidth: 1024, sourceHeight: 768 });
    });

    expect(outcome.ok).toBe(true);
    expect(result.current.layers.length).toBe(before + 1);

    const etch = result.current.layers[result.current.layers.length - 1];
    expect(isEtchLayer(etch)).toBe(true);
    expect(etch.type).toBe('etch');
    expect(etch.role).toBe('engrave');
    expect(etch.operationId).toBe('op-engrave'); // reuses the engrave Operation
    expect(etch.params.source).toBe(SOURCE);
    expect(etch.params.sourceWidth).toBe(1024);
    expect(etch.params.dpi).toBe(DEFAULT_ETCH_DPI);
    expect(typeof etch.id).toBe('string');
  });

  it('honors an explicit DPI', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => {
      result.current.addEtchLayer({ source: SOURCE, dpi: 300 });
    });
    const etch = result.current.layers[result.current.layers.length - 1];
    expect(etch.params.dpi).toBe(300);
  });

  it('persists to localStorage and round-trips through load (save/load AC)', () => {
    // Build the Etch, then write the layer array to the same key the debounced
    // save uses (STORAGE_KEY = 'sonoform-layers') — the exact serialized shape.
    const first = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => {
      first.result.current.addEtchLayer({ source: SOURCE, sourceWidth: 640, sourceHeight: 480, dpi: 254 });
    });
    localStorage.setItem('sonoform-layers', JSON.stringify(first.result.current.layers));
    first.unmount();

    // A fresh hook loads from the same localStorage key — the Etch survives the
    // JSON round-trip and the load-time migrateLayer normalization.
    const second = renderHook(() => useLayers({ persistToLocal: true }));
    const loaded = second.result.current.layers.find((l) => isEtchLayer(l));
    expect(loaded).toBeTruthy();
    expect(loaded.type).toBe('etch');
    expect(loaded.params.source).toBe(SOURCE);
    expect(loaded.params.sourceWidth).toBe(640);
    expect(loaded.params.dpi).toBe(254);
    expect(loaded.operationId).toBe('op-engrave');
  });

  it('migrateLayer passes an etch layer through untouched (type + source preserved)', () => {
    const etch = {
      id: 'e1', type: 'etch', role: 'engrave', operationId: 'op-engrave',
      params: { source: SOURCE, sourceWidth: 10, sourceHeight: 10, dpi: 254 },
    };
    const migrated = migrateLayer(etch, undefined);
    expect(migrated.type).toBe('etch');
    expect(migrated.params.source).toBe(SOURCE);
    expect(migrated.operationId).toBe('op-engrave');
  });
});

describe('useLayers persistence — a quota-throwing layers write does not cascade (FIX 4)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('an oversized Etch source (QuotaExceededError on the layers key) still lets bg/panels/glyphs/opts save + warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const real = Storage.prototype.setItem;
    const writes = [];
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      writes.push(key);
      if (key === 'sonoform-layers') {
        const e = new Error('quota'); e.name = 'QuotaExceededError';
        throw e; // simulate the big Etch data-URI blowing the quota
      }
      return real.call(this, key, value);
    });

    const { result } = renderHook(() => useLayers({ persistToLocal: true }));
    act(() => {
      result.current.addEtchLayer({ source: SOURCE, sourceWidth: 8, sourceHeight: 8 });
    });
    // Fire the 3000ms debounced save.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // The layers write was ATTEMPTED (and threw) but did NOT prevent the rest.
    expect(writes).toContain('sonoform-layers');
    expect(writes).toContain('sonoform-bg-color');
    expect(writes).toContain('sonoform-custom-glyphs');
    expect(writes).toContain('sonoform-optimizations');
    // And it warned rather than failing fully silently.
    expect(warn).toHaveBeenCalled();

    setItemSpy.mockRestore();
    warn.mockRestore();
  });
});
