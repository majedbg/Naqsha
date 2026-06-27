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
});
