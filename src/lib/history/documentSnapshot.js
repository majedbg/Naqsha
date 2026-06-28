import { HISTORY_SCHEMA_VERSION } from "./snapshot";

// createDocumentIO — assembles the whole-document `capture`/`restore` pair the
// unified history engine (useHistory) is handed. THIS IS THE ONE PLACE the
// snapshot shape is enumerated (decision D2 mitigation): both halves are a
// single co-located, symmetric object literal, so a forgotten slice is a
// one-file, grep-able omission and invariant I1 (restore(capture()) === no-op)
// guards completeness.
//
// Each existing hook keeps owning its useState; this factory only wires their
// getters/bulk-setters together. Getters read LIVE slice values — capture
// deep-clones them (structuredClone) so a later edit can't mutate a snapshot
// already parked on the stack. captureAssignments/captureCanvas already return
// fresh plain objects, so they pass through as-is.
//
// THE OFF-BY-ONE NOTE (§3.1): capture must be invoked when the underlying refs
// hold the intended state — useHistory enforces that by calling capture BEFORE a
// mutation (record) or at a settled undo/redo boundary. This factory is purely
// the assembly; the timing discipline lives in useHistory.

export function createDocumentIO({
  // getters (read live; capture deep-clones)
  getLayers,
  getPanels,
  getBgColor,
  getOperations,
  captureAssignments,
  captureCanvas,
  // bulk setters (restore writes every slice back, synchronously)
  loadLayerSet,
  setPanels,
  setBgColor,
  restoreOperations,
  restoreAssignments,
  restoreCanvas,
}) {
  const capture = () => ({
    v: HISTORY_SCHEMA_VERSION,
    layers: structuredClone(getLayers()),
    panels: structuredClone(getPanels()),
    bgColor: getBgColor(),
    operations: structuredClone(getOperations()),
    assignments: captureAssignments(),
    canvas: captureCanvas(),
  });

  const restore = (s) => {
    if (!s) return;
    // loadLayerSet runs migrateLayer on each layer — the migrate-on-restore rail
    // (§7 #2), so no raw old snapshot ever reaches render.
    loadLayerSet(s.layers);
    setPanels(s.panels);
    setBgColor(s.bgColor);
    restoreOperations(s.operations);
    restoreAssignments(s.assignments);
    restoreCanvas(s.canvas);
    // selection is NOT in the snapshot (D1); best-effort re-selection is the
    // caller's concern and never records.
  };

  return { capture, restore };
}
