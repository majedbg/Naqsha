// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import usePatternPicker, { PICKER_VIEW_STORAGE_KEY } from "./usePatternPicker";

beforeEach(() => {
  localStorage.clear();
});

describe("usePatternPicker — view persistence", () => {
  it("defaults view to 'grid' when storage is empty", () => {
    const { result } = renderHook(() =>
      usePatternPicker({ open: false, familyKeys: [] }),
    );
    expect(result.current.view).toBe("grid");
  });

  it("reads a persisted 'map' view from storage", () => {
    localStorage.setItem(PICKER_VIEW_STORAGE_KEY, "map");
    const { result } = renderHook(() =>
      usePatternPicker({ open: false, familyKeys: [] }),
    );
    expect(result.current.view).toBe("map");
  });

  it("ignores an invalid persisted value and falls back to 'grid'", () => {
    localStorage.setItem(PICKER_VIEW_STORAGE_KEY, "bogus");
    const { result } = renderHook(() =>
      usePatternPicker({ open: false, familyKeys: [] }),
    );
    expect(result.current.view).toBe("grid");
  });

  it("setView('map') updates the view AND writes it to localStorage", () => {
    const { result } = renderHook(() =>
      usePatternPicker({ open: false, familyKeys: [] }),
    );
    act(() => result.current.setView("map"));
    expect(result.current.view).toBe("map");
    expect(localStorage.getItem(PICKER_VIEW_STORAGE_KEY)).toBe("map");
  });
});

describe("usePatternPicker — family filter", () => {
  it("isOn defaults true for any key", () => {
    const { result } = renderHook(() =>
      usePatternPicker({ open: false, familyKeys: ["A", "B"] }),
    );
    expect(result.current.isOn("A")).toBe(true);
    expect(result.current.isOn("anything")).toBe(true);
  });

  it("toggle(key) flips a family off and back on", () => {
    const { result } = renderHook(() =>
      usePatternPicker({ open: false, familyKeys: ["A", "B"] }),
    );
    act(() => result.current.toggle("A"));
    expect(result.current.isOn("A")).toBe(false);
    act(() => result.current.toggle("A"));
    expect(result.current.isOn("A")).toBe(true);
  });

  it("selectAll() turns everything back on after toggles", () => {
    const { result } = renderHook(() =>
      usePatternPicker({ open: false, familyKeys: ["A", "B", "C"] }),
    );
    act(() => result.current.toggle("A"));
    act(() => result.current.toggle("B"));
    expect(result.current.isOn("A")).toBe(false);
    expect(result.current.isOn("B")).toBe(false);
    act(() => result.current.selectAll());
    expect(result.current.isOn("A")).toBe(true);
    expect(result.current.isOn("B")).toBe(true);
    expect(result.current.isOn("C")).toBe(true);
  });

  it("clearAll() turns off every provided familyKey", () => {
    const familyKeys = ["A", "B", "C"];
    const { result } = renderHook(() =>
      usePatternPicker({ open: false, familyKeys }),
    );
    act(() => result.current.clearAll());
    for (const key of familyKeys) {
      expect(result.current.isOn(key)).toBe(false);
    }
  });
});

describe("usePatternPicker — reset on open", () => {
  it("resets the filter (but not the view) on close → reopen", () => {
    const { result, rerender } = renderHook(
      ({ open }) => usePatternPicker({ open, familyKeys: ["A", "B"] }),
      { initialProps: { open: true } },
    );

    // Persist a non-default view, then deselect a family while open.
    act(() => result.current.setView("map"));
    act(() => result.current.toggle("A"));
    expect(result.current.isOn("A")).toBe(false);
    expect(result.current.view).toBe("map");

    // Close then reopen → filter should be back to all-on, view preserved.
    rerender({ open: false });
    rerender({ open: true });

    expect(result.current.isOn("A")).toBe(true);
    expect(result.current.view).toBe("map");
  });

  it("does NOT reset the filter on a re-render while staying open", () => {
    const { result, rerender } = renderHook(
      ({ open }) => usePatternPicker({ open, familyKeys: ["A", "B"] }),
      { initialProps: { open: true } },
    );
    act(() => result.current.toggle("A"));
    expect(result.current.isOn("A")).toBe(false);
    // Re-render with the same open value (e.g. tab switch / parent re-render).
    rerender({ open: true });
    expect(result.current.isOn("A")).toBe(false);
  });
});
