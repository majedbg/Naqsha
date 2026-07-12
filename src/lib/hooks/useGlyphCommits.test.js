// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCallback, useEffect, useRef } from "react";
import useLayers from "../useLayers";
import useHistory from "../history/useHistory";
import useGlyphCommits from "./useGlyphCommits";

// useGlyphCommits is the Wave 1 write-owner (motif-session-ORCHESTRATOR.md,
// issue #77): every `customGlyphs` + `glyphRef` write in the app is meant to
// funnel through it, so a Glyph Commit (CONTEXT.md "Motifs") is ALWAYS one
// undo entry — never the two-entry `bindLayerTo(addCustomGlyph(...))` Studio's
// modal IIFE does today.
//
// Modeled on recordSites.integration.test.jsx: wire the REAL useLayers +
// useHistory (recordBatch backed by genuine beginCoalesce/endCoalesce), not a
// mocked recordBatch that would trivially "prove" atomicity by construction.

function useWired() {
  const historyRef = useRef(null);
  const restoringRef = useRef(false);
  const editKeyRef = useRef(null);

  // BOTH real recorders must be wired (exactly as recordSites.integration.test
  // does) for the atomicity tests to DISCRIMINATE: `updateLayer` records
  // exclusively via recordEdit (useLayers.js ~562), so a harness without it
  // never produces the second history entry recordBatch exists to fold away —
  // the one-entry assertions would pass even with recordBatch stripped from
  // the hook (found by adversarial review of the first cut of this file).
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
  // recordBatch (mirrors Studio + recordSites.integration.test.jsx): fold a
  // multi-slice write into ONE history entry via begin/endCoalesce.
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

  const layersApi = useLayers({ persistToLocal: false, recordEdit, recordStructural });

  const layersRef = useRef(layersApi.layers);
  useEffect(() => {
    layersRef.current = layersApi.layers;
  }, [layersApi.layers]);
  const customGlyphsRef = useRef(layersApi.customGlyphs);
  useEffect(() => {
    customGlyphsRef.current = layersApi.customGlyphs;
  }, [layersApi.customGlyphs]);

  const capture = useCallback(
    () => ({
      layers: structuredClone(layersRef.current),
      customGlyphs: structuredClone(customGlyphsRef.current),
    }),
    []
  );
  const restore = useCallback(
    (s) => {
      restoringRef.current = true;
      try {
        layersApi.loadLayerSet(s.layers);
        layersApi.setCustomGlyphs(s.customGlyphs ?? {});
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

  const glyphCommits = useGlyphCommits({
    addCustomGlyph: layersApi.addCustomGlyph,
    updateCustomGlyph: layersApi.updateCustomGlyph,
    updateLayer: layersApi.updateLayer,
    recordBatch,
    layers: layersApi.layers,
    customGlyphs: layersApi.customGlyphs,
  });

  return { layersApi, history, glyphCommits };
}

function firstLayer(result) {
  return result.current.layersApi.layers[0];
}

function testGlyph(overrides = {}) {
  return {
    name: "Test Glyph",
    tradition: "custom",
    viewRadius: 10,
    root: { x: 0, y: 0, angle: 0 },
    paths: [{ d: "M0,0 L1,1", closed: false }],
    ...overrides,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useGlyphCommits", () => {
  it("commitNewGlyph writes the glyph + points glyphRef as ONE undo entry, and returns the new id", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;

    let newId;
    act(() => {
      newId = result.current.glyphCommits.commitNewGlyph(testGlyph(), layerId);
    });

    expect(typeof newId).toBe("string");
    expect(result.current.layersApi.customGlyphs[newId]?.name).toBe("Test Glyph");
    expect(firstLayer(result).params.glyphRef).toBe(newId);
    expect(result.current.history.canUndo).toBe(true);

    // ONE ⌘Z reverts BOTH the glyph write and the glyphRef point.
    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs[newId]).toBeUndefined();
    expect(firstLayer(result).params?.glyphRef).toBeUndefined();
    expect(result.current.history.canUndo).toBe(false);

    act(() => result.current.history.redo());
    expect(result.current.layersApi.customGlyphs[newId]?.name).toBe("Test Glyph");
    expect(firstLayer(result).params.glyphRef).toBe(newId);
  });

  it("commitNewGlyph preserves the layer's other params when pointing glyphRef", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    act(() =>
      result.current.layersApi.updateLayer(layerId, {
        params: { foo: "bar", count: 3 },
      })
    );
    // Let the param-edit burst idle-close (real recordEdit wiring) so the
    // commit below starts from a clean history state, as it would in the app.
    act(() => vi.advanceTimersByTime(500));

    let newId;
    act(() => {
      newId = result.current.glyphCommits.commitNewGlyph(testGlyph(), layerId);
    });

    expect(firstLayer(result).params).toEqual({
      foo: "bar",
      count: 3,
      glyphRef: newId,
    });
  });

  it("commitNewGlyph no-ops safely when layerId is not in layers (no throw, no glyph write, no history entry)", () => {
    const { result } = renderHook(() => useWired());
    const before = result.current.layersApi.customGlyphs;

    let returned;
    expect(() => {
      act(() => {
        returned = result.current.glyphCommits.commitNewGlyph(
          testGlyph(),
          "nonexistent-layer-id"
        );
      });
    }).not.toThrow();

    // Documented choice (see useGlyphCommits.js): an unknown layerId aborts
    // BEFORE the glyph write, so there is no dangling committed glyph with
    // nothing pointing at it, and no dead undo entry. No new id is minted.
    expect(returned).toBeUndefined();
    expect(result.current.layersApi.customGlyphs).toEqual(before);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("updateGlyph commits new geometry to an existing custom glyph in place (Save on an existing custom glyph)", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    let newId;
    act(() => {
      newId = result.current.glyphCommits.commitNewGlyph(testGlyph(), layerId);
    });
    act(() => result.current.history.clear()); // fresh baseline for this assertion

    act(() =>
      result.current.glyphCommits.updateGlyph(newId, testGlyph({ name: "Renamed" }))
    );
    expect(result.current.layersApi.customGlyphs[newId].name).toBe("Renamed");
    // The layer's glyphRef is untouched by an in-place commit.
    expect(firstLayer(result).params.glyphRef).toBe(newId);
    expect(result.current.history.canUndo).toBe(true);

    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs[newId].name).toBe("Test Glyph");
  });

  it("copyGlyphToDoc is an idempotent keyed upsert — writes once, then skips repeats", () => {
    const { result } = renderHook(() => useWired());
    const libGlyph = { id: "lib-1", ...testGlyph({ name: "Vine" }) };

    act(() => result.current.glyphCommits.copyGlyphToDoc(libGlyph));
    expect(result.current.layersApi.customGlyphs["lib-1"].name).toBe("Vine");

    // Repeat call with a mutated payload — must be SKIPPED, not overwritten,
    // because the id is already present in customGlyphs.
    act(() =>
      result.current.glyphCommits.copyGlyphToDoc({ ...libGlyph, name: "Mutated" })
    );
    expect(result.current.layersApi.customGlyphs["lib-1"].name).toBe("Vine");

    // Exactly ONE history entry exists despite two calls — the skip recorded
    // nothing.
    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs["lib-1"]).toBeUndefined();
    expect(result.current.history.canUndo).toBe(false);
  });

  it("placeFromLibrary copies (if absent) + sets the layer's params as ONE undo entry", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    const libGlyph = { id: "lib-2", ...testGlyph({ name: "Rosette" }) };
    expect(result.current.layersApi.customGlyphs["lib-2"]).toBeUndefined();

    act(() =>
      result.current.glyphCommits.placeFromLibrary(libGlyph, layerId, {
        glyphRef: "lib-2",
      })
    );
    expect(result.current.layersApi.customGlyphs["lib-2"].name).toBe("Rosette");
    expect(firstLayer(result).params.glyphRef).toBe("lib-2");
    expect(result.current.history.canUndo).toBe(true);

    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs["lib-2"]).toBeUndefined();
    expect(firstLayer(result).params?.glyphRef).toBeUndefined();
    expect(result.current.history.canUndo).toBe(false);
  });

  it("placeFromLibrary skips the copy when the glyph is already in the doc, still committing the params write in ONE entry", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    const libGlyph = { id: "lib-3", ...testGlyph({ name: "Original" }) };
    act(() => result.current.glyphCommits.copyGlyphToDoc(libGlyph)); // pre-seed the doc
    act(() => result.current.history.clear()); // fresh baseline for this assertion

    act(() =>
      result.current.glyphCommits.placeFromLibrary(
        { ...libGlyph, name: "Mutated" },
        layerId,
        { glyphRef: "lib-3", scale: 2 }
      )
    );
    expect(result.current.layersApi.customGlyphs["lib-3"].name).toBe("Original"); // copy skipped
    expect(firstLayer(result).params).toEqual({ glyphRef: "lib-3", scale: 2 });
    expect(result.current.history.canUndo).toBe(true);

    // ONE entry reverts the params write (the copy never happened, so there
    // is nothing more to undo).
    act(() => result.current.history.undo());
    expect(firstLayer(result).params?.glyphRef).toBeUndefined();
    expect(result.current.history.canUndo).toBe(false);
  });

  // ── C3: commitNewGlyphToSlot — fork a glyph + rebind ONE sequencer slot ────
  const chainWithSeqParams = (slots) => ({
    glyphRef: "leaf",
    binding: {
      chain: [
        { type: "route", roles: ["crossing"], pathScope: "all" },
        { type: "sequence", mode: "cycle", slots },
      ],
      placement: {},
    },
  });

  it("commitNewGlyphToSlot forks a glyph + rebinds ONLY that slot's glyphRef as ONE undo entry (base + siblings untouched)", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    act(() =>
      result.current.layersApi.updateLayer(layerId, {
        params: chainWithSeqParams([{ glyphRef: "leaf" }, { glyphRef: "flower" }]),
      })
    );
    act(() => vi.advanceTimersByTime(500)); // idle-close the param burst
    act(() => result.current.history.clear()); // fresh baseline for the ONE-entry assertion

    let newId;
    act(() => {
      newId = result.current.glyphCommits.commitNewGlyphToSlot(
        testGlyph(),
        layerId,
        0
      );
    });

    expect(typeof newId).toBe("string");
    const seq = firstLayer(result).params.binding.chain[1];
    expect(seq.slots[0].glyphRef).toBe(newId); // slot 0 rebound to the fork
    expect(seq.slots[1].glyphRef).toBe("flower"); // sibling slot untouched
    expect(firstLayer(result).params.glyphRef).toBe("leaf"); // BASE untouched
    expect(result.current.layersApi.customGlyphs[newId]?.name).toBe("Test Glyph");
    expect(result.current.history.canUndo).toBe(true);

    // ONE ⌘Z reverts BOTH the glyph add AND the slot rebind. (A split into two
    // entries would leave the glyph present after a single undo — this is the
    // atomicity proof: the fork is glyph-ADD + slot-REBIND in one recordBatch.)
    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs[newId]).toBeUndefined();
    expect(
      firstLayer(result).params.binding.chain[1].slots[0].glyphRef
    ).toBe("leaf");
  });

  it("commitNewGlyphToSlot aborts (no glyph write, no history) with no chain-form sequence or an out-of-range slot", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    // Legacy binding (no chain) → nothing to rebind.
    act(() =>
      result.current.layersApi.updateLayer(layerId, {
        params: { glyphRef: "leaf", binding: { selection: {}, placement: {} } },
      })
    );
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.history.clear());
    const before = result.current.layersApi.customGlyphs;

    let r1;
    act(() => {
      r1 = result.current.glyphCommits.commitNewGlyphToSlot(testGlyph(), layerId, 0);
    });
    expect(r1).toBeUndefined();
    expect(result.current.layersApi.customGlyphs).toEqual(before); // no glyph write

    // Chain-form WITH a sequence, but slotIndex out of range → still aborts.
    act(() =>
      result.current.layersApi.updateLayer(layerId, {
        params: chainWithSeqParams([{ glyphRef: "leaf" }]),
      })
    );
    act(() => vi.advanceTimersByTime(500));
    const before2 = result.current.layersApi.customGlyphs;

    let r2;
    act(() => {
      r2 = result.current.glyphCommits.commitNewGlyphToSlot(testGlyph(), layerId, 9);
    });
    expect(r2).toBeUndefined();
    expect(result.current.layersApi.customGlyphs).toEqual(before2); // no glyph write
  });
});
