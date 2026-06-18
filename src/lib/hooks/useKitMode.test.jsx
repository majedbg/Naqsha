// Interaction tests for the reversible kit mode (issue #18, Lane C / C9).
//
// useKitMode owns the enter/exit lifecycle: on enter it snapshots the prior
// theme + bed, applies the kit's theme skin + a kit bed; on exit it restores the
// snapshot exactly. It is the single seam Studio drives so the reversible-mode
// behavior is unit-testable without rendering the whole Studio.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useKitMode from './useKitMode.js';
import { ITP_CAMP_KIT_ID, getKit } from '../../kits/kitRegistry.js';

function makeHarness(initial = {}) {
  const state = {
    theme: initial.theme ?? 'light',
    bed: initial.bed ?? { width: 508, height: 305, unit: 'mm' },
  };
  const setTheme = vi.fn((t) => { state.theme = t; });
  const setBed = vi.fn((b) => { state.bed = b; });
  return { state, setTheme, setBed };
}

describe('useKitMode — reversible enter/exit', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('enter applies the kit theme + a kit bed; exit restores the prior theme + bed', () => {
    // The LIVE DOM theme is the source of truth — a menu-set dark that the
    // passed `theme` prop never caught up to must still be restored on exit. Set
    // the DOM to dark but pass a STALE 'light' prop to prove the hook reads the DOM.
    document.documentElement.setAttribute('data-theme', 'dark');
    const h = makeHarness({ theme: 'light', bed: { width: 200, height: 300, unit: 'mm' } });
    // setTheme also writes the DOM, mirroring the real useTheme.setTheme.
    h.setTheme.mockImplementation((t) => {
      h.state.theme = t;
      document.documentElement.setAttribute('data-theme', t);
    });
    const { result } = renderHook(() =>
      useKitMode({
        kitId: ITP_CAMP_KIT_ID,
        theme: h.state.theme,
        bed: h.state.bed,
        setTheme: h.setTheme,
        setBed: h.setBed,
      })
    );

    expect(result.current.active).toBe(false);

    act(() => result.current.enter());
    // Theme skin applied (named third theme).
    expect(h.setTheme).toHaveBeenLastCalledWith('itp-camp');
    // A kit bed was applied.
    expect(h.setBed).toHaveBeenCalled();
    const appliedBed = h.setBed.mock.calls[0][0];
    expect(appliedBed.width).toBeCloseTo(304.8, 1);
    expect(appliedBed.height).toBeCloseTo(609.6, 1);
    expect(result.current.active).toBe(true);

    act(() => result.current.exit());
    // Prior theme restored VERBATIM (dark, not light).
    expect(h.setTheme).toHaveBeenLastCalledWith('dark');
    // Prior (user-customized) bed restored verbatim — not a profile default.
    expect(h.setBed).toHaveBeenLastCalledWith({ width: 200, height: 300, unit: 'mm' });
    expect(result.current.active).toBe(false);
  });

  it('exposes the kit bed presets while active for Document Setup to surface', () => {
    const h = makeHarness();
    const { result } = renderHook(() =>
      useKitMode({
        kitId: ITP_CAMP_KIT_ID,
        theme: h.state.theme,
        bed: h.state.bed,
        setTheme: h.setTheme,
        setBed: h.setBed,
      })
    );
    const kit = getKit(ITP_CAMP_KIT_ID);
    act(() => result.current.enter());
    expect(result.current.bedPresets).toHaveLength(kit.bedPresets.length);
    act(() => result.current.exit());
    // No leftover state — presets are empty when inactive.
    expect(result.current.bedPresets).toEqual([]);
  });
});
