// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCallback, useEffect, useRef, useState } from "react";
import useLayers from "../useLayers";
import useCanvasSize from "../hooks/useCanvasSize";
import { addPanel, deletePanel } from "../panels";
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
  // recordBatch (mirrors Studio): fold a multi-slice user action into ONE entry.
  // Studio's handleDocumentSetupApply uses this around applyCanvasSize so a
  // Document Setup apply is a single undo entry.
  const recordBatch = useCallback((fn) => {
    const api = historyRef.current;
    if (!api || restoringRef.current) {
      fn();
      return;
    }
    api.beginCoalesce();
    try {
      fn();
    } finally {
      api.endCoalesce();
    }
  }, []);

  const layersApi = useLayers({
    persistToLocal: false,
    recordEdit,
    recordStructural,
  });

  // Canvas slice (mirrors useCanvasSize wiring + Studio's resize record site).
  const { captureCanvas, restoreCanvas, applyCanvasSize } = useCanvasSize({});
  const canvasRef = useRef(null);
  useEffect(() => {
    canvasRef.current = captureCanvas();
  }, [captureCanvas]);
  // Panel slice: useLayers owns panels/setPanels; these mirror Studio's
  // onAddPanel / onDeletePanel record sites (recordStructural BEFORE mutation).
  const panelsRef = useRef(layersApi.panels);
  useEffect(() => {
    panelsRef.current = layersApi.panels;
  }, [layersApi.panels]);
  const addPanelEntry = useCallback(() => {
    recordStructural();
    layersApi.setPanels((p) => addPanel(p));
  }, [layersApi, recordStructural]);
  const deletePanelEntry = useCallback(
    (id, opts) => {
      recordStructural();
      const { panels: np, layers: nl } = deletePanel(
        panelsRef.current,
        layersApi.layers,
        id,
        opts
      );
      layersApi.setPanels(np);
      layersApi.loadLayerSet(nl); // RAW loadLayerSet (structural edit, no clear)
    },
    [layersApi, recordStructural]
  );
  const resizeCanvas = useCallback(
    (w, h) => {
      recordBatch(() => applyCanvasSize(w, h));
    },
    [recordBatch, applyCanvasSize]
  );

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
  // customGlyphs slice — Studio's documentSnapshot embeds it, so this mirror does
  // too (P5-2: copy-on-use touches BOTH customGlyphs and a layer's glyphRef).
  const customGlyphsRef = useRef(layersApi.customGlyphs);
  useEffect(() => {
    customGlyphsRef.current = layersApi.customGlyphs;
  }, [layersApi.customGlyphs]);
  // P5-2: use a global-library glyph = COPY it into customGlyphs + rebind the
  // layer's glyphRef, folded into ONE undo entry via recordBatch (mirrors the
  // Studio onUseLibraryGlyph callback).
  const useLibraryGlyph = useCallback(
    (glyph, layerId, params) => {
      recordBatch(() => {
        if (!customGlyphsRef.current?.[glyph.id]) {
          layersApi.updateCustomGlyph(glyph.id, glyph);
        }
        layersApi.updateLayer(layerId, { params });
      });
    },
    [recordBatch, layersApi]
  );

  const capture = useCallback(
    () => ({
      layers: structuredClone(layersRef.current),
      operations: structuredClone(operationsRef.current),
      panels: structuredClone(panelsRef.current),
      canvas: canvasRef.current,
      customGlyphs: structuredClone(customGlyphsRef.current),
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
        layersApi.setPanels(s.panels);
        layersApi.setCustomGlyphs(s.customGlyphs ?? {});
        restoreCanvas(s.canvas);
      } finally {
        restoringRef.current = false;
      }
    },
    [layersApi, restoreCanvas]
  );

  const history = useHistory({ capture, restore });
  useEffect(() => {
    historyRef.current = history;
  });

  return {
    layersApi,
    history,
    operations,
    commitOperations,
    addPanelEntry,
    deletePanelEntry,
    resizeCanvas,
    useLibraryGlyph,
    canvasW: captureCanvas().w,
    // #139: the seam AnchorGhostOverlay drives for per-glyph undo granularity.
    flushEdit,
  };
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

  it("panel add is a discrete entry; undo restores the prior panel set", () => {
    const { result } = renderHook(() => useWired());
    const before = result.current.layersApi.panels.length;
    act(() => result.current.addPanelEntry());
    expect(result.current.layersApi.panels.length).toBe(before + 1);
    act(() => result.current.history.undo());
    expect(result.current.layersApi.panels.length).toBe(before);
    act(() => result.current.history.redo());
    expect(result.current.layersApi.panels.length).toBe(before + 1);
  });

  it("panel delete (panels + layer reassignment) is ONE undo entry", () => {
    const { result } = renderHook(() => useWired());
    // deletePanel is a no-op at 1 panel — add one so the delete actually mutates.
    act(() => result.current.addPanelEntry());
    const after = result.current.layersApi.panels.length;
    const victim = result.current.layersApi.panels[after - 1].id;
    // Assign a layer to the victim panel so the delete genuinely touches BOTH
    // slices (deleteLayers:false reassigns the layer to a surviving panel). This
    // proves the layer change rides the SAME entry as the panel removal.
    const layerId = result.current.layersApi.layers[0].id;
    act(() => result.current.layersApi.updateLayer(layerId, { panelId: victim }));
    expect(result.current.layersApi.layers[0].panelId).toBe(victim);

    act(() =>
      result.current.deletePanelEntry(victim, { deleteLayers: false })
    );
    expect(result.current.layersApi.panels.length).toBe(after - 1);
    expect(
      result.current.layersApi.panels.some((p) => p.id === victim)
    ).toBe(false);
    // The layer was reassigned off the deleted panel.
    expect(result.current.layersApi.layers[0].panelId).not.toBe(victim);
    // One undo brings BOTH the deleted panel AND the layer's panelId back.
    act(() => result.current.history.undo());
    expect(result.current.layersApi.panels.length).toBe(after);
    expect(
      result.current.layersApi.panels.some((p) => p.id === victim)
    ).toBe(true);
    expect(result.current.layersApi.layers[0].panelId).toBe(victim);
  });

  it("canvas resize via recordBatch is ONE undoable entry; undo restores the width", () => {
    const { result } = renderHook(() => useWired());
    const w0 = result.current.canvasW;
    const newW = w0 + 321;
    act(() => result.current.resizeCanvas(newW, newW));
    expect(result.current.canvasW).toBe(newW);
    expect(result.current.history.canUndo).toBe(true);
    // undo restores the pre-resize canvas slice (recordBatch captured before
    // applyCanvasSize ran).
    act(() => result.current.history.undo());
    expect(result.current.canvasW).toBe(w0);
    expect(result.current.history.canUndo).toBe(false);
    act(() => result.current.history.redo());
    expect(result.current.canvasW).toBe(newW);
    expect(result.current.history.canRedo).toBe(false);
  });

  it("P5-2: copy-on-use (library glyph → customGlyph copy + layer rebind) is ONE undo entry", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    const libGlyph = {
      id: "lib-uuid-1",
      name: "Vine",
      tradition: "imported",
      viewRadius: 10,
      root: { x: 0, y: 0, angle: 0 },
      paths: [{ d: "M0,0 L1,1", closed: false }],
    };
    // Precondition: the glyph is not yet in the document, layer has no glyphRef.
    expect(result.current.layersApi.customGlyphs["lib-uuid-1"]).toBeUndefined();

    act(() =>
      result.current.useLibraryGlyph(libGlyph, layerId, { glyphRef: "lib-uuid-1" })
    );
    // Both slices mutated: the glyph is copied in AND the layer is rebound.
    expect(result.current.layersApi.customGlyphs["lib-uuid-1"]?.name).toBe("Vine");
    expect(firstLayer(result).params.glyphRef).toBe("lib-uuid-1");
    expect(result.current.history.canUndo).toBe(true);

    // ONE ⌘Z reverts BOTH the copy and the rebind (single entry).
    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs["lib-uuid-1"]).toBeUndefined();
    expect(firstLayer(result).params?.glyphRef).toBeUndefined();
    // Exactly one entry existed → nothing more to undo.
    expect(result.current.history.canUndo).toBe(false);

    act(() => result.current.history.redo());
    expect(result.current.layersApi.customGlyphs["lib-uuid-1"]?.name).toBe("Vine");
    expect(firstLayer(result).params.glyphRef).toBe("lib-uuid-1");
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

// ── #139: per-glyph popover undo granularity ────────────────────────────────
//
// Charting decision 6 is "exactly one undo entry per gesture". That does NOT
// come for free: `updateLayer` records with the signature `${id}:params`, so
// EVERY binding write on a given layer looks identical to the coalescer and
// merges into whatever 400ms window is already open — including a window opened
// by an Inspector slider burst moments earlier.
//
// AnchorGhostOverlay therefore flushes once before a gesture's FIRST write and
// once when it COMMITS. These tests drive that pattern against the real
// useLayers + useHistory wiring; a component test with a mocked onUpdateLayer
// would pass while the real thing silently merged.
describe("S4 — per-glyph gesture granularity (#139)", () => {
  // What the overlay does: flush on the first write of a gesture, coalesced
  // live frames, flush on commit.
  function gesture(result, id, frames) {
    act(() => result.current.flushEdit());
    frames.forEach((patch) => {
      act(() => result.current.layersApi.updateLayer(id, patch));
    });
    act(() => result.current.flushEdit());
  }

  const depth = (result) => {
    let n = 0;
    while (result.current.history.canUndo) {
      act(() => result.current.history.undo());
      n += 1;
    }
    return n;
  };

  it("two gestures inside the 400ms idle window are TWO entries, not one", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    gesture(result, id, [{ opacity: 60 }]);
    // No timer advance: still well inside the idle window the second gesture
    // would otherwise join.
    gesture(result, id, [{ opacity: 70 }]);
    expect(depth(result)).toBe(2);
  });

  it("a drag's live frames stay ONE entry — coalescing is not defeated", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    gesture(result, id, [{ opacity: 60 }, { opacity: 65 }, { opacity: 70 }, { opacity: 75 }]);
    expect(depth(result)).toBe(1);
  });

  it("a preceding Inspector burst on the SAME layer cannot swallow the gesture", () => {
    // The signature is `${id}:params` either way, so without the leading flush
    // this is the case that silently merges.
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    act(() => result.current.layersApi.updateLayer(id, { opacity: 40 })); // inspector
    gesture(result, id, [{ opacity: 80 }]); // popover gesture, no timer advance
    expect(depth(result)).toBe(2);
  });

  it("undo after a gesture lands on the value from BEFORE that gesture", () => {
    const { result } = renderHook(() => useWired());
    const id = firstLayer(result).id;
    const original = firstLayer(result).opacity;
    gesture(result, id, [{ opacity: 60 }]);
    gesture(result, id, [{ opacity: 90 }]);
    expect(firstLayer(result).opacity).toBe(90);
    act(() => result.current.history.undo());
    expect(firstLayer(result).opacity).toBe(60);
    act(() => result.current.history.undo());
    expect(firstLayer(result).opacity).toBe(original);
  });

  it("a gesture that writes nothing (a no-op edit) leaves no entry at all", () => {
    // The overlay returns early when editBindingOverrides hands back the same
    // binding, so the flush pair never runs and history stays untouched.
    const { result } = renderHook(() => useWired());
    expect(result.current.history.canUndo).toBe(false);
    act(() => result.current.flushEdit());
    expect(result.current.history.canUndo).toBe(false);
  });
});
