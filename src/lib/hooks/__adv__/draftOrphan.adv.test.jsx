// @vitest-environment jsdom
// ADVERSARIAL CHARACTERIZATION (T5) — a failed-save recovery draft for an
// EXISTING design is undiscoverable after reload.
//
// TEMPORARY test for the project-saving architecture review.
//
// Mechanism: the recovery mount key is frozen at mount from currentDesignId,
// which is ALWAYS null at mount (useCloudPersistence.js:81
// `useState(() => draftKey(currentDesignId))` → 'sonoform-cloud-draft:new').
// A failed save for a LOADED design writes its draft under
// 'sonoform-cloud-draft:<id>' (draftKey captured at call time, line 153) —
// a key no mount ever reads. Combined with T4 (the id itself doesn't survive
// reload), the draft is orphaned forever.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
    retryDelays: [], // no backoff — a rejected save settles immediately
    ...overrides,
  };
}

describe("T5 — failed-save draft for an existing design is orphaned after reload", () => {
  let consoleErr;
  beforeEach(() => {
    localStorage.clear();
    saveDesign.mockReset();
    loadDesign.mockReset();
    saveHistorySnapshot.mockReset();
    saveHistorySnapshot.mockResolvedValue(undefined);
    // The failure path logs 'Cloud save failed:' — silence it for clean output.
    consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErr.mockRestore();
  });

  it("T5: draft written under sonoform-cloud-draft:<id>; a fresh mount reads only :new → pendingDraft null, key orphaned", async () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR.
    // Step 1: load an existing design so currentDesignId is set.
    loadDesign.mockResolvedValue({
      id: "design-1",
      name: "Loaded",
      config: { layers: makeLayers(), canvasW: 640, canvasH: 480 },
    });
    const first = renderHook(() => useCloudPersistence(baseProps()));
    await act(async () => {
      await first.result.current.handleLoadCloudDesign("design-1");
    });
    expect(first.result.current.currentDesignId).toBe("design-1");

    // Step 2: the next save fails → the safety-net draft is stashed under the
    // id-namespaced key.
    saveDesign.mockRejectedValue(new Error("network down"));
    await act(async () => {
      await first.result.current.handleSaveToCloud();
    });
    expect(first.result.current.saveState).toBe("error");
    const idKey = "sonoform-cloud-draft:design-1";
    expect(localStorage.getItem(idKey)).not.toBe(null);
    expect(JSON.parse(localStorage.getItem(idKey)).name).toBe("Loaded");

    // Step 3: reload (unmount + fresh mount; localStorage persists).
    first.unmount();
    const second = renderHook(() => useCloudPersistence(baseProps()));

    // The mount key is frozen as 'sonoform-cloud-draft:new' — the id-keyed
    // draft is never offered for recovery…
    expect(second.result.current.pendingDraft).toBe(null);
    // …yet it is still sitting in localStorage, orphaned forever (nothing
    // else ever reads or clears this key on this path).
    expect(localStorage.getItem(idKey)).not.toBe(null);
    expect(localStorage.getItem("sonoform-cloud-draft:new")).toBe(null);
  });
});
