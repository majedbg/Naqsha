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
    // Reset the jsdom visibility override between tests.
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  function setHidden() {
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
  }

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

  it("fires the LATEST save (not a stale closure) and consults post-change isDirty", () => {
    let state = "before";
    const saveOld = vi.fn(() => Promise.resolve());

    const { rerender } = renderHook((p) => useAutosave(p), {
      initialProps: baseProps({ save: saveOld, isDirty: () => true }),
    });

    // State changes; a new save captures the CURRENT state when it runs, and a
    // fresh isDirty (spy) replaces the old one — all before the timer fires.
    state = "after";
    let captured = null;
    const saveNew = vi.fn(() => {
      captured = state;
      return Promise.resolve();
    });
    const latestIsDirty = vi.fn(() => true);

    // Commit the edit first (flushes effects → refs adopt saveNew/latestIsDirty
    // and reschedule), THEN let the quiet period elapse.
    act(() => {
      rerender(baseProps({ save: saveNew, isDirty: latestIsDirty }));
    });
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(saveOld).not.toHaveBeenCalled();
    expect(saveNew).toHaveBeenCalledTimes(1);
    expect(captured).toBe("after"); // saw post-change state
    expect(latestIsDirty).toHaveBeenCalled(); // current isDirty gated the save
  });

  it("flushes an immediate save on visibilitychange→hidden when dirty", () => {
    const save = vi.fn(() => Promise.resolve());
    renderHook(() => useAutosave(baseProps({ save, isDirty: () => true })));
    act(() => {
      setHidden();
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(save).toHaveBeenCalledTimes(1); // immediate, no debounce wait
  });

  it("flushes an immediate save on window blur when dirty", () => {
    const save = vi.fn(() => Promise.resolve());
    renderHook(() => useAutosave(baseProps({ save, isDirty: () => true })));
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes an immediate save on beforeunload when dirty", () => {
    const save = vi.fn(() => Promise.resolve());
    renderHook(() => useAutosave(baseProps({ save, isDirty: () => true })));
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("does NOT flush on blur / hidden when clean", () => {
    const save = vi.fn(() => Promise.resolve());
    renderHook(() => useAutosave(baseProps({ save, isDirty: () => false })));
    act(() => {
      window.dispatchEvent(new Event("blur"));
      setHidden();
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("ignores visibilitychange while still visible", () => {
    const save = vi.fn(() => Promise.resolve());
    renderHook(() => useAutosave(baseProps({ save, isDirty: () => true })));
    act(() => {
      // visibilityState stays 'visible' (default) — a tab-show, not a hide.
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(save).not.toHaveBeenCalled();
  });
});
