// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInspectorDock, POSITION_KEY } from "./useInspectorDock";

// WI-6 (inspector-dock): a single global window keydown listener — registered
// once in useInspectorDock (which AppShell instantiates exactly once) — toggles
// the dock on Ctrl/Cmd+Alt+P. It uses e.code === "KeyP" (NOT e.key, which on
// macOS Alt+P yields "π"), guards against text-entry focus, and is removed on
// unmount. It must NOT write to localStorage on mount (WI-1's invariant).

function setViewport(width, height) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

function dispatchCombo(extra = {}) {
  act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyP",
        altKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
        ...extra,
      })
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  setViewport(1400, 900); // landscape => default 'right'
});

afterEach(() => {
  localStorage.clear();
});

describe("useInspectorDock shortcut (WI-6 — Ctrl/Cmd+Alt+P)", () => {
  it("Cmd+Alt+P toggles the dock right<->bottom", () => {
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("right");

    dispatchCombo({ metaKey: true });
    expect(result.current.dockPosition).toBe("bottom");

    dispatchCombo({ metaKey: true });
    expect(result.current.dockPosition).toBe("right");
  });

  it("Ctrl+Alt+P also toggles (ctrlKey variant)", () => {
    const { result } = renderHook(() => useInspectorDock());
    dispatchCombo({ ctrlKey: true, metaKey: false });
    expect(result.current.dockPosition).toBe("bottom");
  });

  it("does NOT toggle on plain P, Cmd+P (no Alt), or Alt+P (no Cmd/Ctrl)", () => {
    const { result } = renderHook(() => useInspectorDock());
    expect(result.current.dockPosition).toBe("right");

    dispatchCombo({ altKey: false, metaKey: false, ctrlKey: false }); // plain P
    expect(result.current.dockPosition).toBe("right");

    dispatchCombo({ altKey: false, metaKey: true }); // Cmd+P
    expect(result.current.dockPosition).toBe("right");

    dispatchCombo({ altKey: true, metaKey: false, ctrlKey: false }); // Alt+P
    expect(result.current.dockPosition).toBe("right");
  });

  it("ignores the combo when an <input> is focused", () => {
    const { result } = renderHook(() => useInspectorDock());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "KeyP",
          altKey: true,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
    });
    expect(result.current.dockPosition).toBe("right"); // unchanged

    input.remove();
  });

  it("removes the listener on unmount (no toggle, a fresh hook still works)", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const first = renderHook(() => useInspectorDock());
    first.unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();

    // A dispatch after unmount must not throw, and a freshly mounted hook still
    // responds to the combo (proving the listener wasn't globally clobbered).
    expect(() => dispatchCombo()).not.toThrow();
    const second = renderHook(() => useInspectorDock());
    expect(second.result.current.dockPosition).toBe("right");
    dispatchCombo();
    expect(second.result.current.dockPosition).toBe("bottom");
  });

  it("the shortcut drives the SAME toggleDock transition as calling it directly", () => {
    // Single source of truth: the menu's onSelect, DockToggle, and the shortcut
    // all call the one hook instance's toggleDock. Calling toggleDock() directly
    // and firing the shortcut produce the identical state transition.
    const direct = renderHook(() => useInspectorDock());
    act(() => direct.result.current.toggleDock());
    const afterDirect = direct.result.current.dockPosition;
    direct.unmount();

    localStorage.clear();
    setViewport(1400, 900);
    const viaKey = renderHook(() => useInspectorDock());
    dispatchCombo();
    expect(viaKey.result.current.dockPosition).toBe(afterDirect); // both -> 'bottom'
  });

  it("does NOT write to localStorage on mount (WI-1 invariant preserved)", () => {
    setViewport(800, 1200); // portrait => smart default 'bottom', but no write
    renderHook(() => useInspectorDock());
    expect(localStorage.getItem(POSITION_KEY)).toBeNull();
  });
});
