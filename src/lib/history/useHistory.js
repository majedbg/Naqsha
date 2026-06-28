import { useCallback, useEffect, useRef, useState } from "react";
import { cloneSnapshot } from "./snapshot";

// useHistory — the unified, app-wide undo/redo engine (decision D2/D3). A
// generalized port of the proven useOperationsHistory engine: same
// ref-as-synchronous-source-of-truth + imperative-recording discipline, but it
// OWNS NO document state. It is handed two closures —
//
//   capture()        () => Snapshot      read ALL slices synchronously (deep clone)
//   restore(Snapshot) (Snapshot) => void write ALL slices back synchronously
//
// — and owns only the two stacks (`past`, `future`).
//
// THE OFF-BY-ONE CRUX (§3.1). `present` is NEVER stored eagerly. The trap is
// `present = capture()` taken right AFTER a mutation: the document's refs lag
// setState by a commit, so that capture grabs the STALE pre-edit state and
// redo-after-undo silently restores the wrong doc. We sidestep it entirely:
//   - record() is capture-BEFORE-change. It pushes capture() (the pre-edit
//     snapshot, when refs unambiguously hold pre-edit state) onto `past` and
//     clears `future`. Recording happens in action callbacks, immediately
//     before the mutation runs.
//   - present is RECONSTRUCTED via capture() at the undo/redo boundary — by then
//     a render has flushed and the refs have caught up, so capture() is true.
// This matches beginCoalesce (S2), which also captures before the gesture.
//
// Recording is IMPERATIVE (called from action callbacks), never in an effect, so
// undo/redo re-application (which only calls restore) cannot self-trigger a fresh
// record — no suppression flag needed (invariant I6).

export default function useHistory({ capture, restore, limit = 50 } = {}) {
  // The model is the SYNCHRONOUS source of truth (refs, not state) so a single
  // handler pass can pop/push/restore in order — setState updaters run lazily,
  // which would break that sequence. Refs are mutated ONLY in event handlers
  // (the refs lint rule forbids render-phase access, not handler access).
  const modelRef = useRef({ past: [], future: [] });

  // Coalescing (§5). An OPEN window holds ONE pre-gesture snapshot; intermediate
  // record()s are absorbed into it, so a 60-frame drag or a typing burst commits
  // a single entry (invariant I4). `timer` drives the 400ms idle auto-close for
  // text bursts; gesture paths (slider/canvas drag) just begin on pointerdown
  // and end on pointerup with no timer.
  const pendingRef = useRef({ open: false, snapshot: null });
  const timerRef = useRef(null);

  // Render-facing mirror. publish() copies the derived enablement flags into
  // state to trigger a re-render; render never reads modelRef.
  const [view, setView] = useState({ canUndo: false, canRedo: false });
  const publish = useCallback(() => {
    const m = modelRef.current;
    setView({ canUndo: m.past.length > 0, canRedo: m.future.length > 0 });
  }, []);

  // Keep the latest capture/restore in refs so the stable callbacks below read
  // the CURRENT closures without being re-created each render. Synced in an
  // effect (not during render) to satisfy the refs lint rule.
  const captureRef = useRef(capture);
  const restoreRef = useRef(restore);
  useEffect(() => {
    captureRef.current = capture;
    restoreRef.current = restore;
  });

  // Push a pre-edit snapshot onto `past` as one entry: clear `future` (no
  // branching) and enforce the depth cap by dropping the OLDEST first (I8).
  const commitEntry = useCallback(
    (snapshot) => {
      const m = modelRef.current;
      let past = [...m.past, snapshot];
      if (past.length > limit) past = past.slice(past.length - limit);
      modelRef.current = { past, future: [] };
      publish();
    },
    [limit, publish]
  );

  // record() — capture-BEFORE-change. Snapshot the pre-edit document and commit
  // it as one entry. Call this immediately before the mutation runs. While a
  // coalesce window is OPEN, record() is SUPPRESSED — the intermediate change is
  // absorbed into the open entry (so a drag/typing burst stays one entry, I4).
  const record = useCallback(() => {
    if (pendingRef.current.open) return;
    commitEntry(captureRef.current());
  }, [commitEntry]);

  // endCoalesce() — close the open window, committing its single pre-gesture
  // snapshot. The 400ms idle timer AND an explicit blur/Enter both call this;
  // it cancels any pending timer and is a no-op when no window is open.
  const endCoalesce = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending.open) return;
    pendingRef.current = { open: false, snapshot: null };
    commitEntry(pending.snapshot);
  }, [commitEntry]);

  // beginCoalesce() — open a coalesce window, capturing the pre-gesture snapshot
  // ONCE (idempotent: re-opening an already-open window does NOT re-capture, so
  // the baseline stays the true pre-gesture state). Pass `{ idleMs }` for text
  // bursts to (re)arm an idle auto-close; gesture paths omit it and close
  // explicitly on pointerup.
  const beginCoalesce = useCallback(
    (opts = {}) => {
      if (!pendingRef.current.open) {
        pendingRef.current = { open: true, snapshot: captureRef.current() };
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (opts.idleMs) {
        timerRef.current = setTimeout(() => endCoalesce(), opts.idleMs);
      }
    },
    [endCoalesce]
  );

  const undo = useCallback(() => {
    // Flush any OPEN coalesce window first. The real ⌘Z case is undo within the
    // 400ms idle (focus still in the field, no blur): the pre-edit snapshot is
    // in `pending`, not yet in `past`. Committing it first means undo lands on a
    // real prior state and the in-flight burst vanishes in one step (the
    // text-editor model) instead of stranding the pending snapshot.
    endCoalesce();
    const m = modelRef.current;
    if (m.past.length === 0) return;
    // Reconstruct the present from the live doc (refs have settled by now), park
    // it on `future`, pop the previous snapshot, and write it back.
    const present = captureRef.current();
    const prev = m.past[m.past.length - 1];
    modelRef.current = {
      past: m.past.slice(0, -1),
      future: [...m.future, present],
    };
    restoreRef.current(cloneSnapshot(prev));
    publish();
  }, [publish, endCoalesce]);

  const redo = useCallback(() => {
    // Symmetric flush (see undo): committing an open burst clears `future`, so a
    // mid-burst redo simply lands on the just-committed burst — never strands it.
    endCoalesce();
    const m = modelRef.current;
    if (m.future.length === 0) return;
    const present = captureRef.current();
    const next = m.future[m.future.length - 1];
    modelRef.current = {
      past: [...m.past, present],
      future: m.future.slice(0, -1),
    };
    restoreRef.current(cloneSnapshot(next));
    publish();
  }, [publish, endCoalesce]);

  // Drop any open coalesce window + pending idle timer. Called from clear/seed
  // so a load/profile-switch mid-gesture can't leave a dangling pre-gesture
  // snapshot that later commits against the NEW document.
  const resetCoalesce = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = { open: false, snapshot: null };
  }, []);

  // clear() — empty both stacks WITHOUT recording or restoring. Used on
  // design-load / draft-restore / new-doc / machine-profile switch (lifecycle
  // §6); the previous document's snapshots must never be reachable (I5/I9).
  const clear = useCallback(() => {
    resetCoalesce();
    modelRef.current = { past: [], future: [] };
    publish();
  }, [publish, resetCoalesce]);

  // seed() — establish a fresh baseline. Identical to clear() for the live
  // model (present is always reconstructed via capture()); kept as a distinct
  // verb because the lifecycle distinguishes "first mount baseline" from
  // "discard prior history." Persistence (S8) restores the seed snapshot before
  // calling this.
  const seed = useCallback(() => {
    resetCoalesce();
    modelRef.current = { past: [], future: [] };
    publish();
  }, [publish, resetCoalesce]);

  // Cancel a pending idle timer on unmount so it can't fire into a torn-down
  // tree (a setState-after-unmount warning / stray commit).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return {
    record,
    beginCoalesce,
    endCoalesce,
    undo,
    redo,
    clear,
    seed,
    canUndo: view.canUndo,
    canRedo: view.canRedo,
  };
}
