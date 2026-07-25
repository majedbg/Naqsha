// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useInspectorWidth, {
  DEFAULT_WIDTH,
  MIN_WIDTH,
  MAX_WIDTH,
  STORAGE_KEY,
  maxWidthForViewport,
} from "./useInspectorWidth";
import { STORAGE_KEY as LEFT_STORAGE_KEY } from "./usePanelWidth";

// Inspector resize drag: resizable + persisted width for the right-hand rail.
// X-axis mirror of usePanelWidth with two deliberate differences:
//   1. The handle is on the LEFT edge, so dragging LEFT grows the panel
//      (next = startWidth - deltaX).
//   2. MIN === DEFAULT === 288 (today's `w-72` rail) — the inspector only ever
//      grows, and double-click resets to the compact rail.

// jsdom defaults to a 1024px window, which the viewport guard would cap. These
// suites test the STATIC range, so give them a monitor wide enough that the
// guard never binds; the guard has its own suite at the bottom.
function setViewport(px) {
  window.innerWidth = px;
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  localStorage.clear();
  window.innerWidth = 1600;
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

// The rail is wide enough to erase the canvas: the shell renders down to 768px,
// both side columns are shrink-0, and the flex-1 canvas is what yields. A 560
// width persisted on a big monitor must NOT reopen on a laptop with no canvas
// (measured pre-fix: 768px viewport + stored 560 => a 2px canvas).
describe("useInspectorWidth (viewport guard)", () => {
  it("leaves the full range available on a wide monitor", () => {
    expect(maxWidthForViewport(1600)).toBe(MAX_WIDTH);
    expect(maxWidthForViewport(1440)).toBe(MAX_WIDTH);
  });

  it("caps the rail on a narrow viewport so the canvas keeps its floor", () => {
    // 1024 - 48 tool strip - 280 left rail - 320 canvas floor = 376
    expect(maxWidthForViewport(1024)).toBe(376);
  });

  it("never caps below MIN — the 288 rail always survives", () => {
    expect(maxWidthForViewport(768)).toBe(MIN_WIDTH);
    expect(maxWidthForViewport(320)).toBe(MIN_WIDTH);
  });

  it("accounts for the left rail's ACTUAL width, not just its default", () => {
    localStorage.setItem(LEFT_STORAGE_KEY, "480"); // left panel dragged to max
    // 1440 - 48 - 480 - 320 = 592 -> still over MAX, so MAX stands
    expect(maxWidthForViewport(1440)).toBe(MAX_WIDTH);
    // 1280 - 48 - 480 - 320 = 432 -> the wider left rail eats into the cap
    expect(maxWidthForViewport(1280)).toBe(432);
  });

  it("falls back to the full range when the viewport is unknown/absurd", () => {
    expect(maxWidthForViewport(undefined)).toBe(MAX_WIDTH);
    expect(maxWidthForViewport(0)).toBe(MAX_WIDTH);
    expect(maxWidthForViewport(NaN)).toBe(MAX_WIDTH);
  });

  it("renders a stored-560 rail clamped down on a 768px viewport", () => {
    localStorage.setItem(STORAGE_KEY, "560");
    window.innerWidth = 768;
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(MIN_WIDTH);
  });

  it("re-clamps live on window resize, and RESTORES the preference on re-widen", () => {
    localStorage.setItem(STORAGE_KEY, "560");
    const { result } = renderHook(() => useInspectorWidth());
    expect(result.current.width).toBe(560);

    act(() => setViewport(1024));
    expect(result.current.width).toBe(376); // capped, preference not forgotten

    act(() => setViewport(1600));
    expect(result.current.width).toBe(560); // ...and it comes back
  });

  it("does not overwrite the stored preference when the window merely shrinks", () => {
    localStorage.setItem(STORAGE_KEY, "560");
    const { result } = renderHook(() => useInspectorWidth());
    act(() => setViewport(768));
    expect(result.current.width).toBe(MIN_WIDTH);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("560");
  });

  it("a drag on a narrow viewport cannot exceed the viewport cap", () => {
    window.innerWidth = 1024;
    const { result } = renderHook(() => useInspectorWidth());
    act(() => {
      result.current.onMouseDown({ clientX: 900, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: -5000 }));
    });
    expect(result.current.width).toBe(376);
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: -5000 }));
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("376");
  });

  it("removes its resize listener on unmount", () => {
    const { unmount } = renderHook(() => useInspectorWidth());
    unmount();
    expect(() => setViewport(640)).not.toThrow();
  });
});
