// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────
// useAuth is swapped per-test via this mutable holder.
let authValue = { user: null, profile: null, loading: false };
vi.mock("../AuthContext", () => ({
  useAuth: () => authValue,
}));

// settingsService: spy the writer, stub the reader.
const writePatternPickerSettings = vi.fn(() => Promise.resolve({ ok: true }));
const getPatternPickerSettings = vi.fn((profile) => profile?.settings?.patternPicker ?? null);
vi.mock("../settingsService", () => ({
  writePatternPickerSettings: (...args) => writePatternPickerSettings(...args),
  getPatternPickerSettings: (...args) => getPatternPickerSettings(...args),
}));

import usePatternPicker, {
  PICKER_VIEW_STORAGE_KEY,
  PICKER_SORT_STORAGE_KEY,
} from "./usePatternPicker";

const guest = { user: null, profile: null, loading: false };
const loadingAuth = { user: null, profile: null, loading: true };
const loggedIn = (settings = {}) => ({
  user: { id: "u1" },
  profile: { id: "u1", settings },
  loading: false,
});

beforeEach(() => {
  localStorage.clear();
  authValue = guest;
  writePatternPickerSettings.mockClear();
  getPatternPickerSettings.mockClear();
});

// ────────────────────────────────────────────────────────────────────────────
// Existing view-persistence behavior (unchanged)
// ────────────────────────────────────────────────────────────────────────────
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

    act(() => result.current.setView("map"));
    act(() => result.current.toggle("A"));
    expect(result.current.isOn("A")).toBe(false);
    expect(result.current.view).toBe("map");

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
    rerender({ open: true });
    expect(result.current.isOn("A")).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Sort hydration (decision #4: DB wins, else adopt local)
// ────────────────────────────────────────────────────────────────────────────
describe("usePatternPicker — sort hydration", () => {
  it("logged-in + DB present → seeds sortMode/manualOrder from DB", () => {
    authValue = loggedIn({
      patternPicker: { sortMode: "custom", manualOrder: ["x", "y", "z"] },
    });
    // local present too — DB must win.
    localStorage.setItem(
      PICKER_SORT_STORAGE_KEY,
      JSON.stringify({ sortMode: "auto", manualOrder: ["a"] }),
    );
    const { result } = renderHook(() => usePatternPicker({ open: false }));
    expect(result.current.sortMode).toBe("custom");
    expect(result.current.manualOrder).toEqual(["x", "y", "z"]);
    // DB present → no adopt-local write.
    expect(writePatternPickerSettings).not.toHaveBeenCalled();
  });

  it("logged-in + DB empty + local present → adopts local AND writes it up once", () => {
    authValue = loggedIn({}); // no patternPicker namespace
    localStorage.setItem(
      PICKER_SORT_STORAGE_KEY,
      JSON.stringify({ sortMode: "custom", manualOrder: ["p", "q"] }),
    );
    const { result } = renderHook(() => usePatternPicker({ open: false }));
    expect(result.current.sortMode).toBe("custom");
    expect(result.current.manualOrder).toEqual(["p", "q"]);
    // Adopt-local one-time write.
    expect(writePatternPickerSettings).toHaveBeenCalledTimes(1);
    expect(writePatternPickerSettings).toHaveBeenCalledWith(
      "u1",
      { sortMode: "custom", manualOrder: ["p", "q"] },
      {},
    );
  });

  it("guest + local present → seeds from local, no DB write", () => {
    authValue = guest;
    localStorage.setItem(
      PICKER_SORT_STORAGE_KEY,
      JSON.stringify({ sortMode: "custom", manualOrder: ["m"] }),
    );
    const { result } = renderHook(() => usePatternPicker({ open: false }));
    expect(result.current.sortMode).toBe("custom");
    expect(result.current.manualOrder).toEqual(["m"]);
    expect(writePatternPickerSettings).not.toHaveBeenCalled();
  });

  it("nothing present → defaults (auto / [])", () => {
    authValue = guest;
    const { result } = renderHook(() => usePatternPicker({ open: false }));
    expect(result.current.sortMode).toBe("auto");
    expect(result.current.manualOrder).toEqual([]);
    expect(writePatternPickerSettings).not.toHaveBeenCalled();
  });

  it("does NOT hydrate until auth has resolved (loading)", () => {
    authValue = loadingAuth;
    localStorage.setItem(
      PICKER_SORT_STORAGE_KEY,
      JSON.stringify({ sortMode: "custom", manualOrder: ["m"] }),
    );
    const { result, rerender } = renderHook(() =>
      usePatternPicker({ open: false }),
    );
    // While loading: untouched defaults.
    expect(result.current.sortMode).toBe("auto");
    // Auth resolves → hydrates.
    authValue = guest;
    rerender();
    expect(result.current.sortMode).toBe("custom");
    expect(result.current.manualOrder).toEqual(["m"]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// setSortMode persistence (immediate local + debounced DB)
// ────────────────────────────────────────────────────────────────────────────
describe("usePatternPicker — setSortMode persistence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("logged-in: writes localStorage immediately AND schedules a debounced DB write", () => {
    authValue = loggedIn({});
    const { result } = renderHook(() => usePatternPicker({ open: false }));

    act(() => result.current.setSortMode("custom"));

    // localStorage is immediate.
    expect(JSON.parse(localStorage.getItem(PICKER_SORT_STORAGE_KEY))).toEqual({
      sortMode: "custom",
      manualOrder: [],
    });
    // DB write is debounced — not yet.
    expect(writePatternPickerSettings).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(600));
    expect(writePatternPickerSettings).toHaveBeenCalledTimes(1);
    expect(writePatternPickerSettings).toHaveBeenCalledWith(
      "u1",
      { sortMode: "custom", manualOrder: [] },
      {},
    );
  });

  it("guest: writes localStorage only, never DB", () => {
    authValue = guest;
    const { result } = renderHook(() => usePatternPicker({ open: false }));

    act(() => result.current.setSortMode("custom"));
    expect(localStorage.getItem(PICKER_SORT_STORAGE_KEY)).toBeTruthy();

    act(() => vi.advanceTimersByTime(1000));
    expect(writePatternPickerSettings).not.toHaveBeenCalled();
  });

  it("debounce: rapid setSortMode calls collapse to a single DB write", () => {
    authValue = loggedIn({});
    const { result } = renderHook(() => usePatternPicker({ open: false }));

    // Distinct values so every dispatch is a real state change.
    act(() => result.current.setSortMode("custom"));
    act(() => result.current.setSortMode("auto"));
    act(() => result.current.setSortMode("custom"));

    expect(writePatternPickerSettings).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(600));
    expect(writePatternPickerSettings).toHaveBeenCalledTimes(1);
    // Last value wins.
    expect(writePatternPickerSettings.mock.calls[0][1]).toEqual({
      sortMode: "custom",
      manualOrder: [],
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Drag lifecycle API
// ────────────────────────────────────────────────────────────────────────────
describe("usePatternPicker — drag lifecycle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("enterCustom seeds manualOrder when empty, switches to custom, and persists", () => {
    authValue = guest;
    const { result } = renderHook(() => usePatternPicker({ open: false }));

    act(() => result.current.enterCustom(["a", "b", "c"]));
    expect(result.current.sortMode).toBe("custom");
    expect(result.current.manualOrder).toEqual(["a", "b", "c"]);
    expect(JSON.parse(localStorage.getItem(PICKER_SORT_STORAGE_KEY))).toEqual({
      sortMode: "custom",
      manualOrder: ["a", "b", "c"],
    });
  });

  it("startDrag seeds + promotes to custom but does NOT persist", () => {
    authValue = loggedIn({});
    const { result } = renderHook(() => usePatternPicker({ open: false }));

    act(() => result.current.startDrag("auto", ["a", "b", "c"]));
    expect(result.current.sortMode).toBe("custom");
    expect(result.current.manualOrder).toEqual(["a", "b", "c"]);
    // No persistence during a drag.
    expect(localStorage.getItem(PICKER_SORT_STORAGE_KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(writePatternPickerSettings).not.toHaveBeenCalled();
  });

  it("startDrag → cancelDrag reverts sortMode (Escape) and does NOT persist", () => {
    authValue = loggedIn({});
    const { result } = renderHook(() => usePatternPicker({ open: false }));

    expect(result.current.sortMode).toBe("auto");
    act(() => result.current.startDrag("auto", ["a", "b"]));
    expect(result.current.sortMode).toBe("custom");
    act(() => result.current.cancelDrag());
    expect(result.current.sortMode).toBe("auto"); // reverted

    expect(localStorage.getItem(PICKER_SORT_STORAGE_KEY)).toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(writePatternPickerSettings).not.toHaveBeenCalled();
  });

  it("commitDrag(id,toIndex) reorders (MOVE) and persists the drag-end result", () => {
    authValue = loggedIn({});
    const { result } = renderHook(() => usePatternPicker({ open: false }));

    // Establish an order via a drag-in-progress (no write yet).
    act(() => result.current.startDrag("auto", ["a", "b", "c"]));
    expect(writePatternPickerSettings).not.toHaveBeenCalled();

    // Drop: move "a" to the end.
    act(() => result.current.commitDrag("a", 2));
    expect(result.current.manualOrder).toEqual(["b", "c", "a"]);
    // localStorage immediate.
    expect(
      JSON.parse(localStorage.getItem(PICKER_SORT_STORAGE_KEY)).manualOrder,
    ).toEqual(["b", "c", "a"]);
    // DB debounced — exactly one write, only after the timer.
    expect(writePatternPickerSettings).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(600));
    expect(writePatternPickerSettings).toHaveBeenCalledTimes(1);
    expect(writePatternPickerSettings.mock.calls[0][1].manualOrder).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("resetManual restores the supplied family order and persists", () => {
    authValue = guest;
    const { result } = renderHook(() => usePatternPicker({ open: false }));

    act(() => result.current.enterCustom(["a", "b", "c"]));
    act(() => result.current.commitDrag("a", 2)); // → b,c,a
    expect(result.current.manualOrder).toEqual(["b", "c", "a"]);

    act(() => result.current.resetManual(["a", "b", "c"]));
    expect(result.current.manualOrder).toEqual(["a", "b", "c"]);
    expect(
      JSON.parse(localStorage.getItem(PICKER_SORT_STORAGE_KEY)).manualOrder,
    ).toEqual(["a", "b", "c"]);
  });
});
