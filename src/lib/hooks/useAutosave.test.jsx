// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import useAutosave from "./useAutosave";

function baseProps(overrides = {}) {
  return {
    enabled: true,
    hasDesignId: true,
    isDirty: () => true,
    save: vi.fn(() => Promise.resolve()),
    debounceMs: 2500,
    ...overrides,
  };
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("autosaves once after debounceMs when enabled, hasDesignId, and dirty", () => {
    const save = vi.fn(() => Promise.resolve());
    renderHook(() => useAutosave(baseProps({ save })));

    expect(save).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("coalesces rapid changes into exactly one save after the quiet period", () => {
    const save = vi.fn(() => Promise.resolve());
    // Each rerender hands a fresh `isDirty` identity, simulating an edit that
    // re-triggers scheduling (mirrors layers/bgColor changing in the real app).
    const { rerender } = renderHook((p) => useAutosave(p), {
      initialProps: baseProps({ save, isDirty: () => true }),
    });

    for (let i = 0; i < 5; i++) {
      act(() => {
        rerender(baseProps({ save, isDirty: () => true }));
        vi.advanceTimersByTime(500); // each < debounceMs, so the timer keeps resetting
      });
    }
    expect(save).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2500); // quiet period elapses after the last change
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never autosaves while hasDesignId is false, even when dirty", () => {
    const save = vi.fn(() => Promise.resolve());
    const { rerender } = renderHook((p) => useAutosave(p), {
      initialProps: baseProps({ save, hasDesignId: false }),
    });
    act(() => {
      rerender(baseProps({ save, hasDesignId: false, isDirty: () => true }));
      vi.advanceTimersByTime(5000);
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("never autosaves while disabled (guest), even with a design id and dirty", () => {
    const save = vi.fn(() => Promise.resolve());
    const { rerender } = renderHook((p) => useAutosave(p), {
      initialProps: baseProps({ save, enabled: false }),
    });
    act(() => {
      rerender(baseProps({ save, enabled: false, isDirty: () => true }));
      vi.advanceTimersByTime(5000);
    });
    expect(save).not.toHaveBeenCalled();
  });
});
