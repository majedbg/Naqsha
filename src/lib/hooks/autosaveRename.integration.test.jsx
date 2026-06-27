// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCallback } from "react";
import { renderHook, act } from "@testing-library/react";

// Integration smoke (Rec 2 slice 9): compose the REAL useCloudPersistence +
// useAutosave the way Studio.jsx does, and prove the rename path persists — a
// rename marks name-dirty, the combined dirty trigger re-schedules autosave, and
// the debounced fire sends the NEW name through the single save path. This is
// the contract Studio relies on; it avoids rendering the full shell.
const saveDesign = vi.fn();
const loadDesign = vi.fn();
const saveHistorySnapshot = vi.fn(() => Promise.resolve());
vi.mock("../designService", () => ({
  saveDesign: (...a) => saveDesign(...a),
  loadDesign: (...a) => loadDesign(...a),
  saveHistorySnapshot: (...a) => saveHistorySnapshot(...a),
}));

import useCloudPersistence from "./useCloudPersistence";
import useAutosave from "./useAutosave";

function makeLayers() {
  return [{ id: "layer-1-aaa", patternType: "spirograph", paramsCache: {} }];
}

// Mirrors Studio's wiring: enabled=!!user, hasDesignId=!!currentDesignId,
// isDirty = layer-dirty OR name-dirty, save = handleSaveToCloud, isSaving from
// saveState.
function useStudioLike(layerDirty) {
  const cloud = useCloudPersistence({
    user: { id: "u1" },
    limits: { historySnapshots: 0 },
    layers: makeLayers(),
    canvasW: 800,
    canvasH: 1200,
    presetIndex: 0,
    bgColor: "#000000",
    loadLayerSet: vi.fn(),
    applyCanvasSize: vi.fn(),
    markCleanFrom: vi.fn(),
    canvasContainerRef: { current: null },
  });
  const combinedIsDirty = useCallback(
    () => layerDirty() || cloud.nameDirty,
    [layerDirty, cloud.nameDirty]
  );
  useAutosave({
    enabled: true,
    hasDesignId: !!cloud.currentDesignId,
    isDirty: combinedIsDirty,
    save: cloud.handleSaveToCloud,
    isSaving: cloud.saveState === "saving",
    debounceMs: 1000,
  });
  return cloud;
}

describe("autosave + rename integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveDesign.mockReset();
    loadDesign.mockReset();
    saveHistorySnapshot.mockReset();
    saveHistorySnapshot.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renaming a saved design autosaves the new name through the single save path", async () => {
    saveDesign.mockResolvedValue({ id: "d1" });
    const layerDirty = () => false;
    const { result } = renderHook(() => useStudioLike(layerDirty));

    // Explicit first save establishes the cloud id (autosave is gated until then).
    await act(async () => {
      await result.current.handleSaveToCloud();
    });
    expect(result.current.currentDesignId).toBe("d1");
    saveDesign.mockClear();

    // Rename only (no layer edit) → name-dirty → autosave reschedules.
    act(() => {
      result.current.setDesignName("Renamed");
    });
    expect(result.current.nameDirty).toBe(true);

    // Quiet period elapses → debounced save fires with the new name + existing id.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {}); // flush handleSaveToCloud's microtasks

    expect(saveDesign).toHaveBeenCalledWith(
      "u1",
      "Renamed",
      expect.any(Object),
      null,
      "d1"
    );
    expect(result.current.nameDirty).toBe(false); // cleared on success
  });

  it("does not autosave a rename before the first explicit save (no design id)", async () => {
    const layerDirty = () => false;
    const { result } = renderHook(() => useStudioLike(layerDirty));

    act(() => {
      result.current.setDesignName("Renamed");
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(saveDesign).not.toHaveBeenCalled();
  });
});
