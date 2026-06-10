// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useOptimizations from "./useOptimizations";

// Characterization tests (AR-3A) pinning the preview-vs-applied state machine.

describe("useOptimizations", () => {
  it("starts with all steps disabled and no applied tolerances", () => {
    const { result } = renderHook(() => useOptimizations());
    const { optimizations, appliedOptimizations, appliedOpsList } =
      result.current;
    expect(optimizations.simplify).toEqual({
      enabled: false,
      tolerance: 0.3,
      appliedTolerance: null,
    });
    expect(appliedOptimizations.simplify).toEqual({
      enabled: false,
      tolerance: 0,
    });
    expect(appliedOpsList).toEqual([]);
  });

  it("preview tolerance never leaks into the applied value until Apply", () => {
    const { result } = renderHook(() => useOptimizations());

    // Move the slider (preview only).
    act(() => result.current.updateOptimization("simplify", { tolerance: 0.9 }));
    expect(result.current.optimizations.simplify.tolerance).toBe(0.9);
    // Applied path is untouched — export would still see tolerance 0, disabled.
    expect(result.current.appliedOptimizations.simplify.enabled).toBe(false);
    expect(result.current.appliedOptimizations.simplify.tolerance).toBe(0);

    // Apply commits the preview tolerance into the applied value.
    act(() => result.current.applyOptimization("simplify"));
    expect(result.current.appliedOptimizations.simplify.enabled).toBe(true);
    expect(result.current.appliedOptimizations.simplify.tolerance).toBe(0.9);
    expect(result.current.appliedOpsList).toContain("simplify(0.9mm)");
  });

  it("revert disables the step and clears its applied tolerance, keeping the preview", () => {
    const { result } = renderHook(() => useOptimizations());
    act(() => result.current.updateOptimization("merge", { tolerance: 0.7 }));
    act(() => result.current.applyOptimization("merge"));
    expect(result.current.appliedOptimizations.merge.tolerance).toBe(0.7);

    act(() => result.current.revertOptimization("merge"));
    expect(result.current.appliedOptimizations.merge.enabled).toBe(false);
    expect(result.current.appliedOptimizations.merge.tolerance).toBe(0);
    // Preview tolerance is preserved for re-apply.
    expect(result.current.optimizations.merge.tolerance).toBe(0.7);
  });

  it("reorder is special-cased: no tolerance, toggles enabled only", () => {
    const { result } = renderHook(() => useOptimizations());
    act(() => result.current.applyOptimization("reorder"));
    expect(result.current.optimizations.reorder).toEqual({ enabled: true });
    expect(result.current.appliedOptimizations.reorder).toEqual({
      enabled: true,
    });
    expect(result.current.appliedOpsList).toContain("reorder");

    act(() => result.current.revertOptimization("reorder"));
    expect(result.current.optimizations.reorder).toEqual({ enabled: false });
  });
});
