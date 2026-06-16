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
    applyTextState: vi.fn(),
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

  it("save: sends layers+dims+presetIndex+bg+text config, then marks clean and records the design id", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(saveDesign).toHaveBeenCalledWith(
      "user-1",
      "Untitled",
      {
        layers: props.layers,
        canvasW: 800,
        canvasH: 1200,
        presetIndex: 2,
        bgColor: "#000000",
        textNodes: [],
        transforms: {},
      },
      null,
      null // currentDesignId starts null
    );
    expect(props.markCleanFrom).toHaveBeenCalledWith(props.layers, "#000000", {
      textNodes: [],
      transforms: {},
    });
    expect(result.current.currentDesignId).toBe("design-9");
  });

  it("save: persists text nodes + filters transforms to live ids", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const textNodes = [{ id: "text-1", text: "Hi", fontId: "work-sans" }];
    const transforms = {
      "layer-1-aaa": { x: 5, y: 0, rotation: 0, scale: 1 },
      "text-1": { x: 0, y: 7, rotation: 0, scale: 1 },
      "ghost-deleted": { x: 9, y: 9, rotation: 0, scale: 1 },
    };
    const props = baseProps({ textNodes, transforms });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    const config = saveDesign.mock.calls[0][2];
    expect(config.textNodes).toEqual(textNodes);
    // Stale transform of a deleted node is dropped; live layer + text kept.
    expect(config.transforms).toEqual({
      "layer-1-aaa": { x: 5, y: 0, rotation: 0, scale: 1 },
      "text-1": { x: 0, y: 7, rotation: 0, scale: 1 },
    });
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
    // A text-less saved design resets the interactive state to empty.
    expect(props.applyTextState).toHaveBeenCalledWith([], {});
  });

  it("load: restores persisted text nodes + transforms as the fresh baseline", async () => {
    const textNodes = [{ id: "text-1", text: "Hi", fontId: "work-sans" }];
    const transforms = { "text-1": { x: 0, y: 7, rotation: 0, scale: 1 } };
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480, textNodes, transforms },
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    expect(props.applyTextState).toHaveBeenCalledWith(textNodes, transforms);
  });
});
