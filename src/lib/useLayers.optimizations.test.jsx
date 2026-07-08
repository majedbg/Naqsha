// @vitest-environment jsdom
//
// Run Plan applied-Optimization RELOAD survival (PRD #73, ADR 0002). Applied
// optimize values were bare useState: they vanished on an F5 and silently changed
// what export produced. They now ride the SAME local document useLayers persists
// (a sibling `sonoform-optimizations` key), written on the shared debounce and
// read back at mount so the owner (Studio) can hydrate the optimize hook. Old
// documents / guests carry none → the hydrate seam migrates to "none applied".

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useLayers from "./useLayers";

// The applied-only snapshot useOptimizations.serializedOptimizations produces.
function makeApplied() {
  return {
    simplify: { enabled: true, appliedTolerance: 0.42 },
    merge: { enabled: false, appliedTolerance: null },
    reorder: { enabled: true },
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("useLayers — applied-Optimization reload survival", () => {
  it("persists the applied optimizations to localStorage on the shared debounce", () => {
    vi.useFakeTimers();
    const applied = makeApplied();
    renderHook(() =>
      useLayers({ persistToLocal: true, optimizations: applied })
    );
    // Debounced writer (3s) — advance past it, then the sibling key is written.
    vi.advanceTimersByTime(3000);
    expect(JSON.parse(localStorage.getItem("sonoform-optimizations"))).toEqual(applied);
    vi.useRealTimers();
  });

  it("restores the applied optimizations from localStorage at mount", () => {
    const applied = makeApplied();
    localStorage.setItem("sonoform-optimizations", JSON.stringify(applied));
    const { result } = renderHook(() =>
      useLayers({ persistToLocal: true, optimizations: applied })
    );
    // Exposed so Studio can hydrate the optimize hook on mount (survives F5).
    expect(result.current.initialOptimizations).toEqual(applied);
  });

  it("an old document with no stored field restores undefined → 'none applied' migration", () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: true }));
    expect(result.current.initialOptimizations).toBeUndefined();
  });

  it("a guest (persistToLocal false) holds no restored optimizations and writes none", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useLayers({ persistToLocal: false, optimizations: makeApplied() })
    );
    expect(result.current.initialOptimizations).toBeUndefined();
    vi.advanceTimersByTime(3000);
    expect(localStorage.getItem("sonoform-optimizations")).toBeNull();
    vi.useRealTimers();
  });
});
