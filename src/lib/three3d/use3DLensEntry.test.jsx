// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useState, useCallback } from 'react';
import { renderHook, act } from '@testing-library/react';
import { use3DLensEntry } from './use3DLensEntry.js';
import { use3DPreview } from './use3DPreview.js';

// use3DLensEntry (S3) — composes the real sub-mode hook with a colorView-shaped
// object + a captureDesign callback. The enter→exit RESTORATION is load-bearing
// on the dimension that actually changes (the sub-mode round-trip); the
// preservation of the 2D lens is by-construction (colorView is never mutated on
// enter), so we assert the WHOLE combined state round-trips byte-for-byte.

const DESIGN = { layers: [{ id: 'l1', params: { x: 1 } }], panels: [], operations: [], machineProfile: 'laser' };

function useHarness(initial = { mode: 'material', materialId: 'clear' }) {
  const threeD = use3DPreview();
  const [mode, setMode] = useState(initial.mode);
  const [materialId, setMaterialId] = useState(initial.materialId);
  const colorView = { mode, setMode, materialId, setMaterialId };
  const captureDesign = useCallback(() => DESIGN, []);
  const entry = use3DLensEntry({ colorView, threeD, captureDesign });
  return { entry, threeD, subMode: threeD.subMode, mode, materialId };
}

describe('use3DLensEntry', () => {
  it('starts on the 2D lens with no snapshot', () => {
    const { result } = renderHook(() => useHarness());
    expect(result.current.entry.activeLens).toBe('material');
    expect(result.current.subMode).toBe('off');
    expect(result.current.entry.snapshot).toBe(null);
  });

  it('enter3D opens panel-stack, derives lens "3d", and builds a frozen snapshot', () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.entry.enter3D());
    expect(result.current.subMode).toBe('panel-stack');
    expect(result.current.entry.activeLens).toBe('3d');
    expect(result.current.entry.snapshot.machineProfile).toBe('laser');
    expect(Object.isFrozen(result.current.entry.snapshot)).toBe(true);
  });

  it('enter→exit restores the EXACT prior combined state (sub-mode off + 2D lens preserved)', () => {
    const { result } = renderHook(() => useHarness({ mode: 'material', materialId: 'clear' }));
    // before
    expect(result.current.entry.activeLens).toBe('material');
    act(() => result.current.entry.enter3D());
    // during
    expect(result.current.entry.activeLens).toBe('3d');
    act(() => result.current.entry.exit3D());
    // after — sub-mode reverted AND the 2D lens is byte-identical
    expect(result.current.subMode).toBe('off');
    expect(result.current.entry.activeLens).toBe('material');
    expect(result.current.mode).toBe('material');
    expect(result.current.materialId).toBe('clear');
    expect(result.current.entry.snapshot).toBe(null);
  });

  it('rebuild re-snapshots while staying in 3D (new frozen object)', () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.entry.enter3D());
    const first = result.current.entry.snapshot;
    act(() => result.current.entry.rebuild());
    expect(result.current.subMode).toBe('panel-stack');
    expect(result.current.entry.snapshot).not.toBe(first);
    expect(result.current.entry.snapshot).toEqual(first);
  });

  it('selecting a 2D lens while in 3D exits 3D and sets that lens', () => {
    const { result } = renderHook(() => useHarness({ mode: 'material', materialId: 'clear' }));
    act(() => result.current.entry.enter3D());
    act(() => result.current.entry.selectLens('operation'));
    expect(result.current.subMode).toBe('off');
    expect(result.current.mode).toBe('operation');
    expect(result.current.entry.activeLens).toBe('operation');
  });

  it('exit3D closes Surface B (height-surface) and restores the prior 2D lens', () => {
    // Surface B is launched via threeD.openHeightSurface (NOT enter3D), so the
    // close button / Inspector "Close preview" must route through exit3D and
    // still cleanly return to sub-mode 'off' with the underlying 2D lens intact.
    const { result } = renderHook(() => useHarness({ mode: 'material', materialId: 'clear' }));
    act(() => result.current.threeD.openHeightSurface('guide-1'));
    expect(result.current.subMode).toBe('height-surface');
    expect(result.current.threeD.focusFieldLayerId).toBe('guide-1');

    act(() => result.current.entry.exit3D());
    expect(result.current.subMode).toBe('off');
    expect(result.current.threeD.focusFieldLayerId).toBe(null);
    // Prior 2D lens preserved by construction (colorView never mutated).
    expect(result.current.entry.activeLens).toBe('material');
    expect(result.current.entry.snapshot).toBe(null);
  });

  it('selectLens("3d") enters Surface A', () => {
    const { result } = renderHook(() => useHarness());
    act(() => result.current.entry.selectLens('3d'));
    expect(result.current.subMode).toBe('panel-stack');
    expect(result.current.entry.activeLens).toBe('3d');
  });
});
