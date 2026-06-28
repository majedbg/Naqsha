// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useCanvasSize from "./useCanvasSize";

// S3 — captureCanvas/restoreCanvas: the bulk get/set seam the unified history
// snapshot needs for the canvas slice (W/H/unit/margin/preset/outputMode).
// Round-trip identity: restoreCanvas(captureCanvas()) is a no-op; a captured
// snapshot survives intervening edits and restores the exact prior canvas.

beforeEach(() => {
  localStorage.clear();
});

describe("useCanvasSize — captureCanvas / restoreCanvas (history seam)", () => {
  it("captureCanvas reflects all six canvas fields", () => {
    const { result } = renderHook(() => useCanvasSize({}));
    const snap = result.current.captureCanvas();
    expect(snap).toEqual({
      w: result.current.canvasW,
      h: result.current.canvasH,
      unit: result.current.unit,
      margin: result.current.margin,
      presetIndex: result.current.presetIndex,
      outputMode: result.current.outputMode,
    });
  });

  it("restoreCanvas writes every field back", () => {
    const { result } = renderHook(() => useCanvasSize({}));
    act(() => {
      result.current.restoreCanvas({
        w: 1234,
        h: 567,
        unit: "in",
        margin: 9,
        presetIndex: 4,
        outputMode: "laser",
      });
    });
    expect(result.current.canvasW).toBe(1234);
    expect(result.current.canvasH).toBe(567);
    expect(result.current.unit).toBe("in");
    expect(result.current.margin).toBe(9);
    expect(result.current.presetIndex).toBe(4);
    expect(result.current.outputMode).toBe("laser");
  });

  it("round-trips: a captured snapshot restores the exact prior canvas after edits", () => {
    const { result } = renderHook(() => useCanvasSize({}));
    // Establish a known starting canvas.
    act(() => {
      result.current.restoreCanvas({
        w: 800,
        h: 600,
        unit: "mm",
        margin: 2,
        presetIndex: 1,
        outputMode: "plotter",
      });
    });
    const snap = result.current.captureCanvas();
    // Mutate everything.
    act(() => {
      result.current.setCanvasW(1111);
      result.current.setUnit("px");
      result.current.setMargin(7);
      result.current.setPresetIndex(3);
      result.current.setOutputMode("laser");
    });
    expect(result.current.canvasW).toBe(1111);
    // Restore the snapshot → exact prior canvas.
    act(() => result.current.restoreCanvas(snap));
    expect(result.current.captureCanvas()).toEqual(snap);
  });
});
