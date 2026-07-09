// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Run Plan — applied-Optimization persistence in the document blob (PRD #73,
// ADR 0002). The plan's APPLIED optimize values persist WITH the document (cloud
// round-trip + local failed-save recovery draft), migration default "none
// applied" for old blobs. They ride the same `config` object as layers/panels/
// customGlyphs — a sibling field embedded verbatim on save and forwarded to the
// hydrate seam on load/recover (mirrors the customGlyphs + importHistoryTail
// precedents). They deliberately stay OUT of the ⌘Z undo snapshot.

const saveDesign = vi.fn();
const loadDesign = vi.fn();
const saveHistorySnapshot = vi.fn(() => Promise.resolve());
vi.mock("../designService", () => ({
  saveDesign: (...a) => saveDesign(...a),
  loadDesign: (...a) => loadDesign(...a),
  saveHistorySnapshot: (...a) => saveHistorySnapshot(...a),
}));

import useCloudPersistence from "./useCloudPersistence";
import { draftKey, saveDraft } from "../localDraft";

function makeLayers() {
  return [{ id: "layer-1-aaa", patternType: "spirograph", paramsCache: {} }];
}

// The applied-only snapshot the persistence layer receives (preview tolerance
// already stripped by useOptimizations.serializeApplied).
function makeApplied() {
  return {
    simplify: { enabled: true, appliedTolerance: 0.42 },
    merge: { enabled: false, appliedTolerance: null },
    reorder: { enabled: true },
  };
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
    retryDelays: [],
    ...overrides,
  };
}

describe("useCloudPersistence — applied optimizations", () => {
  beforeEach(() => {
    localStorage.clear();
    saveDesign.mockReset();
    loadDesign.mockReset();
    saveHistorySnapshot.mockReset();
    saveHistorySnapshot.mockResolvedValue(undefined);
  });

  it("save: embeds the passed applied optimizations verbatim in the saved config", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const optimizations = makeApplied();
    const props = baseProps({ optimizations });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    expect(saveDesign).toHaveBeenCalledWith(
      "user-1",
      "Untitled",
      expect.objectContaining({ optimizations }),
      null,
      null
    );
  });

  it("save: a doc with no applied-optimizations prop carries no optimizations field (back-compat)", async () => {
    saveDesign.mockResolvedValue({ id: "design-9" });
    const props = baseProps(); // no optimizations prop
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    const sentConfig = saveDesign.mock.calls[0][2];
    expect(sentConfig.optimizations).toBeUndefined();
  });

  it("load: forwards config.optimizations to the hydrate seam (applied values survive a cloud round-trip)", async () => {
    const optimizations = makeApplied();
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480, optimizations },
    });
    const hydrateOptimizations = vi.fn();
    const props = baseProps({ hydrateOptimizations });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    expect(hydrateOptimizations).toHaveBeenCalledTimes(1);
    expect(hydrateOptimizations).toHaveBeenCalledWith(optimizations);
  });

  it("load: an OLD design without the optimizations field forwards undefined so the seam migrates to 'none applied'", async () => {
    loadDesign.mockResolvedValue({
      id: "design-7",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 }, // NO optimizations
    });
    const hydrateOptimizations = vi.fn();
    const props = baseProps({ hydrateOptimizations });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleLoadCloudDesign("design-7");
    });

    expect(hydrateOptimizations).toHaveBeenCalledWith(undefined);
  });

  it("draft: a FAILED save stashes the applied optimizations in the recovery draft config", async () => {
    saveDesign.mockRejectedValue(new Error("network down"));
    const optimizations = makeApplied();
    const props = baseProps({ optimizations });
    const { result } = renderHook(() => useCloudPersistence(props));

    await act(async () => {
      await result.current.handleSaveToCloud();
    });

    const draft = JSON.parse(localStorage.getItem(draftKey(null)));
    expect(draft.config.optimizations).toEqual(optimizations);
  });

  it("recover: forwards the draft's applied optimizations to the hydrate seam", () => {
    const optimizations = makeApplied();
    saveDraft(draftKey(null), {
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480, optimizations },
      name: "Recovered",
      savedAt: 5,
    });
    const hydrateOptimizations = vi.fn();
    const props = baseProps({ hydrateOptimizations });
    const { result } = renderHook(() => useCloudPersistence(props));

    act(() => result.current.recoverDraft());

    expect(hydrateOptimizations).toHaveBeenCalledWith(optimizations);
  });
});
