// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCallback, useEffect, useRef } from "react";
import useLayers from "../useLayers";
import useHistory from "../history/useHistory";
import useMotifEditorSession, { MOTIF_DRAFT_ID } from "./useMotifEditorSession";
import { MOTIF_GLYPHS } from "../motif/glyphs.js";

// useMotifEditorSession is the Wave 2 lifecycle module (motif-session-
// ORCHESTRATOR.md, issue #77): it owns the open/openNew/import/save/saveAsCopy
// /cancel gestures the pen editor exposes, absorbing Inspector's openEditorFor
// + handleImportChange and Studio's modal IIFE. It consumes useGlyphCommits
// (Wave 1) internally, so a Glyph Commit made through a session is ALWAYS one
// undo entry — CONTEXT.md "Motifs".
//
// Modeled on useGlyphCommits.test.js / recordSites.integration.test.jsx: wire
// the REAL useLayers + useHistory (recordBatch backed by genuine
// beginCoalesce/endCoalesce, updateLayer recording exclusively via recordEdit),
// not a mocked recorder that would trivially "prove" atomicity by construction.

function useWired(overrides = {}) {
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

  const session = useMotifEditorSession({
    layers: layersApi.layers,
    customGlyphs: layersApi.customGlyphs,
    addCustomGlyph: layersApi.addCustomGlyph,
    updateCustomGlyph: layersApi.updateCustomGlyph,
    updateLayer: layersApi.updateLayer,
    recordBatch,
    parseD: overrides.parseD,
    anchorsToD: overrides.anchorsToD,
    previewContext: overrides.previewContext ?? null,
    onError: overrides.onError,
    canSaveToLibrary: overrides.canSaveToLibrary ?? false,
    isLoggedIn: overrides.isLoggedIn ?? false,
    onSaveToLibrary: overrides.onSaveToLibrary,
    onRequireSignIn: overrides.onRequireSignIn,
  });

  return { layersApi, history, session };
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

function svgFile(text, name = "motif.svg") {
  return {
    name,
    text: () => Promise.resolve(text),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useMotifEditorSession — open() fork decision", () => {
  it("forks a BUILT-IN glyphRef into a Draft Glyph, never touching the built-in", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    const before = result.current.layersApi.customGlyphs;

    act(() => result.current.session.open(layerId, "leaf"));

    expect(result.current.session.isOpen).toBe(true);
    // glyphId is the MOTIF_DRAFT_ID sentinel ⇒ a create/draft session (Save
    // must CREATE, not restamp). Sanctioned pre-step (Wave 3 review, #77): the
    // sentinel now lives here, not threaded in ad hoc by Studio.
    expect(result.current.session.modalProps.glyphId).toBe(MOTIF_DRAFT_ID);
    expect(result.current.session.modalProps.glyph).toEqual({
      name: MOTIF_GLYPHS.leaf.name,
      tradition: "custom",
      paths: MOTIF_GLYPHS.leaf.paths,
      viewRadius: MOTIF_GLYPHS.leaf.viewRadius,
      root: { x: 0, y: 0, angle: 0 },
    });
    // No document write happened just by opening.
    expect(result.current.layersApi.customGlyphs).toEqual(before);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("forks an UNRESOLVED glyphRef (not built-in, not in customGlyphs) using the leaf fallback", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;

    act(() => result.current.session.open(layerId, "totally-unknown-ref"));

    expect(result.current.session.modalProps.glyphId).toBe(MOTIF_DRAFT_ID);
    expect(result.current.session.modalProps.glyph.name).toBe(MOTIF_GLYPHS.leaf.name);
  });

  it("opens an existing CUSTOM glyph IN PLACE (no fork)", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    let customId;
    act(() => {
      customId = result.current.layersApi.addCustomGlyph(testGlyph({ name: "Vine" }));
    });

    act(() => result.current.session.open(layerId, customId));

    expect(result.current.session.isOpen).toBe(true);
    // glyphId set (not null) ⇒ an edit-in-place session.
    expect(result.current.session.modalProps.glyphId).toBe(customId);
    expect(result.current.session.modalProps.glyph.name).toBe("Vine");
  });

  it("defaults initialTool to 'direct-select' for open() sessions (fork or in-place)", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    act(() => result.current.session.open(layerId, "leaf"));
    expect(result.current.session.modalProps.initialTool).toBe("direct-select");
  });
});

describe("useMotifEditorSession — openNew()", () => {
  it("opens a blank Draft Glyph with the pen tool active", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;

    act(() => result.current.session.openNew(layerId));

    expect(result.current.session.isOpen).toBe(true);
    expect(result.current.session.modalProps.glyphId).toBe(MOTIF_DRAFT_ID);
    expect(result.current.session.modalProps.initialTool).toBe("pen");
    expect(result.current.session.modalProps.glyph).toEqual({
      name: "New motif",
      tradition: "custom",
      paths: [],
      viewRadius: 0,
      root: { x: 0, y: 0, angle: 0 },
    });
  });
});

describe("useMotifEditorSession — D6 cancel discards with zero document mutation", () => {
  it("cancel() after openNew() mutates NOTHING and records no history entry", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    const glyphsBefore = result.current.layersApi.customGlyphs;
    const paramsBefore = firstLayer(result).params;

    act(() => result.current.session.openNew(layerId));
    act(() => result.current.session.cancel());

    expect(result.current.session.isOpen).toBe(false);
    expect(result.current.layersApi.customGlyphs).toEqual(glyphsBefore);
    expect(firstLayer(result).params).toEqual(paramsBefore);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("cancel() after open()'s built-in fork mutates NOTHING and records no history entry", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    const glyphsBefore = result.current.layersApi.customGlyphs;
    const paramsBefore = firstLayer(result).params;

    act(() => result.current.session.open(layerId, "rosette"));
    act(() => result.current.session.cancel());

    expect(result.current.session.isOpen).toBe(false);
    expect(result.current.layersApi.customGlyphs).toEqual(glyphsBefore);
    expect(firstLayer(result).params).toEqual(paramsBefore);
    expect(result.current.history.canUndo).toBe(false);
  });
});

describe("useMotifEditorSession — save()", () => {
  it("save() on a draft (fork/new) commits ONCE — one undo entry reverts both the glyph write and the glyphRef point", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    act(() => result.current.session.openNew(layerId));

    act(() => result.current.session.save(testGlyph({ name: "Drawn" })));

    expect(result.current.session.isOpen).toBe(false);
    const glyphIds = Object.keys(result.current.layersApi.customGlyphs);
    expect(glyphIds).toHaveLength(1);
    const newId = glyphIds[0];
    expect(result.current.layersApi.customGlyphs[newId].name).toBe("Drawn");
    expect(firstLayer(result).params.glyphRef).toBe(newId);
    expect(result.current.history.canUndo).toBe(true);

    // ONE undo reverts BOTH the glyph write and the glyphRef point.
    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs[newId]).toBeUndefined();
    expect(firstLayer(result).params?.glyphRef).toBeUndefined();
    expect(result.current.history.canUndo).toBe(false);
  });

  it("save() on an existing custom glyph updates IN PLACE — no new glyph id, layer's glyphRef unchanged", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    let customId;
    act(() => {
      customId = result.current.layersApi.addCustomGlyph(testGlyph({ name: "Original" }));
      result.current.layersApi.updateLayer(layerId, {
        params: { glyphRef: customId },
      });
    });
    act(() => vi.advanceTimersByTime(500)); // idle-close the param edit burst
    act(() => result.current.history.clear()); // fresh baseline

    act(() => result.current.session.open(layerId, customId));
    act(() => result.current.session.save(testGlyph({ name: "Renamed" })));

    expect(Object.keys(result.current.layersApi.customGlyphs)).toEqual([customId]);
    expect(result.current.layersApi.customGlyphs[customId].name).toBe("Renamed");
    expect(firstLayer(result).params.glyphRef).toBe(customId);
    expect(result.current.history.canUndo).toBe(true);

    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs[customId].name).toBe("Original");
  });

  it("save() is a no-op when no session is open", () => {
    const { result } = renderHook(() => useWired());
    const before = result.current.layersApi.customGlyphs;
    expect(() => act(() => result.current.session.save(testGlyph()))).not.toThrow();
    expect(result.current.layersApi.customGlyphs).toEqual(before);
    expect(result.current.history.canUndo).toBe(false);
  });
});

describe("useMotifEditorSession — saveAsCopy()", () => {
  it("ALWAYS forks a new glyph, even when editing an existing custom in place, as ONE undo entry", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    let customId;
    act(() => {
      customId = result.current.layersApi.addCustomGlyph(testGlyph({ name: "Original" }));
      result.current.layersApi.updateLayer(layerId, {
        params: { glyphRef: customId },
      });
    });
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.history.clear());

    act(() => result.current.session.open(layerId, customId));
    act(() => result.current.session.saveAsCopy(testGlyph({ name: "Copy" })));

    const ids = Object.keys(result.current.layersApi.customGlyphs);
    expect(ids).toHaveLength(2); // original untouched + the new copy
    expect(result.current.layersApi.customGlyphs[customId].name).toBe("Original");
    const copyId = ids.find((id) => id !== customId);
    expect(result.current.layersApi.customGlyphs[copyId].name).toBe("Copy");
    expect(firstLayer(result).params.glyphRef).toBe(copyId);
    expect(result.current.history.canUndo).toBe(true);

    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs[copyId]).toBeUndefined();
    expect(firstLayer(result).params.glyphRef).toBe(customId);
  });
});

// ── C3 (issue #79): slot-context commit-back ──────────────────────────────────
// Tapping a Sequencer slot opens the session with a slot locator; the FORK save
// paths (draft-Save on a built-in slot, and saveAsCopy from any slot) must rebind
// THAT slot's glyphRef — never the layer's base glyphRef (the silent-wrong-target
// bug). Editing a CUSTOM slot in place needs no rebind (shared glyph id).
describe("useMotifEditorSession — slot commit-back (C3)", () => {
  const seqParams = (slots, base = "leaf") => ({
    glyphRef: base,
    binding: {
      chain: [
        { type: "route", roles: ["crossing"], pathScope: "all" },
        { type: "sequence", mode: "cycle", slots },
      ],
      placement: {},
    },
  });
  const lastSeq = (result) => {
    const chain = firstLayer(result).params.binding.chain;
    return chain[chain.length - 1];
  };

  it("save() on a forked BUILT-IN slot rebinds ONLY that slot's glyphRef; base + siblings untouched; one undo reverts both", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    act(() =>
      result.current.layersApi.updateLayer(layerId, {
        params: seqParams([{ glyphRef: "leaf" }, { glyphRef: "flower" }]),
      })
    );
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.history.clear());

    // Tap slot 0 (built-in 'leaf') → fork a Draft Glyph.
    act(() => result.current.session.open(layerId, "leaf", { slotIndex: 0 }));
    expect(result.current.session.modalProps.glyphId).toBe(MOTIF_DRAFT_ID);
    act(() => result.current.session.save(testGlyph({ name: "Forked Leaf" })));

    const ids = Object.keys(result.current.layersApi.customGlyphs);
    expect(ids).toHaveLength(1);
    const newId = ids[0];
    expect(lastSeq(result).slots[0].glyphRef).toBe(newId); // slot 0 rebound
    expect(lastSeq(result).slots[1].glyphRef).toBe("flower"); // sibling untouched
    expect(firstLayer(result).params.glyphRef).toBe("leaf"); // BASE untouched
    expect(result.current.history.canUndo).toBe(true);

    // ONE undo reverts BOTH the glyph add and the slot rebind (a split would
    // leave the glyph present after a single undo).
    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs[newId]).toBeUndefined();
    expect(lastSeq(result).slots[0].glyphRef).toBe("leaf");
  });

  it("save() on a CUSTOM slot glyph edits IN PLACE — no new id, no rebind, slot keeps the shared id (base picks it up too)", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    let customId;
    act(() => {
      customId = result.current.layersApi.addCustomGlyph(testGlyph({ name: "Vine" }));
      result.current.layersApi.updateLayer(layerId, {
        params: seqParams([{ glyphRef: customId }], customId),
      });
    });
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.history.clear());

    act(() => result.current.session.open(layerId, customId, { slotIndex: 0 }));
    // Custom → edit in place (glyphId set, not the draft sentinel).
    expect(result.current.session.modalProps.glyphId).toBe(customId);
    act(() => result.current.session.save(testGlyph({ name: "Vine Edited" })));

    // No fork: the single shared glyph is updated; the slot keeps its id.
    expect(Object.keys(result.current.layersApi.customGlyphs)).toEqual([customId]);
    expect(result.current.layersApi.customGlyphs[customId].name).toBe("Vine Edited");
    expect(lastSeq(result).slots[0].glyphRef).toBe(customId);
    // Base points at the SAME id, so it renders the edit with no rebind needed.
    expect(firstLayer(result).params.glyphRef).toBe(customId);
  });

  it("saveAsCopy() from a slot session forks + rebinds the SLOT, NEVER the base (the wrong-target guard the review hammers)", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    act(() =>
      result.current.layersApi.updateLayer(layerId, {
        params: seqParams([{ glyphRef: "leaf" }, { glyphRef: "flower" }]),
      })
    );
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.history.clear());

    // Tap slot 1 (built-in 'flower'); Save-as-copy ALWAYS forks.
    act(() => result.current.session.open(layerId, "flower", { slotIndex: 1 }));
    act(() => result.current.session.saveAsCopy(testGlyph({ name: "Copied Flower" })));

    const ids = Object.keys(result.current.layersApi.customGlyphs);
    expect(ids).toHaveLength(1);
    const copyId = ids[0];
    expect(lastSeq(result).slots[1].glyphRef).toBe(copyId); // slot 1 → the copy
    expect(lastSeq(result).slots[0].glyphRef).toBe("leaf"); // sibling untouched
    expect(firstLayer(result).params.glyphRef).toBe("leaf"); // BASE NOT rebound
  });

  it("additive back-compat: open() with NO slot locator still rebinds the BASE glyphRef (byte-identical base Edit path)", () => {
    const { result } = renderHook(() => useWired());
    const layerId = firstLayer(result).id;
    // No opts → session.slotIndex null → the fork rebinds the base, unchanged.
    act(() => result.current.session.open(layerId, "leaf"));
    act(() => result.current.session.save(testGlyph({ name: "Base Fork" })));

    const ids = Object.keys(result.current.layersApi.customGlyphs);
    expect(ids).toHaveLength(1);
    expect(firstLayer(result).params.glyphRef).toBe(ids[0]); // BASE rebound
  });
});

describe("useMotifEditorSession — importFromFile()", () => {
  it("an unreadable file calls onError with the exact current message and commits NOTHING", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useWired({ onError }));
    const layerId = firstLayer(result).id;
    const badFile = { text: () => Promise.reject(new Error("boom")) };

    await act(async () => {
      await result.current.session.importFromFile(badFile, layerId);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Could not read that file.");
    expect(result.current.layersApi.customGlyphs).toEqual({});
    expect(result.current.history.canUndo).toBe(false);
  });

  it("an invalid SVG calls onError with importMotif's message and commits NOTHING", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useWired({ onError }));
    const layerId = firstLayer(result).id;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>';

    await act(async () => {
      await result.current.session.importFromFile(svgFile(svg), layerId);
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("No drawable geometry found in this SVG.");
    expect(result.current.layersApi.customGlyphs).toEqual({});
    expect(
      Object.values(result.current.layersApi.layers).some((l) => l.params?.glyphRef)
    ).toBe(false);
    expect(result.current.history.canUndo).toBe(false);
  });

  it("a valid SVG commits ONE glyph + points the target layer's glyphRef, as ONE undo entry", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useWired({ onError }));
    const layerId = firstLayer(result).id;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 0 L5 10 Z"/></svg>';

    await act(async () => {
      await result.current.session.importFromFile(svgFile(svg), layerId);
    });

    expect(onError).not.toHaveBeenCalled();
    const ids = Object.keys(result.current.layersApi.customGlyphs);
    expect(ids).toHaveLength(1);
    expect(result.current.layersApi.customGlyphs[ids[0]].tradition).toBe("imported");
    expect(firstLayer(result).params.glyphRef).toBe(ids[0]);
    expect(result.current.history.canUndo).toBe(true);

    act(() => result.current.history.undo());
    expect(result.current.layersApi.customGlyphs).toEqual({});
    expect(firstLayer(result).params?.glyphRef).toBeUndefined();
    expect(result.current.history.canUndo).toBe(false);
  });
});

describe("useMotifEditorSession — modalProps shape", () => {
  it("matches MotifEditorModal's full prop contract, and is null when no session is open", () => {
    const { result } = renderHook(() => useWired());
    expect(result.current.session.isOpen).toBe(false);
    expect(result.current.session.modalProps).toBeNull();

    const layerId = firstLayer(result).id;
    act(() => result.current.session.open(layerId, "leaf"));

    expect(Object.keys(result.current.session.modalProps).sort()).toEqual(
      [
        "anchorsToD",
        "canSaveToLibrary",
        "glyph",
        "glyphId",
        "initialTool",
        "isLoggedIn",
        "layers",
        "onCancel",
        "onRequireSignIn",
        "onSave",
        "onSaveAsCopy",
        "onSaveToLibrary",
        "parseD",
        "previewContext",
        "targetLayerId",
      ].sort()
    );
    expect(result.current.session.modalProps.targetLayerId).toBe(layerId);
    expect(typeof result.current.session.modalProps.onSave).toBe("function");
    expect(typeof result.current.session.modalProps.onSaveAsCopy).toBe("function");
    expect(typeof result.current.session.modalProps.onCancel).toBe("function");
  });

  it("passes the four promote-gate props through verbatim from this hook's inputs", () => {
    const onSaveToLibrary = vi.fn();
    const onRequireSignIn = vi.fn();
    const { result } = renderHook(() =>
      useWired({
        canSaveToLibrary: true,
        isLoggedIn: true,
        onSaveToLibrary,
        onRequireSignIn,
      })
    );
    const layerId = firstLayer(result).id;
    act(() => result.current.session.open(layerId, "leaf"));

    expect(result.current.session.modalProps.canSaveToLibrary).toBe(true);
    expect(result.current.session.modalProps.isLoggedIn).toBe(true);
    expect(result.current.session.modalProps.onSaveToLibrary).toBe(onSaveToLibrary);
    expect(result.current.session.modalProps.onRequireSignIn).toBe(onRequireSignIn);
  });
});
