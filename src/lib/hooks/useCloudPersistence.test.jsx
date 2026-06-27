// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the service seam so we characterize the hook's wiring, not Supabase.
const saveDesign = vi.fn();
const loadDesign = vi.fn();
const saveHistorySnapshot = vi.fn(() => Promise.resolve());
vi.mock("../designService", () => ({
  saveDesign: (...a) => saveDesign(...a),
  loadDesign: (...a) => loadDesign(...a),
  saveHistorySnapshot: (...a) => saveHistorySnapshot(...a),
}));

import useCloudPersistence from "./useCloudPersistence";

function makeLayers() {
  return [{ id: "layer-1-aaa", patternType: "spirograph", paramsCache: {} }];
}

function baseProps(overrides = {}) {
  return {
    user: { id: "user-1" },
    limits: { historySnapshots: 0 },
    layers: makeLayers(),
    canvasW: 800,
    canvasH: 1200,
    presetIndex: 2,
    bgColor: "#000000",
    loadLayerSet: vi.fn(),
    applyCanvasSize: vi.fn(),
    markCleanFrom: vi.fn(),
    canvasContainerRef: { current: null },
    ...overrides,
  };
}

describe("useCloudPersistence", () => {
  beforeEach(() => {
    saveDesign.mockReset();
    loadDesign.mockReset();
    saveHistorySnapshot.mockReset();
    saveHistorySnapshot.mockResolvedValue(undefined);
  });

  it("save: sends layers+dims+presetIndex config, then marks clean and records the design id", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(saveDesign).toHaveBeenCalledWith(
      "user-1",
      "Untitled",
      { layers: props.layers, canvasW: 800, canvasH: 1200, presetIndex: 2 },
      null,
      null // currentDesignId starts null
    );
    expect(props.markCleanFrom).toHaveBeenCalledWith(props.layers, "#000000");
    expect(result.current.currentDesignId).toBe("design-9");
  });

  it("save: settles saveState to 'saved' and records a numeric lastSavedAt on success", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    expect(result.current.saveState).toBe("idle");
    expect(result.current.lastSavedAt).toBe(null);

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(result.current.saveState).toBe("saved");
    expect(typeof result.current.lastSavedAt).toBe("number");
  });

  it("save: surfaces a rejected saveDesign as saveState 'error' + saveError (no silent swallow)", async () => {
    const boom = new Error("network down");
    saveDesign.mockRejectedValue(boom);
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(result.current.saveState).toBe("error");
    expect(result.current.saveError).toBe(boom);
    expect(result.current.lastSavedAt).toBe(null);
  });

  it("save: writes a history snapshot only when historySnapshots > 0", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });

    const noHistory = baseProps({ limits: { historySnapshots: 0 } });
    const { result: r1 } = renderHook(() => useCloudPersistence(noHistory));
    await act(async () => {
      await r1.current.handleSaveToCloud();
    });
    expect(saveHistorySnapshot).not.toHaveBeenCalled();

    const withHistory = baseProps({ limits: { historySnapshots: 5 } });
    const { result: r2 } = renderHook(() => useCloudPersistence(withHistory));
    await act(async () => {
      await r2.current.handleSaveToCloud();
    });
    expect(saveHistorySnapshot).toHaveBeenCalledTimes(1);
  });

  it("save: does nothing without a signed-in user", async () => {
    const props = baseProps({ user: null });
    const { result } = renderHook(() => useCloudPersistence(props));
    await act(async () => {
      await result.current.handleSaveToCloud();
    });
    expect(saveDesign).not.toHaveBeenCalled();
  });

  it("load: applies the saved layers + dims via applyCanvasSize and marks clean", async () => {
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    expect(props.loadLayerSet).toHaveBeenCalledTimes(1);
    expect(props.applyCanvasSize).toHaveBeenCalledWith(640, 480);
    expect(result.current.currentDesignId).toBe("design-7");
    expect(props.markCleanFrom).toHaveBeenCalled();
  });
});
