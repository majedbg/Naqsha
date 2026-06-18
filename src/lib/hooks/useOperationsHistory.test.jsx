// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useOperationsHistory from "./useOperationsHistory";
import {
  seedOperations,
  addOperation,
  reorderOperations,
  recolorOperation,
} from "../operations";

// A tiny harness simulating the layer-assignment side living OUTSIDE the hook
// (in real Studio it lives in useLayers). The hook captures/restores assignments
// through these callbacks so undo/redo covers assignment without owning layers.
function makeAssignmentStore(initial) {
  let map = { ...initial };
  return {
    capture: () => ({ ...map }),
    restore: (next) => {
      map = { ...next };
    },
    get: () => ({ ...map }),
    set: (layerId, operationId) => {
      map = { ...map, [layerId]: operationId };
    },
  };
}

function setup(assignments = {}) {
  const store = makeAssignmentStore(assignments);
  const hook = renderHook(() =>
    useOperationsHistory({
      initialOperations: seedOperations(),
      captureAssignments: store.capture,
      restoreAssignments: store.restore,
    })
  );
  return { hook, store };
}

describe("useOperationsHistory — focused undo/redo for operation library + assignment", () => {
  it("starts with the seeded library byte-identical to seedOperations()", () => {
    const { hook } = setup();
    expect(hook.result.current.operations).toEqual(seedOperations());
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("undo restores the prior library after a recolor; redo re-applies it", () => {
    const { hook } = setup();
    // Plotter-style editable recolor of the cut op.
    act(() => {
      hook.result.current.commitOperations((ops) =>
        recolorOperation(ops, "op-cut", "#123456")
      );
    });
    expect(
      hook.result.current.operations.find((o) => o.id === "op-cut").color
    ).toBe("#123456");
    expect(hook.result.current.canUndo).toBe(true);

    act(() => hook.result.current.undo());
    expect(
      hook.result.current.operations.find((o) => o.id === "op-cut").color
    ).toBe("#FF0000");
    expect(hook.result.current.canRedo).toBe(true);

    act(() => hook.result.current.redo());
    expect(
      hook.result.current.operations.find((o) => o.id === "op-cut").color
    ).toBe("#123456");
  });

  it("undo/redo covers add and reorder (cut order)", () => {
    const { hook } = setup();
    act(() => {
      hook.result.current.commitOperations((ops) =>
        addOperation(ops, { name: "Extra", process: "cut", color: "#00FF00" })
      );
    });
    expect(hook.result.current.operations).toHaveLength(4);
    act(() => {
      hook.result.current.commitOperations((ops) => reorderOperations(ops, 3, 0));
    });
    expect(hook.result.current.operations[0].name).toBe("Extra");
    expect(hook.result.current.operations[0].order).toBe(0);

    act(() => hook.result.current.undo()); // undo reorder
    expect(hook.result.current.operations[0].name).toBe("Cut");
    act(() => hook.result.current.undo()); // undo add
    expect(hook.result.current.operations).toHaveLength(3);
  });

  it("makes operation ASSIGNMENT undoable/redoable via capture/restore callbacks", () => {
    const { hook, store } = setup({ l1: "op-cut", l2: "op-cut" });
    // Assign l1 -> op-score, recording through the history boundary.
    act(() => {
      hook.result.current.commitAssignment(() => store.set("l1", "op-score"));
    });
    expect(store.get()).toEqual({ l1: "op-score", l2: "op-cut" });
    expect(hook.result.current.canUndo).toBe(true);

    act(() => hook.result.current.undo());
    // l1 restored; l2 untouched.
    expect(store.get()).toEqual({ l1: "op-cut", l2: "op-cut" });

    act(() => hook.result.current.redo());
    expect(store.get()).toEqual({ l1: "op-score", l2: "op-cut" });
  });

  it("a new commit after undo clears the redo stack (no branching)", () => {
    const { hook } = setup();
    act(() => {
      hook.result.current.commitOperations((ops) =>
        recolorOperation(ops, "op-cut", "#111111")
      );
    });
    act(() => hook.result.current.undo());
    expect(hook.result.current.canRedo).toBe(true);
    act(() => {
      hook.result.current.commitOperations((ops) =>
        recolorOperation(ops, "op-cut", "#222222")
      );
    });
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("resetHistory replaces operations and clears the stacks (profile switch, non-undoable)", () => {
    const { hook } = setup();
    act(() => {
      hook.result.current.commitOperations((ops) =>
        recolorOperation(ops, "op-cut", "#333333")
      );
    });
    expect(hook.result.current.canUndo).toBe(true);
    const remapped = seedOperations().map((o) => ({ ...o, color: "#abcabc" }));
    act(() => hook.result.current.resetHistory(remapped));
    expect(hook.result.current.operations).toEqual(remapped);
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });
});
