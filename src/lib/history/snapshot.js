// history/snapshot — the whole-document Snapshot value type, its deep clone, and
// the schema-version stamp. Pure; no React, no I/O. The unified undo/redo stack
// (src/lib/history/useHistory.js) stores Snapshots; the persistence layer
// (src/lib/history/persist.js) version-stamps and migrates them.
//
// A Snapshot is DOCUMENT CONTENT ONLY (decision D1):
//
//   {
//     v: number,                         // HISTORY_SCHEMA_VERSION
//     layers: Layer[],                   // flat array, deep clone
//     panels: Panel[],
//     bgColor: string,
//     operations: Operation[],
//     activeProfileId: ProfileId,        // P0-3: the target Machine Profile
//     assignments: Record<LayerId, OperationId>,
//     canvas: { w, h, unit, margin, presetIndex, outputMode },
//   }
//
// activeProfileId joined the snapshot in P0-3 (Run Plan, PRD #73 / ADR 0002): a
// Machine Profile switch is now a recorded, undoable batch, so the target
// machine must round-trip with the operations remap it drives. Old snapshots
// lacking the field migrate to DEFAULT_PROFILE_ID on restore (no schema bump —
// additive, non-breaking to the layer model).
//
// NOT included: selectedLayerId, editingNodeId, liveTransform, bedSize. bedSize
// is a transient machine-reference overlay, re-derived from the restored
// profile's default on undo (the bedSize seam). Selection is best-effort
// re-selected on restore but never recorded.

// Bump ONLY on a breaking change to the snapshot/layer model. On import, a
// persisted blob whose `v` differs is silently dropped (the document is kept) —
// the escape hatch for breaking layer-model changes (safety rail #1, §7).
export const HISTORY_SCHEMA_VERSION = 1;

// Deep clone a Snapshot so a pushed `past` entry can never be mutated by a later
// edit to the live document (shared references would silently corrupt history).
// Snapshots are plain JSON-serializable data — the same shape that already
// round-trips through localStorage — so `structuredClone` is exact and fast.
export function cloneSnapshot(snapshot) {
  return structuredClone(snapshot);
}
