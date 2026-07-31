// @vitest-environment jsdom
// ADVERSARIAL CHARACTERIZATION (T3, T7) — what the cloud config carries, and
// how a null saveDesign result is reported.
//
// TEMPORARY tests for the project-saving architecture review.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

const saveDesign = vi.fn();
const loadDesign = vi.fn();
const saveHistorySnapshot = vi.fn(() => Promise.resolve());
vi.mock("../../designService", () => ({
  saveDesign: (...a) => saveDesign(...a),
  loadDesign: (...a) => loadDesign(...a),
  saveHistorySnapshot: (...a) => saveHistorySnapshot(...a),
}));

import useCloudPersistence from "../useCloudPersistence";
import { draftKey, saveDraft, loadDraft } from "../../localDraft";

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
    bgColor: "#123456", // deliberately non-default: proves it's dropped, not defaulted
    panels: makePanels(),
    setPanels: vi.fn(),
    customGlyphs: { "cg-1": { id: "cg-1", name: "G", paths: [], viewRadius: 1 } },
    optimizations: { applied: [] },
    loadLayerSet: vi.fn(),
    applyCanvasSize: vi.fn(),
    markCleanFrom: vi.fn(),
    canvasContainerRef: { current: null },
    retryDelays: [],
    ...overrides,
  };
}

describe("T3/T7 — the whole-document round trip through the cloud config", () => {
  beforeEach(() => {
    localStorage.clear();
    saveDesign.mockReset();
    loadDesign.mockReset();
    saveHistorySnapshot.mockReset();
    saveHistorySnapshot.mockResolvedValue(undefined);
  });

  it("T3: the saved config carries EXACTLY {layers, canvasW, canvasH, presetIndex, panels, customGlyphs, optimizations} — bgColor/unit/margin/outputMode/operations do NOT round-trip", async () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR: bgColor is an input to the hook
    // (it feeds markCleanFrom — it IS part of the dirty signal, T1b) yet is
    // absent from the persisted document. unit / margin / machine profile
    // (outputMode) / the Operation library are not inputs at all, so a cloud
    // reload cannot restore them from the design row.
    saveDesign.mockResolvedValue({ id: "design-9" });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(saveDesign).toHaveBeenCalledTimes(1);
    const config = saveDesign.mock.calls[0][2];

    // Exact present-key set (autosave path; a manual save may add `history`).
    expect(Object.keys(config).sort()).toEqual(
      [
        "canvasH",
        "canvasW",
        "customGlyphs",
        "layers",
        "optimizations",
        "panels",
        "presetIndex",
      ].sort()
    );
    expect(config.layers).toBe(props.layers);
    expect(config.panels).toBe(props.panels);

    // Explicit ABSENCE assertions — this is what does NOT round-trip:
    expect("bgColor" in config).toBe(false); // dirty-tracked (T1b) yet never saved
    expect("unit" in config).toBe(false); // mm/in document unit
    expect("margin" in config).toBe(false); // document margin
    expect("outputMode" in config).toBe(false); // machine profile
    expect("machineProfile" in config).toBe(false);
    expect("operations" in config).toBe(false); // the Operation library
  });

  it("T7: saveDesign resolving null still reports 'saved', keeps currentDesignId null, and clears the local safety-net draft", async () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR / latent interface hazard:
    // designService.saveDesign returns null when `supabase` is not configured
    // (src/lib/designService.js:4 `if (!supabase) return null;`). The hook
    // treats a resolved null as SUCCESS: saveState -> 'saved', lastSavedAt
    // stamped, and — worst — the local draft (the only surviving copy of the
    // work) is CLEARED, while no design row exists and no id was assigned.
    saveDesign.mockResolvedValue(null);
    // Pre-seed a draft as if a prior save had failed: the 'saved' path drops it.
    saveDraft(draftKey(null), { config: { layers: makeLayers() }, name: "old", savedAt: 1 });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(result.current.saveState).toBe("saved"); // reported as saved…
    expect(typeof result.current.lastSavedAt).toBe("number");
    expect(result.current.currentDesignId).toBe(null); // …but nothing was persisted
    expect(props.markCleanFrom).not.toHaveBeenCalled(); // (only id/clean-marking is skipped)
    expect(loadDraft(draftKey(null))).toBe(null); // and the safety-net draft is gone
  });
});
