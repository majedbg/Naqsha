import { useCallback, useEffect, useRef, useState } from "react";

// useOperationsHistory — a FOCUSED undo/redo stack for the document operation
// library and operation ASSIGNMENT (a layer's `operationId`), Lane C / C1
// (GitHub issue #10).
//
// Scope is deliberately narrow. There is no app-wide history in this codebase
// (verified: no `useHistory`, no `src/lib/history/`); the issue body's claim
// that one exists is inaccurate. This hook covers EXACTLY the state issue #10
// makes undoable — add / remove / reorder / recolor / param-edit of operations,
// plus assignment — and nothing else (no transforms, no layer positions, no
// app-wide snapshot). Keeping it scoped is what stops Undo from reverting
// unrelated layer fields.
//
// Design (the two-owner hazard):
//   - `operations` is OWNED here (replacing Studio's old `useState`).
//   - assignment (`layer.operationId`) stays owned by useLayers; this hook never
//     mirrors layers. Instead a snapshot pairs the operations with a cheap
//     `{layerId: operationId}` map captured from the CURRENT layers at commit
//     time via `captureAssignments`, and undo/redo writes it back through
//     `restoreAssignments`. Only `operationId` is snapshotted — never whole
//     layer objects — so undo can't disturb positions, names, or transforms.
//   - Recording is IMPERATIVE (in the action callbacks), never in an effect, so
//     undo/redo re-apply can't trigger a fresh commit (no suppression flag).
//
// State shape: `{ operations, undoStack, redoStack }`, where each stack entry is
// a `{ operations, assignments }` snapshot of the state BEFORE a committed
// change. Stacks live in STATE (not refs) so `canUndo`/`canRedo` derive without
// reading a ref during render. All transitions use functional setState so the
// callbacks stay referentially stable (no `operations` in their deps) and never
// read stale closures.
//
// Profile switch is intentionally NOT undoable (out of scope, and a pre-remap
// snapshot's colors/params don't fit the new profile) — it goes through
// `resetHistory`, which replaces operations and clears both stacks.

export default function useOperationsHistory({
  initialOperations,
  captureAssignments = () => ({}),
  restoreAssignments = () => {},
} = {}) {
  // The model is the SYNCHRONOUS source of truth, held in a ref so transitions
  // (pop a stack, capture/restore assignments) happen in one synchronous handler
  // pass — `setState(updater)` runs lazily, which breaks the "snapshot prev,
  // restore, push present" sequence (the updater fires after the restore line
  // would have run). Refs are mutated ONLY in event handlers (lint-clean: the
  // refs rule forbids render-phase ref access, not handler access). Render reads
  // ONLY `view` state below.
  const modelRef = useRef({
    operations: initialOperations ?? [],
    undoStack: [],
    redoStack: [],
  });

  // Render-facing snapshot. `publish()` mirrors the ref's derived fields into
  // state to trigger a re-render; render never touches modelRef.
  const [view, setView] = useState(() => ({
    operations: initialOperations ?? [],
    canUndo: false,
    canRedo: false,
  }));
  const publish = useCallback(() => {
    const m = modelRef.current;
    setView({
      operations: m.operations,
      canUndo: m.undoStack.length > 0,
      canRedo: m.redoStack.length > 0,
    });
  }, []);

  // Keep the latest capture/restore functions in refs so the stable callbacks
  // below always read the CURRENT layers without being re-created each render.
  // Synced in an effect (not during render) to satisfy the refs lint rule.
  const captureRef = useRef(captureAssignments);
  const restoreRef = useRef(restoreAssignments);
  useEffect(() => {
    captureRef.current = captureAssignments;
    restoreRef.current = restoreAssignments;
  });

  // Commit an operation-library change: `mapper(operations) => nextOperations`.
  // Pushes the pre-change snapshot onto undo and clears redo (no branching).
  const commitOperations = useCallback(
    (mapper) => {
      const m = modelRef.current;
      const assignments = captureRef.current();
      modelRef.current = {
        operations: mapper(m.operations),
        undoStack: [...m.undoStack, { operations: m.operations, assignments }],
        redoStack: [],
      };
      publish();
    },
    [publish]
  );

  // Commit an assignment change: `apply()` mutates the external assignment owner
  // (e.g. updateLayer(layerId, { operationId })). Operations are unchanged. The
  // snapshot is taken BEFORE apply() runs so it captures the prior assignment.
  const commitAssignment = useCallback(
    (apply) => {
      const m = modelRef.current;
      const assignments = captureRef.current();
      modelRef.current = {
        operations: m.operations,
        undoStack: [...m.undoStack, { operations: m.operations, assignments }],
        redoStack: [],
      };
      apply();
      publish();
    },
    [publish]
  );

  const undo = useCallback(() => {
    const m = modelRef.current;
    if (m.undoStack.length === 0) return;
    const prev = m.undoStack[m.undoStack.length - 1];
    const present = { operations: m.operations, assignments: captureRef.current() };
    modelRef.current = {
      operations: prev.operations,
      undoStack: m.undoStack.slice(0, -1),
      redoStack: [...m.redoStack, present],
    };
    restoreRef.current(prev.assignments);
    publish();
  }, [publish]);

  const redo = useCallback(() => {
    const m = modelRef.current;
    if (m.redoStack.length === 0) return;
    const next = m.redoStack[m.redoStack.length - 1];
    const present = { operations: m.operations, assignments: captureRef.current() };
    modelRef.current = {
      operations: next.operations,
      undoStack: [...m.undoStack, present],
      redoStack: m.redoStack.slice(0, -1),
    };
    restoreRef.current(next.assignments);
    publish();
  }, [publish]);

  // Replace operations WITHOUT recording, clearing both stacks. For non-undoable
  // wholesale replacements (machine-profile remap): the old snapshots reference
  // colors/params that no longer fit the new profile, so cross-profile undo is
  // semantically broken — drop them.
  const resetHistory = useCallback(
    (nextOperations) => {
      modelRef.current = {
        operations: nextOperations,
        undoStack: [],
        redoStack: [],
      };
      publish();
    },
    [publish]
  );

  return {
    operations: view.operations,
    commitOperations,
    commitAssignment,
    undo,
    redo,
    resetHistory,
    canUndo: view.canUndo,
    canRedo: view.canRedo,
  };
}
