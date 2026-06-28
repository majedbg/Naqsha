// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCallback, useEffect, useRef, useState } from "react";
import useLayers from "../useLayers";
import useHistory from "./useHistory";

// S4 — the record sites against the REAL async path. This wires useLayers +
// useHistory exactly as Studio does (the same record-injection + restore-guard
// pattern) so the off-by-one hazard (§3.1) is exercised through real setState
// lag, which the isolated round-trip (I1) cannot catch.
//
// The killer assertion: drive a genuine `updateLayer` through setState, then
// undo WITHOUT advancing the idle timer (the real ⌘Z-mid-edit case). A
// capture-AFTER-mutation bug would snapshot the stale post-edit value and undo
// would restore the wrong state. Capture-before lands on the true prior value.

function useWired() {
  const historyRef = useRef(null);
  const restoringRef = useRef(false);
  const editKeyRef = useRef(null);

  const flushEdit = useCallback(() => {
    if (editKeyRef.current !== null) {
      editKeyRef.current = null;
      historyRef.current?.endCoalesce();
    }
  }, []);
  const recordEdit = useCallback((signature) => {
    if (restoringRef.current) return;
    const api = historyRef.current;
    if (!api) return;
    if (editKeyRef.current !== null && editKeyRef.current !== signature) {
      api.endCoalesce();
    }
    editKeyRef.current = signature;
    api.beginCoalesce({ idleMs: 400 });
  }, []);
  const recordStructural = useCallback(() => {
    if (restoringRef.current) return;
    flushEdit();
    historyRef.current?.record();
  }, [flushEdit]);

  const layersApi = useLayers({
    persistToLocal: false,
    recordEdit,
    recordStructural,
  });

  // Operations slice (mirrors S5: plain Studio state, commitOperations records a
  // discrete entry then applies the mapper; restoreOperations is setOperations).
  const [operations, setOperations] = useState([{ id: "op-cut", color: "#FF0000" }]);
  const operationsRef = useRef(operations);
  useEffect(() => {
    operationsRef.current = operations;
  }, [operations]);
  const commitOperations = useCallback(
    (mapper) => {
      recordStructural();
      setOperations((ops) => mapper(ops));
    },
    [recordStructural]
  );

  const layersRef = useRef(layersApi.layers);
  useEffect(() => {
    layersRef.current = layersApi.layers;
  }, [layersApi.layers]);

  const capture = useCallback(
    () => ({
      layers: structuredClone(layersRef.current),
      operations: structuredClone(operationsRef.current),
    }),
    []
  );
  // restore replays via loadLayerSet AND a per-layer updateLayer (mirroring
  // Studio's restoreAssignments) so the I6 self-record guard is genuinely
  // exercised: those updateLayer calls must NOT record while restoring.
  const restore = useCallback(
    (s) => {
      restoringRef.current = true;
      try {
        layersApi.loadLayerSet(s.layers);
        for (const l of s.layers) {
          layersApi.updateLayer(l.id, { operationId: l.operationId });
        }
        setOperations(s.operations);
      } finally {
        restoringRef.current = false;
      }
    },
    [layersApi]
  );

  const history = useHistory({ capture, restore });
  useEffect(() => {
    historyRef.current = history;
  });

  return { layersApi, history, operations, commitOperations };
}

function firstLayer(result) {
  return result.current.layersApi.layers[0];
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("S4 record sites — real async path", () => {
  it("OFF-BY-ONE: undo within the idle window restores the true pre-edit value", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    expect(firstLayer(result).opacity).toBe(100);

    act(() => result.current.layersApi.updateLayer(id, { opacity: 40 }));
    expect(firstLayer(result).opacity).toBe(40);

    // ⌘Z mid-edit — NO timer advance. Engine flushes the open burst then undoes.
    act(() => result.current.history.undo());
    expect(firstLayer(result).opacity).toBe(100); // capture-after bug → 40 here

    act(() => result.current.history.redo());
    expect(firstLayer(result).opacity).toBe(40);
  });

  it("coalesces a slider burst on one field into a single undo entry", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    for (let v = 10; v <= 60; v += 10) {
      act(() => result.current.layersApi.updateLayer(id, { opacity: v }));
    }
    expect(firstLayer(result).opacity).toBe(60);
    act(() => result.current.history.undo()); // ONE entry for the whole burst
    expect(firstLayer(result).opacity).toBe(100);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("switching field flushes the prior burst (two entries)", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    act(() => result.current.layersApi.updateLayer(id, { opacity: 50 }));
    act(() => result.current.layersApi.updateLayer(id, { color: "#abcdef" })); // new signature → flush
    expect(firstLayer(result).opacity).toBe(50);
    expect(firstLayer(result).color).toBe("#abcdef");

    act(() => result.current.history.undo()); // undo the color edit
    expect(firstLayer(result).color).not.toBe("#abcdef");
    expect(firstLayer(result).opacity).toBe(50);
    act(() => result.current.history.undo()); // undo the opacity edit
    expect(firstLayer(result).opacity).toBe(100);
  });

  it("structural op (add) is a discrete entry; undo removes the added layer", () => {
    const { result } = renderHook(() => useWired());
    expect(result.current.layersApi.layers).toHaveLength(1);
    act(() => result.current.layersApi.addLayer());
    expect(result.current.layersApi.layers).toHaveLength(2);
    act(() => result.current.history.undo());
    expect(result.current.layersApi.layers).toHaveLength(1);
    act(() => result.current.history.redo());
    expect(result.current.layersApi.layers).toHaveLength(2);
  });

  it("I6 — restore replaying via updateLayer never self-records", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    act(() => result.current.layersApi.updateLayer(id, { opacity: 25 }));
    act(() => result.current.history.undo()); // restore() calls updateLayer internally
    // If restore had self-recorded, a phantom entry would sit in past; advancing
    // the idle timer would then leave canUndo true. The guard must prevent that.
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.history.canRedo).toBe(true);
    expect(firstLayer(result).opacity).toBe(100);
  });

  it("I2 — a non-edit interaction never clears the redo stack", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    act(() => result.current.layersApi.updateLayer(id, { opacity: 30 }));
    act(() => result.current.history.undo());
    expect(result.current.history.canRedo).toBe(true);
    // A non-edit interaction (selecting a layer, idle time passing) records
    // nothing — selection is not part of the snapshot (D1) — so redo survives.
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.history.canRedo).toBe(true);
    act(() => result.current.history.redo());
    expect(firstLayer(result).opacity).toBe(30);
  });

  it("commitOperations is undoable (operations absorbed into the unified engine)", () => {
    const { result } = renderHook(() => useWired());
    expect(result.current.operations[0].color).toBe("#FF0000");
    act(() =>
      result.current.commitOperations((ops) =>
        ops.map((o) => (o.id === "op-cut" ? { ...o, color: "#123456" } : o))
      )
    );
    expect(result.current.operations[0].color).toBe("#123456");
    act(() => result.current.history.undo());
    expect(result.current.operations[0].color).toBe("#FF0000");
    act(() => result.current.history.redo());
    expect(result.current.operations[0].color).toBe("#123456");
  });

  it("I9 — clear() (profile-switch semantics) drops all history", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    act(() => result.current.layersApi.updateLayer(id, { opacity: 70 }));
    act(() =>
      result.current.commitOperations((ops) =>
        ops.map((o) => ({ ...o, color: "#000000" }))
      )
    );
    expect(result.current.history.canUndo).toBe(true);
    act(() => result.current.history.clear()); // profile switch
    expect(result.current.history.canUndo).toBe(false);
    expect(result.current.history.canRedo).toBe(false);
  });
});
