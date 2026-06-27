import { useReducer, useEffect, useCallback, useRef } from "react";
import {
  initialPickerState,
  patternPickerReducer,
  isFamilyOn,
} from "../patternPickerReducer";
import { useAuth } from "../AuthContext";
import {
  getPatternPickerSettings,
  writePatternPickerSettings,
} from "../settingsService";

// usePatternPicker — React state for the Pattern Picker gallery.
//
// Wraps the pure `patternPickerReducer` and layers on the side effects the
// reducer deliberately omits:
//   • the active VIEW ('grid'|'map') is persisted to its OWN localStorage key
//     (mirrors useColorView — guarded try/catch, SSR/jsdom safe, default fallback),
//   • the family FILTER is reset to all-on every time the picker OPENS (and only
//     on the false→true transition, so it survives tab switches / re-renders),
//   • the SORT prefs (sortMode + manualOrder) are persisted SEPARATELY: hydrated
//     once after auth resolves (DB-wins-else-adopt-local, decision #4) and written
//     on every committed change (localStorage immediate + debounced DB for logged-in).
//
// Sort persistence rules (decisions #3/#4/#6):
//   - HYDRATE once after auth resolves:
//       logged-in + DB present      → seed from DB
//       logged-in + DB empty + local→ adopt local AND write it up one-time
//       guest + local               → seed from local (no DB write)
//       otherwise                   → defaults (auto / [])
//   - WRITE on committed change (sort toggle, drag-END, reset) — never per-move,
//     never during a drag: localStorage immediately + (logged-in) DB debounced.

export const PICKER_VIEW_STORAGE_KEY = "sonoform-pattern-picker-view";
export const PICKER_SORT_STORAGE_KEY = "sonoform-pattern-picker-sort";

const DB_WRITE_DEBOUNCE_MS = 600;

// Read the persisted view, validating it. Anything unexpected → 'grid'.
function loadView() {
  try {
    const raw = localStorage.getItem(PICKER_VIEW_STORAGE_KEY);
    if (raw === "grid" || raw === "map") return raw;
  } catch {
    /* storage disabled / unavailable — fall through to default */
  }
  return "grid";
}

// Read + validate the persisted sort prefs. null when absent/unparseable.
function loadSort() {
  try {
    const raw = localStorage.getItem(PICKER_SORT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSort(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Coerce an arbitrary value into a valid { sortMode, manualOrder } shape, or
// null when it carries nothing usable.
function normalizeSort(value) {
  if (!value || typeof value !== "object") return null;
  const sortMode = value.sortMode === "custom" ? "custom" : "auto";
  const manualOrder = Array.isArray(value.manualOrder)
    ? value.manualOrder.filter((id) => typeof id === "string")
    : [];
  return { sortMode, manualOrder };
}

// Write the sort prefs to localStorage (guarded; never throws).
function saveSort({ sortMode, manualOrder }) {
  try {
    localStorage.setItem(
      PICKER_SORT_STORAGE_KEY,
      JSON.stringify({ sortMode, manualOrder }),
    );
  } catch {
    /* ignore quota / disabled storage */
  }
}

export default function usePatternPicker({ open, familyKeys = [] }) {
  const { user, profile, loading } = useAuth();

  // Seed `view` from storage once; the reducer's initializer keeps it lazy.
  // Sort prefs are seeded later (after auth resolves) via the hydration effect.
  const [state, dispatch] = useReducer(
    patternPickerReducer,
    undefined,
    () => initialPickerState(loadView()),
  );

  // Always-fresh snapshot so the lifecycle callbacks can read current state
  // without re-creating (keeps them []-stable).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist the view whenever it changes (never throws).
  useEffect(() => {
    try {
      localStorage.setItem(PICKER_VIEW_STORAGE_KEY, state.view);
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [state.view]);

  // Reset the filter (not the view) each time the picker opens. Keyed on `open`
  // only, so it fires on the false→true transition and not on every render or
  // tab switch. RESET is idempotent, so re-running when open stays true is safe;
  // we still guard to avoid dispatching while closed.
  useEffect(() => {
    if (open) dispatch({ type: "RESET" });
  }, [open]);

  // ── Sort persistence ────────────────────────────────────────────────────

  // Hydrate sort prefs ONCE, after auth resolves. Guarded by a ref so later
  // user edits are never clobbered by a re-run.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (loading) return; // wait for auth to resolve
    if (hydratedRef.current) return;
    // Mark hydrated BEFORE dispatching seeds so the persist effect (gated on
    // persistRef) never mistakes seeding for a committed change.
    hydratedRef.current = true;

    const local = loadSort();
    const db = normalizeSort(getPatternPickerSettings(profile));

    let seed = null;
    if (user && db) {
      // Logged-in with DB prefs → DB wins.
      seed = db;
    } else if (user && local) {
      // Logged-in, DB empty, local present → adopt local AND write it up once.
      seed = local;
      writePatternPickerSettings(user.id, local, profile?.settings ?? {});
    } else if (!user && local) {
      // Guest → seed from local, no DB write.
      seed = local;
    }

    if (seed) {
      dispatch({ type: "SET_SORT_MODE", mode: seed.sortMode });
      dispatch({ type: "RESET_MANUAL", ids: seed.manualOrder });
    }
  }, [loading, user, profile]);

  // Persist committed sort changes. Fires whenever sortMode/manualOrder change,
  // but only acts when a lifecycle method flagged the change as committed via
  // `persistRef` — so hydration seeds and transient drag states never write.
  const persistRef = useRef(false);
  const dbTimerRef = useRef(null);
  useEffect(() => {
    if (!persistRef.current) return;
    persistRef.current = false;

    const payload = {
      sortMode: state.sortMode,
      manualOrder: state.manualOrder,
    };
    // localStorage: immediate (offline cache + guest source of truth).
    saveSort(payload);
    // DB: debounced, logged-in only. Fire-and-forget — writePatternPickerSettings
    // never throws (returns {ok}/{skipped}/{error}); nothing to await here.
    if (user) {
      if (dbTimerRef.current) clearTimeout(dbTimerRef.current);
      dbTimerRef.current = setTimeout(() => {
        dbTimerRef.current = null;
        writePatternPickerSettings(user.id, payload, profile?.settings ?? {});
      }, DB_WRITE_DEBOUNCE_MS);
    }
  }, [state.sortMode, state.manualOrder, user, profile]);

  // Flush/cancel any pending debounced write on unmount.
  useEffect(
    () => () => {
      if (dbTimerRef.current) clearTimeout(dbTimerRef.current);
    },
    [],
  );

  // ── View / filter API (unchanged) ──────────────────────────────────────
  const setView = useCallback((view) => dispatch({ type: "SET_VIEW", view }), []);
  const isOn = useCallback((key) => isFamilyOn(state, key), [state]);
  const toggle = useCallback(
    (key) => dispatch({ type: "TOGGLE_FAMILY", key }),
    [],
  );
  const selectAll = useCallback(() => dispatch({ type: "SELECT_ALL" }), []);
  const clearAll = useCallback(
    () => dispatch({ type: "CLEAR_ALL", keys: familyKeys }),
    [familyKeys],
  );

  // ── Sort + drag lifecycle API ──────────────────────────────────────────
  // Each method dispatches the slice-3 reducer actions and flags persistence
  // only for COMMITTED changes (toggle, drag-end, reset) — never mid-drag.

  const setSortMode = useCallback((mode) => {
    persistRef.current = true;
    dispatch({ type: "SET_SORT_MODE", mode });
  }, []);

  // Explicit Custom entry from the toggle. orderIds = current on-screen
  // Auto/family order, supplied by the component. Seeds manualOrder if empty.
  const enterCustom = useCallback((orderIds = []) => {
    persistRef.current = true;
    if (stateRef.current.manualOrder.length === 0) {
      dispatch({ type: "SEED_MANUAL", ids: orderIds });
    }
    dispatch({ type: "SET_SORT_MODE", mode: "custom" });
  }, []);

  // Drag begins. Seed from the visible set if needed, then promote to custom for
  // the gesture (remembering prior mode for Escape-revert). No persist mid-drag.
  const startDrag = useCallback((currentMode, visibleIds = []) => {
    persistRef.current = false; // neutralize any stale committed flag
    if (stateRef.current.manualOrder.length === 0) {
      dispatch({ type: "SEED_MANUAL", ids: visibleIds });
    }
    dispatch({ type: "DRAG_START", prevMode: currentMode });
  }, []);

  // Escape mid-drag: revert to the mode at drag-start. No persist (reverting).
  const cancelDrag = useCallback(() => {
    persistRef.current = false; // neutralize any stale committed flag
    dispatch({ type: "DRAG_CANCEL" });
  }, []);

  // Drop committed: reorder + keep custom + persist (this is the drag-END write).
  const commitDrag = useCallback((id, toIndex) => {
    persistRef.current = true;
    dispatch({ type: "MOVE", id, toIndex });
    dispatch({ type: "DRAG_COMMIT" });
  }, []);

  // "Reset order" affordance: restore manualOrder to the supplied family order.
  const resetManual = useCallback((familyOrderIds = []) => {
    persistRef.current = true;
    dispatch({ type: "RESET_MANUAL", ids: familyOrderIds });
  }, []);

  return {
    // view / filter
    view: state.view,
    setView,
    isOn,
    toggle,
    selectAll,
    clearAll,
    // sort state
    sortMode: state.sortMode,
    manualOrder: state.manualOrder,
    // sort + drag lifecycle
    setSortMode,
    enterCustom,
    startDrag,
    cancelDrag,
    commitDrag,
    resetManual,
  };
}
