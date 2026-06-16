import { useReducer, useCallback, useMemo } from "react";

export function initHistory(present) {
  return { past: [], present, future: [] };
}

export function historyReducer(state, action) {
  switch (action.type) {
    case "commit":
      return { past: [...state.past, state.present], present: action.present, future: [] };
    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: prev,
        future: [state.present, ...state.future],
      };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [nextPresent, ...restFuture] = state.future;
      return {
        past: [...state.past, state.present],
        present: nextPresent,
        future: restFuture,
      };
    }
    case "reset":
      // Install a freshly-loaded design as the new baseline: present becomes the
      // loaded state and BOTH stacks clear, so undo can't walk back into the
      // previous design's edits.
      return { past: [], present: action.present, future: [] };
    default:
      return state;
  }
}

export function canUndo(state) {
  return state.past.length > 0;
}

export function canRedo(state) {
  return state.future.length > 0;
}

/**
 * Thin React wrapper over the pure history reducer.
 *
 * `present` is opaque, serializable state (the caller passes scene-graph
 * snapshots); this module makes no assumption about its shape.
 *
 * COALESCING CONTRACT: one `commit(nextPresent)` == one user-visible
 * undoable action. Coalescing continuous gestures (e.g. a drag firing many
 * mousemoves, or live typing) into a single entry is the CALLER's
 * responsibility — commit once when the gesture settles, NOT per intermediate
 * event. This hook never snapshots on its own.
 */
export function useHistory(initialPresent) {
  const [state, dispatch] = useReducer(historyReducer, initialPresent, initHistory);

  const commit = useCallback((nextPresent) => {
    dispatch({ type: "commit", present: nextPresent });
  }, []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  // Replace the present with a loaded design and clear the undo/redo stacks.
  const reset = useCallback((present) => {
    dispatch({ type: "reset", present });
  }, []);

  return useMemo(
    () => ({
      present: state.present,
      commit,
      undo,
      redo,
      reset,
      canUndo: canUndo(state),
      canRedo: canRedo(state),
    }),
    [state, commit, undo, redo, reset]
  );
}
