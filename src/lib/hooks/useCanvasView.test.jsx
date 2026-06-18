// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useCanvasView from "./useCanvasView";

// Issue #9 (Lane B / B6): minimal canvas pan/zoom state the shell's Hand/Zoom
// tools drive. The p5 canvas is not drivable under jsdom, so the Hand/Zoom
// "pan and zoom the canvas" acceptance is asserted at the state level here.

describe("useCanvasView (B6 — pan + zoom state)", () => {
  it("defaults to identity (zoom 1, pan 0,0)", () => {
    const { result } = renderHook(() => useCanvasView());
    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });

  it("zoomIn / zoomOut change the zoom factor", () => {
    const { result } = renderHook(() => useCanvasView());
    act(() => result.current.zoomIn());
    expect(result.current.zoom).toBeGreaterThan(1);
    act(() => result.current.zoomOut());
    act(() => result.current.zoomOut());
    expect(result.current.zoom).toBeLessThan(1);
  });

  it("clamps zoom to the [min, max] range", () => {
    const { result } = renderHook(() => useCanvasView());
    act(() => {
      for (let i = 0; i < 50; i++) result.current.zoomIn();
    });
    expect(result.current.zoom).toBeLessThanOrEqual(5);
    act(() => {
      for (let i = 0; i < 100; i++) result.current.zoomOut();
    });
    expect(result.current.zoom).toBeGreaterThanOrEqual(0.25);
  });

  it("panBy translates the view", () => {
    const { result } = renderHook(() => useCanvasView());
    act(() => result.current.panBy(10, -5));
    expect(result.current.pan).toEqual({ x: 10, y: -5 });
    act(() => result.current.panBy(2, 5));
    expect(result.current.pan).toEqual({ x: 12, y: 0 });
  });

  it("reset returns to identity", () => {
    const { result } = renderHook(() => useCanvasView());
    act(() => {
      result.current.zoomIn();
      result.current.panBy(30, 30);
    });
    act(() => result.current.reset());
    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });
});
