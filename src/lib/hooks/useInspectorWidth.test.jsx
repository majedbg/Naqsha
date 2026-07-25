// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useInspectorWidth, {
  DEFAULT_WIDTH,
  MIN_WIDTH,
  MAX_WIDTH,
  STORAGE_KEY,
} from "./useInspectorWidth";

// Inspector resize drag: resizable + persisted width for the right-hand rail.
// X-axis mirror of usePanelWidth with two deliberate differences:
//   1. The handle is on the LEFT edge, so dragging LEFT grows the panel
//      (next = startWidth - deltaX).
//   2. MIN === DEFAULT === 288 (today's `w-72` rail) — the inspector only ever
//      grows, and double-click resets to the compact rail.

beforeEach(() => {
  localStorage.clear();
});

describe("useInspectorWidth (load + clamp)", () => {
  it("exposes the documented constants", () => {
    expect(DEFAULT_WIDTH).toBe(288);
    expect(MIN_WIDTH).toBe(288);
    expect(MAX_WIDTH).toBe(560);
    expect(STORAGE_KEY).toBe("ui.inspectorWidth");
  });

  it("defaults to 288 when localStorage is empty", () => {
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(288);
  });

  it("clamps a stored value above max (999 -> 560) on load", () => {
    localStorage.setItem(STORAGE_KEY, "999");
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(560);
  });

  it("clamps a stored value below min (200 -> 288) on load", () => {
    localStorage.setItem(STORAGE_KEY, "200");
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(288);
  });

  it("falls back to 288 for garbage / NaN stored values", () => {
    localStorage.setItem(STORAGE_KEY, "not-a-number");
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(288);
  });

  it("keeps a valid in-range stored value as-is on load", () => {
    localStorage.setItem(STORAGE_KEY, "420");
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(420);
  });
});

describe("useInspectorWidth (drag + persistence)", () => {
  it("dragging LEFT grows the panel (inverse of the left rail)", () => {
    const { result } = renderHook(() => useInspectorWidth());

    act(() => {
      result.current.onMouseDown({ clientX: 900, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 800 }));
    });

    expect(result.current.width).toBe(388); // 288 + 100 leftward
  });

  it("dragging RIGHT shrinks toward the 288 floor, never past it", () => {
    localStorage.setItem(STORAGE_KEY, "440");
    const { result } = renderHook(() => useInspectorWidth());

    act(() => {
      result.current.onMouseDown({ clientX: 900, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 980 }));
    });
    expect(result.current.width).toBe(360); // 440 - 80

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 5000 }));
    });
    expect(result.current.width).toBe(288); // floored at today's size
  });

  it("does NOT write localStorage mid-drag, but DOES on drag-end", () => {
    const { result } = renderHook(() => useInspectorWidth());

    act(() => {
      result.current.onMouseDown({ clientX: 900, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 850 }));
    });

    expect(result.current.width).toBe(338); // 288 + 50
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 850 }));
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("338");
  });

  it("clamps the live width to [288, 560] during a drag", () => {
    const { result } = renderHook(() => useInspectorWidth());

    act(() => {
      result.current.onMouseDown({ clientX: 900, preventDefault() {} });
    });
    act(() => {
      // huge leftward delta -> clamp to max
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: -5000 }));
    });
    expect(result.current.width).toBe(560);

    act(() => {
      // huge rightward delta -> clamp to min
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 5000 }));
    });
    expect(result.current.width).toBe(288);

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 5000 }));
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("288");
  });

  it("toggles isDragging across the drag lifecycle", () => {
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.isDragging).toBe(false);
    act(() => {
      result.current.onMouseDown({ clientX: 900, preventDefault() {} });
    });
    expect(result.current.isDragging).toBe(true);
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 900 }));
    });
    expect(result.current.isDragging).toBe(false);
  });

  it("double-click resets width to the 288 compact rail and persists", () => {
    localStorage.setItem(STORAGE_KEY, "500");
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(500);

    act(() => {
      result.current.onDoubleClick();
    });
    expect(result.current.width).toBe(288);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("288");
  });

  it("uses its own storage key (does not collide with the left panel)", () => {
    localStorage.setItem("ui.objectTreeWidth", "400");
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(288);
  });

  it("cleans up window listeners on unmount mid-drag (no leak)", () => {
    const { result, unmount } = renderHook(() => useInspectorWidth());
    act(() => {
      result.current.onMouseDown({ clientX: 900, preventDefault() {} });
    });
    unmount();
    expect(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 300 }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: 300 }));
    }).not.toThrow();
  });
});
