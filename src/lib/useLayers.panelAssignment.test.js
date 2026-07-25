// Regression guard for the orphaned-layer bug CLASS (#122). A layer added
// mid-session must be born on a REAL panel, not `panelId: null`. A null-panel
// layer still draws on the 2D canvas (effectiveVisible falls back to no-panel)
// but is dropped by the per-panel 3D preview filter (`layersForPanel`), so it
// silently vanishes from 3D until a document reload re-normalizes it.
//
// `addLayer` was already fixed (resolves firstPanel(panels)); its four sibling
// factories — addImportedLayer / addTextLayer / addEtchLayer / addMotifLayer —
// were not. This file locks the whole class.

// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers.js';
import { createPanel, firstPanel } from './panels.js';

const VALID_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><path d="M10,10 L90,90 Z"/></svg>';
const ETCH_SOURCE = 'data:image/png;base64,iVBORw0KGgoAAAANS';

describe('useLayers — mid-session adds land on a real panel (#122 orphan-bug class)', () => {
  it('addImportedLayer assigns the first panel, never null', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const expected = result.current.layers[0].panelId; // seed layer's (first) panel
    expect(expected).not.toBeNull();

    act(() => {
      result.current.addImportedLayer(VALID_SVG);
    });

    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.type).toBe('import');
    expect(newest.panelId).toBe(expected);
  });

  it('addTextLayer assigns the first panel, never null', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const expected = result.current.layers[0].panelId;

    act(() => {
      result.current.addTextLayer({ text: 'hi' });
    });

    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.type).toBe('text');
    expect(newest.panelId).toBe(expected);
  });

  it('addEtchLayer assigns the first panel, never null', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    const expected = result.current.layers[0].panelId;

    act(() => {
      result.current.addEtchLayer({ source: ETCH_SOURCE, sourceWidth: 8, sourceHeight: 8 });
    });

    const newest = result.current.layers[result.current.layers.length - 1];
    expect(newest.panelId).not.toBeNull();
    expect(newest.panelId).toBe(expected);
  });

  // A motif adorns a specific host; it must land on the HOST's panel, not merely
  // the first panel — otherwise, in a multi-panel document, the motif renders in
  // a different 3D panel than the pattern it decorates (reintroducing the split).
  it('addMotifLayer inherits its HOST panel, not just the first panel', () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));

    // Add a second panel (higher order) and place a host pattern on it.
    const p2 = createPanel(5);
    act(() => {
      result.current.setPanels([...result.current.panels, p2]);
    });
    act(() => {
      result.current.addLayer('grid', { panelId: p2.id });
    });
    const host = result.current.layers[result.current.layers.length - 1];
    expect(host.panelId).toBe(p2.id);
    // The first panel is the seed (order 0), distinct from p2 — so equality with
    // p2 below can ONLY come from host inheritance, not a firstPanel fallback.
    expect(firstPanel(result.current.panels).id).not.toBe(p2.id);

    let ret;
    act(() => {
      ret = result.current.addMotifLayer(host.id, { glyphRef: 'leaf' });
    });

    const motif = result.current.layers.find((l) => l.id === ret.id);
    expect(motif.type).toBe('motif');
    expect(motif.panelId).toBe(p2.id);
  });
});
