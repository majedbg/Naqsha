import { describe, it, expect } from "vitest";
import { HISTORY_SCHEMA_VERSION, cloneSnapshot } from "./snapshot";

// S0 — the snapshot value type + deep clone + version stamp. Pure; no React.
// A Snapshot is whole-document content (layers/panels/bgColor/operations/
// assignments/canvas). cloneSnapshot must DEEP-copy so a pushed past entry can
// never be mutated by a later edit to the live document (the silent corruption
// bug an undo stack of shared references would have).

function sampleSnapshot() {
  return {
    v: HISTORY_SCHEMA_VERSION,
    layers: [
      { id: "l1", params: { density: 5, nested: { a: 1 } } },
      { id: "l2", params: { density: 9 } },
    ],
    panels: [{ id: "p1", layerIds: ["l1"] }],
    bgColor: "#0a1628",
    operations: [{ id: "op-cut", color: "#FF0000" }],
    assignments: { l1: "op-cut", l2: "op-cut" },
    canvas: { w: 800, h: 600, unit: "mm", margin: 0, presetIndex: 1, outputMode: "plotter" },
  };
}

describe("history/snapshot — version + deep clone", () => {
  it("exports a numeric HISTORY_SCHEMA_VERSION", () => {
    expect(typeof HISTORY_SCHEMA_VERSION).toBe("number");
    expect(HISTORY_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("cloneSnapshot produces a deep, value-equal copy", () => {
    const snap = sampleSnapshot();
    const clone = cloneSnapshot(snap);
    expect(clone).toEqual(snap);
  });

  it("cloneSnapshot shares no references with the source (deep)", () => {
    const snap = sampleSnapshot();
    const clone = cloneSnapshot(snap);
    expect(clone).not.toBe(snap);
    expect(clone.layers).not.toBe(snap.layers);
    expect(clone.layers[0]).not.toBe(snap.layers[0]);
    expect(clone.layers[0].params).not.toBe(snap.layers[0].params);
    expect(clone.layers[0].params.nested).not.toBe(snap.layers[0].params.nested);
    expect(clone.assignments).not.toBe(snap.assignments);
    expect(clone.canvas).not.toBe(snap.canvas);
  });

  it("mutating the clone never leaks back into the source", () => {
    const snap = sampleSnapshot();
    const clone = cloneSnapshot(snap);
    clone.layers[0].params.density = 999;
    clone.layers.push({ id: "l3" });
    clone.assignments.l1 = "op-score";
    expect(snap.layers[0].params.density).toBe(5);
    expect(snap.layers).toHaveLength(2);
    expect(snap.assignments.l1).toBe("op-cut");
  });
});
