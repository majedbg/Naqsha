// @vitest-environment jsdom
// Rec 3 / Capability C — auto-retry transient cloud-save failures with backoff
// before surfacing 'error'. Stays on the ONE save path (inside the hook). A
// rejected saveDesign is retried per `retryDelays`; only when every attempt
// fails does saveState become 'error' (and the Capability-B draft is written).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
import { draftKey, loadDraft } from "../localDraft";

function baseProps(overrides = {}) {
  return {
    user: { id: "user-1" },
    limits: { historySnapshots: 0 },
    layers: [{ id: "l1", patternType: "spirograph", paramsCache: {} }],
    canvasW: 800,
    canvasH: 1200,
    presetIndex: 2,
    bgColor: "#000000",
    loadLayerSet: vi.fn(),
    applyCanvasSize: vi.fn(),
    markCleanFrom: vi.fn(),
    canvasContainerRef: { current: null },
    retryDelays: [400, 1200],
    ...overrides,
  };
}

describe("useCloudPersistence — retry/backoff (Rec 3 / C)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    saveDesign.mockReset();
    saveHistorySnapshot.mockReset();
    saveHistorySnapshot.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("retries a transient failure after backoff and settles 'saved' (no error, no draft)", async () => {
    saveDesign
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce({ id: "design-9" });
    const { result } = renderHook(() => useCloudPersistence(baseProps()));

    let p;
    act(() => {
      p = result.current.handleSaveToCloud();
    });
    // Still 'saving' after the first failure — not surfaced as error.
    expect(result.current.saveState).toBe("saving");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400); // first backoff elapses → retry
    });
    await act(async () => {
      await p;
    });

    expect(saveDesign).toHaveBeenCalledTimes(2);
    expect(result.current.saveState).toBe("saved");
    expect(loadDraft(draftKey(null))).toBe(null);
  });

  it("after exhausting all retries: settles 'error' and writes the safety-net draft", async () => {
    saveDesign.mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useCloudPersistence(baseProps()));

    let p;
    act(() => {
      p = result.current.handleSaveToCloud();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400); // retry #1
    });
    expect(result.current.saveState).toBe("saving"); // still retrying
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200); // retry #2
    });
    await act(async () => {
      await p;
    });

    expect(saveDesign).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(result.current.saveState).toBe("error");
    expect(loadDraft(draftKey(null))).not.toBe(null);
  });
});
