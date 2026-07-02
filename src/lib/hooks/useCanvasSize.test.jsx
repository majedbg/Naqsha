// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useCanvasSize, {
  CANVAS_STORAGE_KEY,
  loadCanvasState,
} from "./useCanvasSize";
import { PRESET_SIZES, PPI } from "../../constants";
import { pxToUnit } from "../units";

// Characterization tests (AR-3A) pinning current canvas-sizing behavior.

describe("useCanvasSize", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("converts px → mm for the work-piece (export) dims via PX_PER_MM, matching the old inline math", () => {
    const { result } = renderHook(() =>
      useCanvasSize({ savedCanvas: null, activeTab: "design" })
    );
    const { canvasW, canvasH, workPieceWmm, workPieceHmm } = result.current;
    // Old inline formula: (canvasW / 96 * 25.4).toFixed(1).
    expect(workPieceWmm).toBe((canvasW / 96 * 25.4).toFixed(1));
    expect(workPieceHmm).toBe((canvasH / 96 * 25.4).toFixed(1));
    // And it is the single-sourced units helper.
    expect(workPieceWmm).toBe(pxToUnit(canvasW, "mm").toFixed(1));
    expect(workPieceHmm).toBe(pxToUnit(canvasH, "mm").toFixed(1));
    // Confirms the renamed keys exist on the returned object (terminology
    // honesty: these are work-piece/export dims, not the machine bed).
    expect(result.current).toHaveProperty("workPieceWmm");
    expect(result.current).toHaveProperty("workPieceHmm");
    expect(result.current).not.toHaveProperty("bedWmm");
    expect(result.current).not.toHaveProperty("bedHmm");
  });

  it("defaults to preset index 1 dimensions when no saved canvas exists", () => {
    const { result } = renderHook(() =>
      useCanvasSize({ savedCanvas: null, activeTab: "design" })
    );
    expect(result.current.presetIndex).toBe(1);
    expect(result.current.canvasW).toBe(PRESET_SIZES[1].width * PPI);
    expect(result.current.canvasH).toBe(PRESET_SIZES[1].height * PPI);
  });

  it("persists the full canvas blob (including activeTab) under one key", () => {
    renderHook(() =>
      useCanvasSize({ savedCanvas: null, activeTab: "export" })
    );
    const stored = loadCanvasState();
    expect(stored).not.toBeNull();
    expect(stored.activeTab).toBe("export");
    expect(stored.presetIndex).toBe(1);
    // Confirm the key shape round-trips.
    expect(
      JSON.parse(localStorage.getItem(CANVAS_STORAGE_KEY))
    ).toMatchObject({ activeTab: "export", presetIndex: 1 });
  });

  it("handlePresetChange sets dims from the preset (skips dims for Custom)", () => {
    const { result } = renderHook(() =>
      useCanvasSize({ savedCanvas: null, activeTab: "design" })
    );
    act(() => result.current.handlePresetChange(4));
    expect(result.current.presetIndex).toBe(4);
    expect(result.current.canvasW).toBe(PRESET_SIZES[4].width * PPI);

    const customIdx = PRESET_SIZES.length - 1; // Custom: null dims
    act(() => result.current.handlePresetChange(customIdx));
    expect(result.current.presetIndex).toBe(customIdx);
    // Dims unchanged because Custom has null width.
    expect(result.current.canvasW).toBe(PRESET_SIZES[4].width * PPI);
  });

  it("applyCanvasSize snaps to a matching preset, else falls to Custom", () => {
    const { result } = renderHook(() =>
      useCanvasSize({ savedCanvas: null, activeTab: "design" })
    );
    // Exact px match for preset 0 → snaps to index 0.
    act(() =>
      result.current.applyCanvasSize(
        PRESET_SIZES[0].width * PPI,
        PRESET_SIZES[0].height * PPI
      )
    );
    expect(result.current.presetIndex).toBe(0);

    // Arbitrary size with no preset match → Custom (last index).
    act(() => result.current.applyCanvasSize(1234, 5678));
    expect(result.current.presetIndex).toBe(PRESET_SIZES.length - 1);
    expect(result.current.canvasW).toBe(1234);
    expect(result.current.canvasH).toBe(5678);
  });

  it("prepareConfigured is true on first load because unit hint (in) != DEFAULT_UNIT (mm) [CHARACTERIZED]", () => {
    // Latent quirk: the comment says "configured once the user picks a non-default
    // preset/size/margin", but preset 1's unitHint is 'in' while DEFAULT_UNIT is
    // 'mm', so unit !== DEFAULT_UNIT is already true on a pristine load. Pinned.
    const { result } = renderHook(() =>
      useCanvasSize({ savedCanvas: null, activeTab: "design" })
    );
    expect(result.current.unit).toBe("in");
    expect(result.current.prepareConfigured).toBe(true);
  });
});
