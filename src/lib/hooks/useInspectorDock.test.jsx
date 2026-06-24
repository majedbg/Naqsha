// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useInspectorDock,
  POSITION_KEY,
  COLLAPSED_KEY,
} from "./useInspectorDock";

// WI-1 (inspector-dock): the hook owns the Properties-panel dock position
// (right vs bottom) and the bottom-shelf collapsed flag. Two rules are
// load-bearing (mirrored from useTheme):
//   1. Persistence is IMPERATIVE — localStorage is written only inside the
//      setter/toggle callbacks, never via a reactive effect.
//   2. Load coerces unknown/garbage stored values to a safe default
//      (aspect-ratio default for position, false for collapsed), and a
//      throwing localStorage falls back gracefully.
// Smart default (Q2): with NO saved pref, a portrait window
// (innerHeight > innerWidth) starts 'bottom', else 'right'. Once the user
// toggles, the saved choice ALWAYS wins over aspect ratio on later loads.

function setViewport(width, height) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

const PORTRAIT = () => setViewport(800, 1200); // tall: height > width
const LANDSCAPE = () => setViewport(1400, 900); // wide: width >= height

beforeEach(() => {
  localStorage.clear();
  LANDSCAPE(); // reset to a known orientation per test
});

afterEach(() => {
  localStorage.clear();
});

describe("useInspectorDock (WI-1)", () => {
  it("exposes the documented storage keys", () => {
    expect(POSITION_KEY).toBe("ui.inspectorDockPosition");
    expect(COLLAPSED_KEY).toBe("ui.inspectorDockCollapsed");
  });

  it("exposes exactly the documented API surface", () => {
    const { result } = renderHook(() => useInspectorDock());
    expect(Object.keys(result.current).sort()).toEqual(
      [
        "collapsed",
        "dockPosition",
        "setDockPosition",
        "toggleCollapsed",
        "toggleDock",
      ].sort()
    );
  });

  // ---- Q2 smart default ----
  it("no saved pref + portrait -> 'bottom'", () => {
    PORTRAIT();
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("bottom");
  });

  it("no saved pref + landscape -> 'right'", () => {
    LANDSCAPE();
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("right");
  });

  it("no saved pref + exactly square (width === height) -> 'right'", () => {
    setViewport(1000, 1000);
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("right");
  });

  // ---- saved pref ALWAYS wins over aspect ratio ----
  it("saved 'right' wins even in a portrait window", () => {
    localStorage.setItem(POSITION_KEY, "right");
    PORTRAIT();
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("right");
  });

  it("saved 'bottom' wins even in a landscape window", () => {
    localStorage.setItem(POSITION_KEY, "bottom");
    LANDSCAPE();
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("bottom");
  });

  // ---- toggleDock / setDockPosition persist imperatively ----
  it("toggleDock flips right<->bottom and persists synchronously", () => {
    LANDSCAPE();
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("right");

    act(() => result.current.toggleDock());
    expect(result.current.dockPosition).toBe("bottom");
    expect(localStorage.getItem(POSITION_KEY)).toBe("bottom");

    act(() => result.current.toggleDock());
    expect(result.current.dockPosition).toBe("right");
    expect(localStorage.getItem(POSITION_KEY)).toBe("right");
  });

  it("setDockPosition persists the new value synchronously", () => {
    const { result } = renderHook(() => useInspectorDock());
    act(() => result.current.setDockPosition("bottom"));
    expect(result.current.dockPosition).toBe("bottom");
    expect(localStorage.getItem(POSITION_KEY)).toBe("bottom");
  });

  it("a toggled choice survives remount and wins over aspect ratio", () => {
    LANDSCAPE();
    const first = renderHook(() => useInspectorDock());
    act(() => first.result.current.toggleDock()); // -> 'bottom'
    first.unmount();

    // Remount in a landscape window: the saved 'bottom' must still win.
    LANDSCAPE();
    const second = renderHook(() => useInspectorDock());
    expect(second.result.current.dockPosition).toBe("bottom");
  });

  // ---- collapsed ----
  it("collapsed defaults to false", () => {
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.collapsed).toBe(false);
  });

  it("toggleCollapsed flips it and persists", () => {
    const { result } = renderHook(() => useInspectorDock());
    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe("true");

    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem(COLLAPSED_KEY)).toBe("false");
  });

  it("collapsed re-reads persisted state on remount", () => {
    const first = renderHook(() => useInspectorDock());
    act(() => first.result.current.toggleCollapsed()); // -> true
    first.unmount();

    const second = renderHook(() => useInspectorDock());
    expect(second.result.current.collapsed).toBe(true);
  });

  // ---- garbage / guard ----
  it("garbage stored position falls back to the aspect-ratio default", () => {
    localStorage.setItem(POSITION_KEY, "sideways");
    PORTRAIT();
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("bottom"); // portrait default

    localStorage.setItem(POSITION_KEY, "sideways");
    LANDSCAPE();
    const second = renderHook(() => useInspectorDock());
    expect(second.result.current.dockPosition).toBe("right"); // landscape default
  });

  it("garbage stored collapsed value falls back to false", () => {
    localStorage.setItem(COLLAPSED_KEY, "maybe");
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.collapsed).toBe(false);
  });

  it("does not write to localStorage on mount (no reactive-effect persistence)", () => {
    PORTRAIT();
    renderHook(() => useInspectorDock());
    // Smart default was 'bottom', but nothing should have been persisted.
    expect(localStorage.getItem(POSITION_KEY)).toBeNull();
    expect(localStorage.getItem(COLLAPSED_KEY)).toBeNull();
  });

  it("survives a throwing localStorage.getItem on load (graceful fallback)", () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("storage blocked");
    };
    LANDSCAPE();
    let result;
    expect(() => {
      result = renderHook(() => useInspectorDock()).result;
    }).not.toThrow();
    expect(result.current.dockPosition).toBe("right"); // aspect-ratio fallback
    expect(result.current.collapsed).toBe(false);
    Storage.prototype.getItem = orig;
  });

  it("survives a throwing localStorage.setItem on toggle (in-session still works)", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("storage blocked");
    };
    LANDSCAPE();
    const { result } = renderHook(() => useInspectorDock());
    expect(() => {
      act(() => result.current.toggleDock());
    }).not.toThrow();
    expect(result.current.dockPosition).toBe("bottom"); // state still flips
    Storage.prototype.setItem = orig;
  });
});
