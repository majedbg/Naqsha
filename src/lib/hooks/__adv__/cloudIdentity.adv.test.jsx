// @vitest-environment jsdom
// ADVERSARIAL CHARACTERIZATION (T4, T6) — the cloud design id is ephemeral
// React state, and first saves have no single-flight guard.
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
    retryDelays: [],
    ...overrides,
  };
}

describe("T4/T6 — cloud identity durability and concurrency", () => {
  beforeEach(() => {
    localStorage.clear();
    saveDesign.mockReset();
    loadDesign.mockReset();
    saveHistorySnapshot.mockReset();
    saveHistorySnapshot.mockResolvedValue(undefined);
  });

  it("T4: currentDesignId does not survive a remount (reload) — the next save INSERTS a duplicate (existingId null)", async () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR: currentDesignId lives only in
    // useState (useCloudPersistence.js:56). Nothing writes it to localStorage
    // (which DOES persist across the remount, as in a real reload), so after
    // F5 the very same document saves as a brand-new row.
    saveDesign.mockResolvedValue({ id: "design-1" });
    const first = renderHook(() => useCloudPersistence(baseProps()));

    await act(async () => {
      await first.result.current.handleSaveToCloud();
    });
    expect(first.result.current.currentDesignId).toBe("design-1");
    expect(saveDesign.mock.calls[0][4]).toBe(null); // first save: INSERT (expected)

    // Simulate reload: unmount, then mount the hook fresh. jsdom's
    // localStorage carries over — the id is simply never in it.
    first.unmount();
    const second = renderHook(() => useCloudPersistence(baseProps()));

    expect(second.result.current.currentDesignId).toBe(null); // identity lost

    await act(async () => {
      await second.result.current.handleSaveToCloud();
    });
    expect(saveDesign).toHaveBeenCalledTimes(2);
    // 5th arg (existingId) is null again → designService takes the INSERT
    // branch → a duplicate row for the same document.
    expect(saveDesign.mock.calls[1][4]).toBe(null);
  });

  it("T6: two concurrent FIRST saves both reach saveDesign with existingId null (double INSERT)", async () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR: handleSaveToCloud has no
    // single-flight guard of its own (the guard lives only in useAutosave's
    // inFlightRef, which does not cover manual/⌘S + flush overlap of this
    // handler). Both calls read currentDesignId === null from the same closure
    // and both take the INSERT branch.
    const resolvers = [];
    saveDesign.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve))
    );
    const { result } = renderHook(() => useCloudPersistence(baseProps()));

    let p1, p2;
    act(() => {
      p1 = result.current.handleSaveToCloud();
      p2 = result.current.handleSaveToCloud(); // fired before the first settles
    });

    expect(saveDesign).toHaveBeenCalledTimes(2);
    expect(saveDesign.mock.calls[0][4]).toBe(null);
    expect(saveDesign.mock.calls[1][4]).toBe(null); // second INSERT, not an update

    // Settle both so no state update leaks past the test.
    await act(async () => {
      resolvers.forEach((r) => r({ id: "design-1" }));
      await p1;
      await p2;
    });
  });
});
