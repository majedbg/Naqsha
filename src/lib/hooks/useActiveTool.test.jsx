// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import useActiveTool from "./useActiveTool";

// Issue #9 (Lane B / B6): active-tool state + keyboard shortcuts. The keydown
// listener is gated by `enabled` (flag-ON only) and ignores key events that
// originate in text inputs (so V/T/space don't hijack the save-name field).

describe("useActiveTool (B6 — active tool + hotkeys)", () => {
  it("defaults to the select tool", () => {
    const { result } = renderHook(() => useActiveTool());
    expect(result.current.activeTool).toBe("select");
  });

  it("setActiveTool changes the active tool", () => {
    const { result } = renderHook(() => useActiveTool());
    act(() => result.current.setActiveTool("text"));
    expect(result.current.activeTool).toBe("text");
  });

  it("V / T / space keydown activates select / text / hand when enabled", () => {
    const { result } = renderHook(() => useActiveTool({ enabled: true }));

    act(() => {
      fireEvent.keyDown(window, { key: "t" });
    });
    expect(result.current.activeTool).toBe("text");

    act(() => {
      fireEvent.keyDown(window, { key: "v" });
    });
    expect(result.current.activeTool).toBe("select");

    act(() => {
      fireEvent.keyDown(window, { key: " " });
    });
    expect(result.current.activeTool).toBe("hand");
  });

  it("does NOT bind hotkeys when disabled (flag-OFF no-op)", () => {
    const { result } = renderHook(() => useActiveTool({ enabled: false }));
    act(() => {
      fireEvent.keyDown(window, { key: "t" });
    });
    expect(result.current.activeTool).toBe("select");
  });

  it("ignores hotkeys typed into an input / textarea", () => {
    const { result } = renderHook(() => useActiveTool({ enabled: true }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      fireEvent.keyDown(input, { key: "t" });
    });
    expect(result.current.activeTool).toBe("select");
    input.remove();
  });
});
