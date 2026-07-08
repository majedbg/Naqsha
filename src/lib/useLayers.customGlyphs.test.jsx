// @vitest-environment jsdom
// WI-3 — per-document custom-glyph store. useLayers owns the `customGlyphs` map
// (the document-level asset motif layers reference by `glyphRef`), alongside
// `layers`/`panels`. These tests prove the OBSERVABLE store contract: an empty
// default map, additive `addCustomGlyph` with a stable unique id, a bulk
// `setCustomGlyphs` (the restore/load seam), and localStorage round-trip.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';

const GLYPHS_KEY = 'sonoform-custom-glyphs';

const sampleGlyph = () => ({
  name: 'Imported Flower',
  tradition: 'imported',
  paths: [{ d: 'M0,-5 L5,0 L0,5 L-5,0 Z', closed: true }],
  viewRadius: 5,
  root: { x: 0, y: 0, angle: 0 },
});

describe('useLayers — custom-glyph store (WI-3)', () => {
  beforeEach(() => localStorage.clear());

  it('exposes customGlyphs (empty map), addCustomGlyph and setCustomGlyphs', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    expect(result.current.customGlyphs).toEqual({});
    expect(typeof result.current.addCustomGlyph).toBe('function');
    expect(typeof result.current.setCustomGlyphs).toBe('function');
  });

  it('addCustomGlyph stores the glyph under a stable unique id and returns it', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    let id;
    act(() => { id = result.current.addCustomGlyph(sampleGlyph()); });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(result.current.customGlyphs[id]).toBeDefined();
    expect(result.current.customGlyphs[id].name).toBe('Imported Flower');
    // The stored glyph carries its own id, mirroring built-ins.
    expect(result.current.customGlyphs[id].id).toBe(id);
  });

  it('addCustomGlyph twice yields two distinct ids (no collision)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    let a, b;
    act(() => { a = result.current.addCustomGlyph(sampleGlyph()); });
    act(() => { b = result.current.addCustomGlyph(sampleGlyph()); });
    expect(a).not.toBe(b);
    expect(Object.keys(result.current.customGlyphs).length).toBe(2);
  });

  it('setCustomGlyphs REPLACES the whole map (bulk restore/load seam)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => { result.current.addCustomGlyph(sampleGlyph()); });
    act(() => { result.current.setCustomGlyphs({ cgX: { id: 'cgX', ...sampleGlyph() } }); });
    expect(Object.keys(result.current.customGlyphs)).toEqual(['cgX']);
  });

  it('setCustomGlyphs({}) clears the map (cross-document reset)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => { result.current.addCustomGlyph(sampleGlyph()); });
    act(() => { result.current.setCustomGlyphs({}); });
    expect(result.current.customGlyphs).toEqual({});
  });

  it('persists customGlyphs to localStorage and reloads them on the next mount', async () => {
    const { result, unmount } = renderHook(() => useLayers({ persistToLocal: true }));
    let id;
    act(() => { id = result.current.addCustomGlyph(sampleGlyph()); });
    // The debounced writer flushes after ~3s; assert the key round-trips.
    await new Promise((r) => setTimeout(r, 3100));
    const raw = localStorage.getItem(GLYPHS_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw)[id].name).toBe('Imported Flower');
    unmount();

    const { result: result2 } = renderHook(() => useLayers({ persistToLocal: true }));
    expect(result2.current.customGlyphs[id]).toBeDefined();
    expect(result2.current.customGlyphs[id].name).toBe('Imported Flower');
  }, 8000);

  it('guest (persistToLocal:false) never writes the custom-glyphs key', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => { result.current.addCustomGlyph(sampleGlyph()); });
    expect(localStorage.getItem(GLYPHS_KEY)).toBeNull();
  });
});

describe('useLayers — custom-glyph mutators (WI-P2-1b)', () => {
  beforeEach(() => localStorage.clear());

  it('exposes updateCustomGlyph and deleteCustomGlyph', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    expect(typeof result.current.updateCustomGlyph).toBe('function');
    expect(typeof result.current.deleteCustomGlyph).toBe('function');
  });

  it('updateCustomGlyph replaces the glyph at an existing id (re-stamping id)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    let id;
    act(() => { id = result.current.addCustomGlyph(sampleGlyph()); });
    act(() => {
      result.current.updateCustomGlyph(id, {
        name: 'Edited Flower',
        tradition: 'edited',
        paths: [{ d: 'M0,0 L1,1 Z', closed: false }],
        viewRadius: 9,
      });
    });
    expect(Object.keys(result.current.customGlyphs)).toEqual([id]);
    expect(result.current.customGlyphs[id].name).toBe('Edited Flower');
    expect(result.current.customGlyphs[id].tradition).toBe('edited');
    expect(result.current.customGlyphs[id].viewRadius).toBe(9);
    // The store always carries its own id, even after an overwrite.
    expect(result.current.customGlyphs[id].id).toBe(id);
  });

  it('updateCustomGlyph on a BUILT-IN id is a no-op (no key added, map unchanged)', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => { result.current.updateCustomGlyph('leaf', sampleGlyph()); });
    expect(result.current.customGlyphs).toEqual({});
    expect(result.current.customGlyphs.leaf).toBeUndefined();
  });

  it('deleteCustomGlyph removes an existing custom id', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    let a, b;
    act(() => { a = result.current.addCustomGlyph(sampleGlyph()); });
    act(() => { b = result.current.addCustomGlyph(sampleGlyph()); });
    act(() => { result.current.deleteCustomGlyph(a); });
    expect(result.current.customGlyphs[a]).toBeUndefined();
    expect(result.current.customGlyphs[b]).toBeDefined();
    expect(Object.keys(result.current.customGlyphs)).toEqual([b]);
  });

  it('deleteCustomGlyph of an absent id is a harmless no-op', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    let id;
    act(() => { id = result.current.addCustomGlyph(sampleGlyph()); });
    act(() => { result.current.deleteCustomGlyph('cg-does-not-exist'); });
    expect(Object.keys(result.current.customGlyphs)).toEqual([id]);
  });

  it('records a structural undo entry once per add/update/delete', () => {
    const spy = vi.fn();
    const { result } = renderHook(() =>
      useLayers({ recordStructural: spy, persistToLocal: false })
    );
    let id;
    act(() => { id = result.current.addCustomGlyph(sampleGlyph()); });
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => { result.current.updateCustomGlyph(id, sampleGlyph()); });
    expect(spy).toHaveBeenCalledTimes(2);
    act(() => { result.current.deleteCustomGlyph(id); });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('does NOT record for a built-in-id update or an absent-id delete no-op', () => {
    const spy = vi.fn();
    const { result } = renderHook(() =>
      useLayers({ recordStructural: spy, persistToLocal: false })
    );
    act(() => { result.current.updateCustomGlyph('leaf', sampleGlyph()); });
    act(() => { result.current.deleteCustomGlyph('cg-absent'); });
    expect(spy).not.toHaveBeenCalled();
  });
});
