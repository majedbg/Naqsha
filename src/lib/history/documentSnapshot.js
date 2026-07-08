import { HISTORY_SCHEMA_VERSION } from "./snapshot";
import { DEFAULT_PROFILE_ID } from "../machineProfiles";

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
  // WI-3: the per-document custom-glyph store. Optional so pre-WI-3 callers /
  // stub stores that don't pass it capture `{}` and restore is a safe no-op.
  getCustomGlyphs = () => ({}),
  // P0-3 (Run Plan, PRD #73): the active Machine Profile is now DOCUMENT CONTENT
  // that rides the undo/redo snapshot, so a profile switch is a recorded,
  // undoable batch instead of `history.clear()` (ADR 0002). Optional with a safe
  // default so stub stores / older callers that don't pass it capture the default
  // profile and restore is a no-op.
  getActiveProfileId = () => DEFAULT_PROFILE_ID,
  captureAssignments,
  captureCanvas,
  // bulk setters (restore writes every slice back, synchronously)
  loadLayerSet,
  setPanels,
  setBgColor,
  restoreOperations,
  setCustomGlyphs = () => {},
  // P0-3: the wired setter re-applies the Machine Profile on restore. Studio's
  // implementation ALSO re-derives the (transient, un-snapshotted) default bed
  // and the persisted outputMode mirror — see the bedSize seam in Studio.jsx.
  setActiveProfileId = () => {},
  restoreAssignments,
  restoreCanvas,
}) {
  const capture = () => ({
    v: HISTORY_SCHEMA_VERSION,
    layers: structuredClone(getLayers()),
    panels: structuredClone(getPanels()),
    bgColor: getBgColor(),
    operations: structuredClone(getOperations()),
    // customGlyphs is referenced BY layers (glyphRef) but lives outside them, so
    // it must be captured explicitly — deep-cloned like the other object slices.
    customGlyphs: structuredClone(getCustomGlyphs()),
    // A plain string id — no deep clone needed. Captured so undo/redo restores
    // the target Machine Profile alongside the operations remap it drove (P0-3).
    activeProfileId: getActiveProfileId(),
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
    // Default to {} so restoring a pre-WI-3 snapshot (no field) — or crossing
    // into a document that never had custom glyphs — RESETS the store rather than
    // leaking the prior document's glyphs (referential-integrity risk #1).
    setCustomGlyphs(s.customGlyphs ?? {});
    // Default to DEFAULT_PROFILE_ID so a pre-P0-3 snapshot (no field) restores to
    // the app's default machine rather than leaving the profile at whatever the
    // switch left it — the migrate-on-restore default for the new field.
    setActiveProfileId(s.activeProfileId ?? DEFAULT_PROFILE_ID);
    restoreAssignments(s.assignments);
    restoreCanvas(s.canvas);
    // selection is NOT in the snapshot (D1); best-effort re-selection is the
    // caller's concern and never records.
  };

  return { capture, restore };
}
