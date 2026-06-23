// @vitest-environment jsdom
// WI-2 Naqsha Panels: cloud persistence carries `panels` at both seams.
// Mirrors useCloudPersistence.test.jsx mocking style. We do NOT mock ../panels
// — normalizePanels is a tested pure fn, so we cross-reference the real
// partition it produces rather than asserting on a (random) panel id.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

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

function makePanels() {
  return [
    {
      id: "panel-1-zzz",
      name: "Panel 1",
      substrate: { kind: "acrylic", thickness: 3, color: "#cccccc" },
      visible: true,
      order: 0,
    },
  ];
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
    panels: makePanels(),
    setPanels: vi.fn(),
    loadLayerSet: vi.fn(),
    applyCanvasSize: vi.fn(),
    markCleanFrom: vi.fn(),
    canvasContainerRef: { current: null },
    ...overrides,
  };
}

describe("useCloudPersistence — panels", () => {
  beforeEach(() => {
    saveDesign.mockReset();
    loadDesign.mockReset();
    saveHistorySnapshot.mockReset();
    saveHistorySnapshot.mockResolvedValue(undefined);
  });

  it("save: includes panels verbatim in the saved config", async () => {
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
        panels: props.panels,
      },
      null,
      null
    );
  });

  it("save (Pro): the same config with panels flows to saveHistorySnapshot", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const props = baseProps({ limits: { historySnapshots: 5 } });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(saveHistorySnapshot).toHaveBeenCalledTimes(1);
    expect(saveHistorySnapshot).toHaveBeenCalledWith(
      "design-9",
      "user-1",
      {
        layers: props.layers,
        canvasW: 800,
        canvasH: 1200,
        presetIndex: 2,
        panels: props.panels,
      },
      null
    );
  });

  it("load: reads config.panels and applies the normalized partition", async () => {
    const savedLayers = makeLayers();
    const savedPanels = makePanels();
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: savedLayers, canvasW: 640, canvasH: 480, panels: savedPanels },
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    expect(props.setPanels).toHaveBeenCalledTimes(1);
    const appliedPanels = props.setPanels.mock.calls[0][0];
    expect(appliedPanels).toEqual(savedPanels);

    // layers loaded with a valid partition pointing at the applied panel
    expect(props.loadLayerSet).toHaveBeenCalledTimes(1);
    const appliedLayers = props.loadLayerSet.mock.calls[0][0];
    const validIds = new Set(appliedPanels.map((p) => p.id));
    expect(appliedLayers.every((l) => validIds.has(l.panelId))).toBe(true);
  });

  it("load: legacy design with no panels key seeds Panel 1 and assigns every layer to it", async () => {
    const savedLayers = makeLayers();
    loadDesign.mockResolvedValue({
      id: "design-legacy",
      config: { layers: savedLayers, canvasW: 640, canvasH: 480 }, // NO panels
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-legacy");
    });

    expect(props.setPanels).toHaveBeenCalledTimes(1);
    const appliedPanels = props.setPanels.mock.calls[0][0];
    expect(appliedPanels).toHaveLength(1);
    expect(appliedPanels[0].name).toBe("Panel 1");

    const appliedLayers = props.loadLayerSet.mock.calls[0][0];
    expect(appliedLayers.length).toBe(savedLayers.length);
    expect(appliedLayers.every((l) => l.panelId === appliedPanels[0].id)).toBe(true);

    expect(props.markCleanFrom).toHaveBeenCalledWith(appliedLayers, "#000000");
  });

  it("load: succeeds when setPanels is not injected (optional-call guard)", async () => {
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480, panels: makePanels() },
    });
    const props = baseProps({ setPanels: undefined });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    // no throw; layers still applied
    expect(props.loadLayerSet).toHaveBeenCalledTimes(1);
    expect(result.current.currentDesignId).toBe("design-7");
  });
});
