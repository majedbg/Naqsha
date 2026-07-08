// @vitest-environment jsdom
// WI-3 — per-document custom-glyph store. useLayers owns the `customGlyphs` map
// (the document-level asset motif layers reference by `glyphRef`), alongside
// `layers`/`panels`. These tests prove the OBSERVABLE store contract: an empty
// default map, additive `addCustomGlyph` with a stable unique id, a bulk
// `setCustomGlyphs` (the restore/load seam), and localStorage round-trip.
import { describe, it, expect, beforeEach } from 'vitest';
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
