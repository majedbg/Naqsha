// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import usePanelHeight, {
  DEFAULT_HEIGHT,
  MIN_HEIGHT,
  MAX_HEIGHT,
  STORAGE_KEY,
} from "./usePanelHeight";

// WI-2 (inspector-dock): resizable + persisted bottom-shelf height. Y-axis twin
// of usePanelWidth. The shelf is resized by dragging its TOP divider, so dragging
// UP (clientY decreases) must INCREASE height: next = clamp(startHeight - dY).
// Persistence is imperative (drag-END + double-click only) — never a reactive
// effect — so a mid-drag move must not touch localStorage.

beforeEach(() => {
  localStorage.clear();
});

describe("usePanelHeight (WI-2 — load + clamp)", () => {
  it("exposes the documented constants", () => {
    expect(DEFAULT_HEIGHT).toBe(280);
    expect(MIN_HEIGHT).toBe(160);
    expect(MAX_HEIGHT).toBe(520);
    expect(STORAGE_KEY).toBe("ui.inspectorDockHeight");
  });

  it("defaults to 280 when localStorage is empty", () => {
    const { result } = renderHook(() => usePanelHeight());
    expect(result.current.height).toBe(280);
  });

  it("clamps a stored value above max (999 -> 520) on load", () => {
    localStorage.setItem(STORAGE_KEY, "999");
    const { result } = renderHook(() => usePanelHeight());
    expect(result.current.height).toBe(520);
  });

  it("clamps a stored value below min (50 -> 160) on load", () => {
    localStorage.setItem(STORAGE_KEY, "50");
    const { result } = renderHook(() => usePanelHeight());
    expect(result.current.height).toBe(160);
  });

  it("falls back to 280 for garbage / NaN stored values", () => {
    localStorage.setItem(STORAGE_KEY, "abc");
    const { result } = renderHook(() => usePanelHeight());
    expect(result.current.height).toBe(280);
  });

  it("keeps a valid in-range stored value as-is on load", () => {
    localStorage.setItem(STORAGE_KEY, "320");
    const { result } = renderHook(() => usePanelHeight());
    expect(result.current.height).toBe(320);
  });
});

describe("usePanelHeight (WI-2 — drag direction + persistence)", () => {
  it("drag UP increases height, drag DOWN decreases it (top-divider sign)", () => {
    const { result } = renderHook(() => usePanelHeight());

    // Drag UP: clientY decreases by 50 -> height grows by 50.
    act(() => {
      result.current.onMouseDown({ clientY: 300, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 250 }));
    });
    expect(result.current.height).toBe(330); // 280 - (250 - 300) = 330
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientY: 250 }));
    });

    // Now drag DOWN from the new height: clientY increases -> height shrinks.
    act(() => {
      result.current.onMouseDown({ clientY: 300, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 360 }));
    });
    expect(result.current.height).toBe(270); // 330 - (360 - 300) = 270
  });

  it("does NOT write localStorage mid-drag, but DOES on drag-end", () => {
    const { result } = renderHook(() => usePanelHeight());

    act(() => {
      result.current.onMouseDown({ clientY: 300, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 250 }));
    });

    // Mid-drag: height moved, but nothing persisted yet.
    expect(result.current.height).toBe(330); // 280 - (250 - 300)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientY: 250 }));
    });

    // Drag-end: now persisted.
    expect(localStorage.getItem(STORAGE_KEY)).toBe("330");
  });

  it("clamps the live height to [160, 520] during a drag", () => {
    const { result } = renderHook(() => usePanelHeight());

    act(() => {
      result.current.onMouseDown({ clientY: 300, preventDefault() {} });
    });
    act(() => {
      // huge upward drag (clientY -> -5000) -> clamp to max
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: -5000 }));
    });
    expect(result.current.height).toBe(520);

    act(() => {
      // huge downward drag (clientY -> 5000) -> clamp to min
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 5000 }));
    });
    expect(result.current.height).toBe(160);

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientY: 5000 }));
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("160");
  });

  it("toggles isDragging across the drag lifecycle", () => {
    const { result } = renderHook(() => usePanelHeight());
    expect(result.current.isDragging).toBe(false);
    act(() => {
      result.current.onMouseDown({ clientY: 300, preventDefault() {} });
    });
    expect(result.current.isDragging).toBe(true);
    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientY: 300 }));
    });
    expect(result.current.isDragging).toBe(false);
  });

  it("double-click resets height to 280 and persists", () => {
    localStorage.setItem(STORAGE_KEY, "400");
    const { result } = renderHook(() => usePanelHeight());
    expect(result.current.height).toBe(400);

    act(() => {
      result.current.onDoubleClick();
    });
    expect(result.current.height).toBe(280);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("280");
  });

  it("sets and clears the <body> drag affordances across the drag", () => {
    const { result } = renderHook(() => usePanelHeight());

    act(() => {
      result.current.onMouseDown({ clientY: 300, preventDefault() {} });
    });
    expect(document.body.classList.contains("select-none")).toBe(true);
    expect(document.body.style.cursor).toBe("row-resize");

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup", { clientY: 300 }));
    });
    expect(document.body.classList.contains("select-none")).toBe(false);
    expect(document.body.style.cursor).toBe("");
  });

  it("removes window listeners after mouseup (further moves are ignored)", () => {
    const { result } = renderHook(() => usePanelHeight());

    act(() => {
      result.current.onMouseDown({ clientY: 300, preventDefault() {} });
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 250 }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientY: 250 }));
    });
    expect(result.current.height).toBe(330);

    // Listener should be gone — a stray move must not change height.
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 100 }));
    });
    expect(result.current.height).toBe(330);
  });

  it("cleans up window listeners on unmount mid-drag (no leak)", () => {
    const { result, unmount } = renderHook(() => usePanelHeight());
    act(() => {
      result.current.onMouseDown({ clientY: 300, preventDefault() {} });
    });
    unmount();
    // After unmount, a stray mousemove must not throw or persist.
    expect(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 100 }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientY: 100 }));
    }).not.toThrow();
  });
});
