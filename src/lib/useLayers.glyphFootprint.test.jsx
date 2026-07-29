// @vitest-environment jsdom
// LEGACY CUSTOM GLYPHS GET MEASURED ON LOAD (PR blocker 2).
//
// `footprintCenter` / `footprintRadius` arrived with `importMotif` at `aee1d1a`.
// Every custom glyph imported BEFORE that — sitting in localStorage, in a cloud
// document, in a share link, in an undo snapshot — carries neither, and nothing
// backfilled them. Since #207 a new motif layer is born `sizing.footprint:
// 'tight'`, so pointing one at a legacy glyph made `placementEngine` throw
// (ruling 7d) and `useCanvas`'s per-layer catch turned that into a blank layer.
//
// The store is the load boundary: every seam that puts glyphs into the document
// (mount from localStorage, the bulk restore/document-load setter,
// `resetDocument`, and the two mutators) measures what it is handed, through the
// same `measureFootprint` the importer uses. A glyph that already carries a
// valid measurement is passed through UNTOUCHED — same object identity, so a
// restore does not churn React memos.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';
import { resolvePlacements } from './motif/placementEngine.js';
import { minEnclosingCircle } from './motif/minEnclosingCircle.js';
import { flattenPathD } from './plotter/pathOps.js';

const GLYPHS_KEY = 'sonoform-custom-glyphs';

/** A pre-`aee1d1a` import: no footprintCenter, no footprintRadius. */
const legacyGlyph = (id = 'cg-legacy') => ({
  id,
  name: 'Legacy Vine',
  tradition: 'imported',
  paths: [{ d: 'M4,28 C4,10 14,4 24,4 L34,4 L34,14 L24,14 C14,14 10,20 10,28 Z', closed: true }],
  viewRadius: Math.hypot(30, 24),
  root: { x: 19, y: 28, angle: 0 },
});

/** What the importer would have measured for it. */
function expectedCircle(glyph) {
  const cloud = [];
  for (const p of glyph.paths) for (const [x, y] of flattenPathD(p.d).points) cloud.push({ x, y });
  return minEnclosingCircle(cloud);
}

const BOUNDARY = { type: 'rect', width: 400, height: 300 };
const PAGE = { policy: 'page', useNormal: false, offset: 0, perRole: {} };
const TIGHT = { mode: 'proportional', size: 20, min: 0, margin: 0.85, footprint: 'tight' };
const anchor = (id, x, y) => ({ id, role: 'edge', x, y, tangent: 0, normal: Math.PI / 2, s: 0, meta: {} });
const ROW = [anchor('a', 80, 150), anchor('b', 150, 150)];

const packWith = (glyph) =>
  resolvePlacements(ROW, { orientation: PAGE, sizing: TIGHT }, { boundary: BOUNDARY, glyph });

describe('useLayers — a legacy custom glyph is measured at the load boundary', () => {
  beforeEach(() => localStorage.clear());

  it('mount from localStorage backfills the measurement', () => {
    const g = legacyGlyph();
    localStorage.setItem(GLYPHS_KEY, JSON.stringify({ [g.id]: g }));
    const { result } = renderHook(() => useLayers({ persistToLocal: true }));
    const stored = result.current.customGlyphs[g.id];
    const mec = expectedCircle(g);
    expect(stored.footprintRadius).toBe(mec.r);
    expect(stored.footprintCenter).toEqual({ x: mec.x - g.root.x, y: mec.y - g.root.y });
    expect(() => packWith(stored)).not.toThrow();
  });

  it('the bulk document-load seam backfills too', () => {
    const g = legacyGlyph('cg-doc');
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => result.current.setCustomGlyphs({ [g.id]: g }));
    expect(Number.isFinite(result.current.customGlyphs[g.id].footprintRadius)).toBe(true);
    expect(() => packWith(result.current.customGlyphs[g.id])).not.toThrow();
  });

  it('resetDocument backfills the glyphs it is handed', () => {
    const g = legacyGlyph('cg-reset');
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => result.current.resetDocument([], { [g.id]: g }));
    expect(Number.isFinite(result.current.customGlyphs[g.id].footprintRadius)).toBe(true);
  });

  it('addCustomGlyph and updateCustomGlyph measure what they are given', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    let id;
    const { id: _drop, ...bare } = legacyGlyph();
    act(() => { id = result.current.addCustomGlyph(bare); });
    expect(Number.isFinite(result.current.customGlyphs[id].footprintRadius)).toBe(true);
    act(() => result.current.updateCustomGlyph(id, { ...bare, name: 'Edited' }));
    expect(result.current.customGlyphs[id].name).toBe('Edited');
    expect(Number.isFinite(result.current.customGlyphs[id].footprintRadius)).toBe(true);
  });

  it('an already-measured glyph is passed through by IDENTITY, never re-measured', () => {
    const measured = { ...legacyGlyph('cg-ok'), footprintCenter: { x: 1, y: -2 }, footprintRadius: 7 };
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => result.current.setCustomGlyphs({ 'cg-ok': measured }));
    expect(result.current.customGlyphs['cg-ok']).toBe(measured);
  });

  it('an unmeasurable glyph is left alone — the engine still fails loudly (7d)', () => {
    // No sampleable geometry: nothing to measure, and inventing a circle would
    // be exactly the silent degradation ruling 7d refuses.
    const junk = { id: 'cg-junk', name: 'Junk', tradition: 'imported', paths: [{ d: 'Z', closed: true }], viewRadius: 4, root: { x: 0, y: 0, angle: 0 } };
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    act(() => result.current.setCustomGlyphs({ 'cg-junk': junk }));
    expect(result.current.customGlyphs['cg-junk'].footprintRadius).toBeUndefined();
    expect(() => packWith(result.current.customGlyphs['cg-junk'])).toThrow(/missing a measured footprint/);
  });
});
