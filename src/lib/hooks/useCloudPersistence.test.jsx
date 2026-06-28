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
import { draftKey, loadDraft, saveDraft } from "../localDraft";

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
    // No backoff in these unit tests: a rejected save settles to 'error'
    // immediately (Capability C retry is exercised in its own test file).
    retryDelays: [],
    ...overrides,
  };
}

describe("useCloudPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
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

  it("save: sends the current designName as the name arg (default 'Untitled', renameable)", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    expect(result.current.designName).toBe("Untitled");

    act(() => {
      result.current.setDesignName("My Mandala");
    });
    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(saveDesign).toHaveBeenCalledWith(
      "user-1",
      "My Mandala",
      expect.any(Object),
      null,
      null
    );
  });

  it("save: does nothing without a signed-in user", async () => {
    const props = baseProps({ user: null });
    const { result } = renderHook(() => useCloudPersistence(props));
    await act(async () => {
      await result.current.handleSaveToCloud();
    });
    expect(saveDesign).not.toHaveBeenCalled();
  });

  it("draft: a FAILED save stashes {config,name} under the namespaced draft key", async () => {
    saveDesign.mockRejectedValue(new Error("network down"));
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    act(() => result.current.setDesignName("Mandala"));
    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    // currentDesignId is still null → key namespace is 'new'.
    const draft = loadDraft(draftKey(null));
    expect(draft).not.toBe(null);
    expect(draft.name).toBe("Mandala");
    expect(draft.config.layers).toEqual(props.layers);
    expect(typeof draft.savedAt).toBe("number");
  });

  it("draft: a subsequent SUCCESSFUL save clears the stashed draft", async () => {
    const props = baseProps();
    // Pre-seed a draft as if a prior save had failed.
    saveDraft(draftKey(null), { config: {}, name: "old", savedAt: 1 });
    saveDesign.mockResolvedValue({ id: "design-9" });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    // Cleared under the key it was written to (the 'new' namespace).
    expect(loadDraft(draftKey(null))).toBe(null);
  });

  it("recovery: reads a pre-existing draft for the mount key into pendingDraft", () => {
    const seeded = {
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
      name: "Recovered",
      savedAt: 5,
    };
    saveDraft(draftKey(null), seeded);
    const { result } = renderHook(() => useCloudPersistence(baseProps()));
    expect(result.current.pendingDraft).toEqual(seeded);
  });

  it("recovery: pendingDraft is null when no draft exists", () => {
    const { result } = renderHook(() => useCloudPersistence(baseProps()));
    expect(result.current.pendingDraft).toBe(null);
  });

  it("recovery: recoverDraft applies the draft's config + name, clears it, and drops pendingDraft", () => {
    const layers = makeLayers();
    saveDraft(draftKey(null), {
      config: { layers, canvasW: 640, canvasH: 480 },
      name: "Recovered",
      savedAt: 5,
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    act(() => result.current.recoverDraft());

    expect(props.loadLayerSet).toHaveBeenCalledWith(layers);
    expect(props.applyCanvasSize).toHaveBeenCalledWith(640, 480);
    expect(result.current.designName).toBe("Recovered");
    expect(loadDraft(draftKey(null))).toBe(null);
    expect(result.current.pendingDraft).toBe(null);
  });

  it("recovery: a successful save dismisses a shown recovery banner (drops pendingDraft)", async () => {
    // Guards the data-loss path: if pendingDraft lingered after a clean save, a
    // later Recover click would clobber the just-saved work with a stale draft.
    saveDraft(draftKey(null), {
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
      name: "Stale",
      savedAt: 1,
    });
    saveDesign.mockResolvedValue({ id: "design-9" });
    const { result } = renderHook(() => useCloudPersistence(baseProps()));
    expect(result.current.pendingDraft).not.toBe(null);

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(result.current.pendingDraft).toBe(null);
  });

  it("recovery: discardDraft clears the draft + pendingDraft without applying config", () => {
    saveDraft(draftKey(null), {
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
      name: "Recovered",
      savedAt: 5,
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    act(() => result.current.discardDraft());

    expect(props.loadLayerSet).not.toHaveBeenCalled();
    expect(loadDraft(draftKey(null))).toBe(null);
    expect(result.current.pendingDraft).toBe(null);
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

  it("load: adopts the loaded design's name and settles state to 'saved'", async () => {
    loadDesign.mockResolvedValue({
      id: "design-7",
      name: "Saved Mandala",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    expect(result.current.designName).toBe("Saved Mandala");
    expect(result.current.saveState).toBe("saved");
    expect(typeof result.current.lastSavedAt).toBe("number");
  });

  it("load: keeps the default name when the loaded design has none, and clears a prior error", async () => {
    saveDesign.mockRejectedValue(new Error("boom"));
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    // First a failed save leaves saveState='error'.
    await act(async () => {
      await result.current.handleSaveToCloud();
    });
    expect(result.current.saveState).toBe("error");

    // Loading must not clobber the default name with undefined, and must clear
    // the stale error so a successful load doesn't render "Couldn't save".
    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });
    expect(result.current.designName).toBe("Untitled");
    expect(result.current.saveState).toBe("saved");
    expect(result.current.saveError).toBe(null);
  });

  it("rename: setDesignName marks the doc name-dirty; a successful save clears it and sends the new name", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    expect(result.current.nameDirty).toBe(false);

    act(() => {
      result.current.setDesignName("Renamed");
    });
    expect(result.current.nameDirty).toBe(true);

    await act(async () => {
      await result.current.handleSaveToCloud();
    });
    expect(result.current.nameDirty).toBe(false);
    expect(saveDesign).toHaveBeenCalledWith(
      "user-1",
      "Renamed",
      expect.any(Object),
      null,
      null
    );
  });

  it("rename: a failed save keeps name-dirty so the rename isn't silently lost", async () => {
    saveDesign.mockRejectedValue(new Error("boom"));
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    act(() => {
      result.current.setDesignName("Renamed");
    });
    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(result.current.saveState).toBe("error");
    expect(result.current.nameDirty).toBe(true);
  });

  // === Tier-2 cloud history persistence (undo-history-plan §7, S9) ===
  it("history: a MANUAL save embeds config.history (history.exportTail) in the saved config", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const tail = { v: 1, past: [{ a: 1 }], future: [], present: { a: 2 } };
    const getHistoryTail = vi.fn(() => tail);
    const props = baseProps({ getHistoryTail });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud({ manual: true });
    });

    expect(getHistoryTail).toHaveBeenCalledTimes(1);
    const sentConfig = saveDesign.mock.calls[0][2];
    expect(sentConfig.history).toEqual(tail);
    // The document slices still ride alongside the tail.
    expect(sentConfig.layers).toEqual(props.layers);
  });

  it("history: an AUTOSAVE (no-arg) save does NOT embed config.history", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const getHistoryTail = vi.fn(() => ({ v: 1, past: [], future: [] }));
    const props = baseProps({ getHistoryTail });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      // The autosave path calls handleSaveToCloud() with no args (manual:false).
      await result.current.handleSaveToCloud();
    });

    expect(getHistoryTail).not.toHaveBeenCalled();
    const sentConfig = saveDesign.mock.calls[0][2];
    expect(sentConfig.history).toBeUndefined();
  });

  it("history: a MANUAL save keeps the history-free config for saveHistorySnapshot (no tail bloat)", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const tail = { v: 1, past: [{ a: 1 }], future: [], present: { a: 2 } };
    // historySnapshots > 0 → the pro snapshot path runs.
    const props = baseProps({
      limits: { historySnapshots: 5 },
      getHistoryTail: () => tail,
    });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud({ manual: true });
    });

    expect(saveHistorySnapshot).toHaveBeenCalledTimes(1);
    const snapshotConfig = saveHistorySnapshot.mock.calls[0][2];
    expect(snapshotConfig.history).toBeUndefined();
    // But the primary design save DID carry the tail.
    expect(saveDesign.mock.calls[0][2].history).toEqual(tail);
  });

  it("history: a cloud LOAD forwards the embedded config.history to importHistoryTail", async () => {
    const embedded = { v: 1, past: [{ a: 1 }], future: [], present: { a: 2 } };
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480, history: embedded },
    });
    const importHistoryTail = vi.fn();
    const props = baseProps({ importHistoryTail });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    expect(importHistoryTail).toHaveBeenCalledTimes(1);
    expect(importHistoryTail).toHaveBeenCalledWith(embedded);
  });

  it("history: a cloud LOAD with no embedded history forwards undefined (importer drops)", async () => {
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
    });
    const importHistoryTail = vi.fn();
    const props = baseProps({ importHistoryTail });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    expect(importHistoryTail).toHaveBeenCalledWith(undefined);
  });

  it("rename: a successful load clears a pending name-dirty flag", async () => {
    loadDesign.mockResolvedValue({
      id: "design-7",
      name: "Loaded",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
    });
    const props = baseProps();
    const { result } = renderHook(() => useCloudPersistence(props));

    act(() => {
      result.current.setDesignName("Temp");
    });
    expect(result.current.nameDirty).toBe(true);

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });
    expect(result.current.nameDirty).toBe(false);
  });
});
