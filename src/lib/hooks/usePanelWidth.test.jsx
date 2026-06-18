// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import usePanelWidth, {
  DEFAULT_WIDTH,
  MIN_WIDTH,
  MAX_WIDTH,
  STORAGE_KEY,
} from "./usePanelWidth";

// WI-3 (object-tree panel): resizable + persisted panel width. The hook owns the
// width state, the load/clamp-from-localStorage rules, and the drag/double-click
// handlers. Persistence is imperative (drag-END + double-click only) — never a
// reactive effect — so a mid-drag move must not touch localStorage.

beforeEach(() => {
  localStorage.clear();
});

describe("usePanelWidth (WI-3 — load + clamp)", () => {
  it("exposes the documented constants", () => {
    expect(DEFAULT_WIDTH).toBe(280);
    expect(MIN_WIDTH).toBe(200);
    expect(MAX_WIDTH).toBe(480);
    expect(STORAGE_KEY).toBe("ui.objectTreeWidth");
  });

  it("defaults to 280 when localStorage is empty", () => {
    const { result } = renderHook(() => usePanelWidth());
    expect(result.current.width).toBe(280);
  });

  it("clamps a stored value above max (999 -> 480) on load", () => {
    localStorage.setItem(STORAGE_KEY, "999");
    const { result } = renderHook(() => usePanelWidth());
    expect(result.current.width).toBe(480);
  });

  it("clamps a stored value below min (50 -> 200) on load", () => {
    localStorage.setItem(STORAGE_KEY, "50");
    const { result } = renderHook(() => usePanelWidth());
    expect(result.current.width).toBe(200);
  });

  it("falls back to 280 for garbage / NaN stored values", () => {
    localStorage.setItem(STORAGE_KEY, "not-a-number");
    const { result } = renderHook(() => usePanelWidth());
    expect(result.current.width).toBe(280);
  });

  it("keeps a valid in-range stored value as-is on load", () => {
    localStorage.setItem(STORAGE_KEY, "320");
    const { result } = renderHook(() => usePanelWidth());
    expect(result.current.width).toBe(320);
  });
});

describe("usePanelWidth (WI-3 — drag + persistence)", () => {
  it("does NOT write localStorage mid-drag, but DOES on drag-end", () => {
    const { result } = renderHook(() => usePanelWidth());

    act(() => {
      result.current.onMouseDown({ clientX: 100, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 150 }));
    });

    // Mid-drag: width moved, but nothing persisted yet.
    expect(result.current.width).toBe(330); // 280 + 50
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 150 }));
    });

    // Drag-end: now persisted.
    expect(localStorage.getItem(STORAGE_KEY)).toBe("330");
  });

  it("clamps the live width to [200, 480] during a drag", () => {
    const { result } = renderHook(() => usePanelWidth());

    act(() => {
      result.current.onMouseDown({ clientX: 100, preventDefault() {} });
    });
    act(() => {
      // huge positive delta -> clamp to max
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 5000 }));
    });
    expect(result.current.width).toBe(480);

    act(() => {
      // huge negative delta -> clamp to min
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: -5000 }));
    });
    expect(result.current.width).toBe(200);

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: -5000 }));
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("200");
  });

  it("toggles isDragging across the drag lifecycle", () => {
    const { result } = renderHook(() => usePanelWidth());
    expect(result.current.isDragging).toBe(false);
    act(() => {
      result.current.onMouseDown({ clientX: 100, preventDefault() {} });
    });
    expect(result.current.isDragging).toBe(true);
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 100 }));
    });
    expect(result.current.isDragging).toBe(false);
  });

  it("double-click resets width to 280 and persists", () => {
    localStorage.setItem(STORAGE_KEY, "400");
    const { result } = renderHook(() => usePanelWidth());
    expect(result.current.width).toBe(400);

    act(() => {
      result.current.onDoubleClick();
    });
    expect(result.current.width).toBe(280);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("280");
  });

  it("cleans up window listeners on unmount mid-drag (no leak)", () => {
    const { result, unmount } = renderHook(() => usePanelWidth());
    act(() => {
      result.current.onMouseDown({ clientX: 100, preventDefault() {} });
    });
    unmount();
    // After unmount, a stray mousemove must not throw or persist.
    expect(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 300 }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 300 }));
    }).not.toThrow();
  });
});
