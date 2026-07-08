import { describe, it, expect } from "vitest";
import { createDocumentIO } from "./documentSnapshot";
import { HISTORY_SCHEMA_VERSION } from "./snapshot";

// S3 — the capture/restore assembly. The single failure mode of injected-capture
// is an INCOMPLETE capture (a forgotten slice), so this exercises all six slices
// through a stub document store and asserts I1: restore(capture()) leaves every
// slice deep-equal (a true no-op). Capture must also deep-clone so a later live
// edit can't mutate a snapshot already on the stack.

function makeStore(overrides = {}) {
  const doc = {
    layers: [{ id: "l1", params: { d: 1, glyphRef: "cg-1" }, operationId: "op-cut" }],
    panels: [{ id: "p1", layerIds: ["l1"] }],
    bgColor: "#0a1628",
    operations: [{ id: "op-cut", color: "#FF0000" }],
    canvas: { w: 800, h: 600, unit: "mm", margin: 0, presetIndex: 1, outputMode: "plotter" },
    // WI-3: the per-document custom-glyph store rides the snapshot as a sibling of
    // `layers` (it is referenced BY layers via glyphRef but does not live inside
    // them, so it must be captured/restored explicitly).
    customGlyphs: { "cg-1": { id: "cg-1", name: "Imported", paths: [{ d: "M0,0 Z", closed: true }], viewRadius: 1 } },
    ...overrides,
  };
  const io = createDocumentIO({
    getLayers: () => doc.layers,
    getPanels: () => doc.panels,
    getBgColor: () => doc.bgColor,
    getOperations: () => doc.operations,
    getCustomGlyphs: () => doc.customGlyphs,
    captureAssignments: () =>
      Object.fromEntries(doc.layers.map((l) => [l.id, l.operationId])),
    captureCanvas: () => doc.canvas,
    loadLayerSet: (next) => {
      doc.layers = next;
    },
    setPanels: (next) => {
      doc.panels = next;
    },
    setBgColor: (next) => {
      doc.bgColor = next;
    },
    restoreOperations: (next) => {
      doc.operations = next;
    },
    setCustomGlyphs: (next) => {
      doc.customGlyphs = next;
    },
    restoreAssignments: (map) => {
      doc.layers = doc.layers.map((l) =>
        map[l.id] !== undefined ? { ...l, operationId: map[l.id] } : l
      );
    },
    restoreCanvas: (next) => {
      doc.canvas = next;
    },
  });
  return { doc, io };
}

describe("history/documentSnapshot — createDocumentIO (capture/restore symmetry)", () => {
  it("capture stamps the schema version and includes every slice", () => {
    const { io } = makeStore();
    const snap = io.capture();
    expect(snap.v).toBe(HISTORY_SCHEMA_VERSION);
    expect(snap).toHaveProperty("layers");
    expect(snap).toHaveProperty("panels");
    expect(snap).toHaveProperty("bgColor");
    expect(snap).toHaveProperty("operations");
    expect(snap).toHaveProperty("assignments");
    expect(snap).toHaveProperty("canvas");
    expect(snap).toHaveProperty("customGlyphs");
  });

  it("WI-3 — a custom glyph survives capture→restore and stays resolvable by its motif layer's glyphRef", () => {
    const { doc, io } = makeStore();
    const snap = io.capture();
    // Drop the glyph the way a bad edit / cross-doc leak would.
    doc.customGlyphs = {};
    io.restore(snap);
    expect(doc.customGlyphs["cg-1"]).toBeDefined();
    // The referencing layer's glyphRef still points at a present glyph.
    expect(doc.customGlyphs[doc.layers[0].params.glyphRef]).toBeDefined();
  });

  it("WI-3 — capture deep-clones customGlyphs (a later live edit cannot mutate a taken snapshot)", () => {
    const { doc, io } = makeStore();
    const snap = io.capture();
    doc.customGlyphs["cg-1"].name = "MUTATED";
    expect(snap.customGlyphs["cg-1"].name).toBe("Imported");
  });

  it("WI-3 — restore of a snapshot with NO customGlyphs field resets the store to {} (old-doc / cross-document reset)", () => {
    const { doc, io } = makeStore();
    // Simulate restoring a pre-WI-3 snapshot that never captured the field.
    io.restore({ v: 1, layers: doc.layers, panels: doc.panels, bgColor: doc.bgColor, operations: doc.operations, assignments: {}, canvas: doc.canvas });
    expect(doc.customGlyphs).toEqual({});
  });

  it("I1 — restore(capture()) is a no-op across all six slices", () => {
    const { doc, io } = makeStore();
    const before = structuredClone(doc);
    io.restore(io.capture());
    expect(doc).toEqual(before);
  });

  it("capture deep-clones: a later live edit cannot mutate a taken snapshot", () => {
    const { doc, io } = makeStore();
    const snap = io.capture();
    doc.layers[0].params.d = 999;
    doc.operations[0].color = "#000000";
    expect(snap.layers[0].params.d).toBe(1);
    expect(snap.operations[0].color).toBe("#FF0000");
  });

  it("restore round-trips a prior snapshot after intervening edits", () => {
    const { doc, io } = makeStore();
    const snap = io.capture();
    // Mutate the live doc the way real edits would.
    doc.layers = [{ id: "l1", params: { d: 42 }, operationId: "op-score" }];
    doc.bgColor = "#ffffff";
    doc.canvas = { ...doc.canvas, w: 1200, presetIndex: 3 };
    io.restore(snap);
    expect(doc.layers[0].params.d).toBe(1);
    expect(doc.layers[0].operationId).toBe("op-cut");
    expect(doc.bgColor).toBe("#0a1628");
    expect(doc.canvas.w).toBe(800);
    expect(doc.canvas.presetIndex).toBe(1);
  });
});
