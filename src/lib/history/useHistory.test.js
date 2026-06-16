// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { historyReducer, initHistory, canUndo, canRedo, useHistory } from "./useHistory.js";

describe("historyReducer", () => {
  it("commit sets the new present and pushes the old present to past", () => {
    const state = initHistory("a");
    const next = historyReducer(state, { type: "commit", present: "b" });
    expect(next.present).toBe("b");
    expect(next.past).toEqual(["a"]);
    expect(next.future).toEqual([]);
  });

  it("undo restores the prior present and moves current present to future", () => {
    let state = initHistory("a");
    state = historyReducer(state, { type: "commit", present: "b" });
    const next = historyReducer(state, { type: "undo" });
    expect(next.present).toBe("a");
    expect(next.past).toEqual([]);
    expect(next.future).toEqual(["b"]);
  });

  it("redo re-applies an undone present and restores past/future", () => {
    let state = initHistory("a");
    state = historyReducer(state, { type: "commit", present: "b" });
    state = historyReducer(state, { type: "undo" });
    const next = historyReducer(state, { type: "redo" });
    expect(next.present).toBe("b");
    expect(next.past).toEqual(["a"]);
    expect(next.future).toEqual([]);
  });

  it("canUndo/canRedo reflect empty and non-empty past/future at boundaries", () => {
    const fresh = initHistory("a");
    expect(canUndo(fresh)).toBe(false);
    expect(canRedo(fresh)).toBe(false);

    const committed = historyReducer(fresh, { type: "commit", present: "b" });
    expect(canUndo(committed)).toBe(true);
    expect(canRedo(committed)).toBe(false);

    const undone = historyReducer(committed, { type: "undo" });
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);
  });

  it("a fresh commit after undo clears the future (no zombie redo)", () => {
    let state = initHistory("a");
    state = historyReducer(state, { type: "commit", present: "b" });
    state = historyReducer(state, { type: "undo" });
    expect(canRedo(state)).toBe(true);
    state = historyReducer(state, { type: "commit", present: "c" });
    expect(state.present).toBe("c");
    expect(state.future).toEqual([]);
    expect(canRedo(state)).toBe(false);
  });

  it("undo is a no-op with empty past and redo is a no-op with empty future", () => {
    const fresh = initHistory("a");
    expect(historyReducer(fresh, { type: "undo" })).toBe(fresh);
    expect(historyReducer(fresh, { type: "redo" })).toBe(fresh);
  });

  it("reset replaces the present and CLEARS past+future (loaded design = fresh baseline)", () => {
    let state = initHistory("a");
    state = historyReducer(state, { type: "commit", present: "b" });
    state = historyReducer(state, { type: "commit", present: "c" });
    expect(canUndo(state)).toBe(true);
    const reset = historyReducer(state, { type: "reset", present: "loaded" });
    expect(reset.present).toBe("loaded");
    expect(reset.past).toEqual([]);
    expect(reset.future).toEqual([]);
    expect(canUndo(reset)).toBe(false);
    expect(canRedo(reset)).toBe(false);
  });
});

describe("useHistory hook", () => {
  it("exposes present and supports a commit→undo→redo round trip with selectors", () => {
    const { result } = renderHook(() => useHistory("a"));

    expect(result.current.present).toBe("a");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.commit("b"));
    expect(result.current.present).toBe("b");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(result.current.present).toBe("a");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.present).toBe("b");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("reset() installs a loaded baseline and clears the undo/redo stacks", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.commit("b"));
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.reset("loaded"));
    expect(result.current.present).toBe("loaded");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
