import { useCallback, useEffect, useRef } from "react";

// Debounced autosave (Rec 2). A CALLER of the single save path
// (`handleSaveToCloud`), never a second write. Once a design has a cloud
// identity, edits are coalesced into one save after a quiet period, and the
// last edit is flushed on tab-hide / blur / unload so it can't be dropped.
//
// CHANGE SIGNAL (load-bearing): the effect re-runs because `isDirty`'s
// referential identity changes on every edit — its useCallback deps in
// useDesignPersistence are [serializeState, layers, bgColor], so any layer or
// bgColor mutation produces a fresh `isDirty` and re-triggers scheduling. The
// Studio composition ORs name-dirty in by giving the combined `isDirty` a
// `nameDirty` dep, so renames re-trigger too.
//
// Refs hold the LATEST `save`/`isDirty`/gating values so the debounced and
// flush callbacks always act on current state, never a stale closure.
export default function useAutosave({
  enabled,
  hasDesignId,
  isDirty,
  save,
  isSaving = false,
  debounceMs = 2500,
}) {
  const saveRef = useRef(save);
  const isDirtyRef = useRef(isDirty);
  const enabledRef = useRef(enabled);
  const hasDesignIdRef = useRef(hasDesignId);
  const isSavingRef = useRef(isSaving);
  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  // Holds the latest scheduleSave so runSave's post-save trailing check can
  // re-arm the debounce without a forward-reference (scheduleSave is defined
  // after runSave). Refreshed in the per-render ref effect below.
  const scheduleRef = useRef(null);

  // Refresh refs after every render so the debounced/flush callbacks see the
  // current values, never a stale closure. No dep array → runs on each render.
  useEffect(() => {
    saveRef.current = save;
    isDirtyRef.current = isDirty;
    enabledRef.current = enabled;
    hasDesignIdRef.current = hasDesignId;
    isSavingRef.current = isSaving;
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Run a save, but only if gated-in, dirty, and nothing is already saving.
  // The reentrancy guard covers BOTH auto-vs-auto (`inFlightRef`) and the
  // shared save path (`isSavingRef`, e.g. a Cmd/Ctrl+S in flight). On error we
  // do not retry: handleSaveToCloud swallows its own failure, and isDirty's
  // identity won't change without a new edit, so there's no tight loop.
  const runSave = useCallback(() => {
    if (inFlightRef.current || isSavingRef.current) return;
    if (!enabledRef.current || !hasDesignIdRef.current) return;
    if (!isDirtyRef.current()) return;
    inFlightRef.current = true;
    let result;
    try {
      result = saveRef.current();
    } catch {
      /* sync throw: treated like a settled (failed) save */
    }
    Promise.resolve(result)
      .catch(() => {})
      .finally(() => {
        inFlightRef.current = false;
        // Trailing save (Rec 3 / C). An edit that landed DURING this save was
        // never captured by it (and Rec 2 dropped it until the next change).
        // Re-check gating + dirtiness and re-arm the debounce so it persists.
        if (
          enabledRef.current &&
          hasDesignIdRef.current &&
          !isSavingRef.current &&
          isDirtyRef.current()
        ) {
          scheduleRef.current?.();
        }
      });
  }, []);

  const scheduleSave = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      runSave();
    }, debounceMs);
  }, [clearTimer, debounceMs, runSave]);

  // Keep the trailing-save re-arm pointed at the current scheduleSave.
  useEffect(() => {
    scheduleRef.current = scheduleSave;
  }, [scheduleSave]);

  // Flush a pending save immediately (still gated/dirty-guarded inside runSave).
  const flush = useCallback(() => {
    clearTimer();
    runSave();
  }, [clearTimer, runSave]);

  // Schedule on every canvas/name change. See CHANGE SIGNAL note above.
  useEffect(() => {
    if (!enabled || !hasDesignId) return;
    if (!isDirty()) return;
    scheduleSave();
  }, [enabled, hasDesignId, isDirty, scheduleSave]);

  // Flush on tab-hide / window blur / unload so app-switch never drops an edit.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onBlur = () => flush();
    const onBeforeUnload = () => flush();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  // Drop any pending timer on unmount so tests/sessions don't leak.
  useEffect(() => clearTimer, [clearTimer]);
}
