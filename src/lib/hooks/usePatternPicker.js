import { useReducer, useEffect, useCallback } from "react";
import {
  initialPickerState,
  patternPickerReducer,
  isFamilyOn,
} from "../patternPickerReducer";

// usePatternPicker — React state for the Pattern Picker gallery.
//
// Wraps the pure `patternPickerReducer` and layers on the two side effects the
// reducer deliberately omits:
//   • the active VIEW ('grid'|'map') is persisted to its OWN localStorage key
//     (mirrors useColorView — guarded try/catch, SSR/jsdom safe, default fallback),
//   • the family FILTER is reset to all-on every time the picker OPENS (and only
//     on the false→true transition, so it survives tab switches / re-renders).
//
// Per spec the first-run view is Grid; persistence then remembers the last used.

export const PICKER_VIEW_STORAGE_KEY = "sonoform-pattern-picker-view";

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

export default function usePatternPicker({ open, familyKeys = [] }) {
  // Seed `view` from storage once; the reducer's initializer keeps it lazy.
  const [state, dispatch] = useReducer(
    patternPickerReducer,
    undefined,
    () => initialPickerState(loadView()),
  );

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

  return {
    view: state.view,
    setView,
    isOn,
    toggle,
    selectAll,
    clearAll,
  };
}
