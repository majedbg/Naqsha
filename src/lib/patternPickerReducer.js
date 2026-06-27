/**
 * Pure reducer for the Pattern Picker gallery (deselected-set model).
 *
 * State shape:
 *   {
 *     view: 'grid' | 'map',
 *     off: Set<familyKey>,            // DESELECTED family keys (empty = all on)
 *     sortMode: 'auto' | 'custom',    // 'auto' = family-clustered; 'custom' = manualOrder
 *     manualOrder: string[],          // pattern ids, full order (NOT filtered)
 *     dragPrevMode: 'auto'|'custom'|null  // transient: mode at drag-start, for Escape-revert
 *   }
 *
 *   `off` is the set of DESELECTED family keys (empty = all families on).
 *   New families default ON automatically because absence from `off` means on.
 *
 * The reducer is PURE and IMMUTABLE: no side effects (no localStorage, no
 * Date.now, no randomness) and it never mutates the incoming state, its Set, or
 * its arrays — every change returns new instances. Persistence and drag wiring
 * are handled by the hook / dnd-kit layer.
 *
 * NOTE: dnd-kit drags cannot be unit-tested in jsdom (0×0 getBoundingClientRect
 * breaks collision for both pointer and keyboard sensors), so manual-order
 * correctness is proven HERE via the MOVE/SEED_MANUAL/RESET_MANUAL and drag
 * lifecycle actions — exhaustively covered in the reducer test.
 */

/**
 * Seed state for the reducer. The hook uses this to seed `view` from storage and
 * (later) `sortMode`/`manualOrder` from persisted settings.
 * @param {'grid'|'map'} [view='grid']
 * @param {{ sortMode?: 'auto'|'custom', manualOrder?: string[] }} [seeds]
 * @returns {{ view: 'grid'|'map', off: Set<string>, sortMode: 'auto'|'custom', manualOrder: string[], dragPrevMode: null }}
 */
export function initialPickerState(
  view = 'grid',
  { sortMode = 'auto', manualOrder = [] } = {},
) {
  return {
    view,
    off: new Set(),
    sortMode,
    manualOrder: [...manualOrder],
    dragPrevMode: null,
  };
}

/**
 * @param {object} state
 * @param {object} action
 * @returns {object}
 */
export function patternPickerReducer(state, action) {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, view: action.view };

    case 'TOGGLE_FAMILY': {
      const off = new Set(state.off);
      if (off.has(action.key)) off.delete(action.key);
      else off.add(action.key);
      return { ...state, off };
    }

    case 'SELECT_ALL':
      return { ...state, off: new Set() };

    case 'CLEAR_ALL':
      return { ...state, off: new Set(action.keys) };

    case 'RESET':
      // filter reset only; view / sort state intentionally left unchanged
      return { ...state, off: new Set() };

    case 'SET_SORT_MODE':
      return { ...state, sortMode: action.mode };

    case 'SEED_MANUAL': {
      // Reconcile manualOrder with the current id set:
      //   keep existing entries that still appear in `ids` (preserving order),
      //   then append any `ids` not already present (NEW/AI patterns → end),
      //   and drop ids no longer present.
      const ids = action.ids ?? [];
      const idsSet = new Set(ids);
      const existing = state.manualOrder.filter((id) => idsSet.has(id));
      const existingSet = new Set(existing);
      const appended = ids.filter((id) => !existingSet.has(id));
      return { ...state, manualOrder: [...existing, ...appended] };
    }

    case 'MOVE': {
      // Remove `id` and reinsert at `toIndex` (clamped into the post-removal
      // range). No-op if `id` is absent (safe behavior).
      const from = state.manualOrder.indexOf(action.id);
      if (from === -1) return state;
      const next = state.manualOrder.slice();
      next.splice(from, 1);
      // After removal, valid insertion indices are [0, next.length].
      const clamped = Math.max(0, Math.min(action.toIndex, next.length));
      next.splice(clamped, 0, action.id);
      return { ...state, manualOrder: next };
    }

    case 'RESET_MANUAL':
      // "Reset order" to a supplied order (e.g. family order).
      return { ...state, manualOrder: [...(action.ids ?? [])] };

    case 'DRAG_START':
      // Auto-switch to custom on drag begin; remember prior mode for Escape.
      return { ...state, dragPrevMode: action.prevMode, sortMode: 'custom' };

    case 'DRAG_CANCEL':
      // Escape mid-drag: revert to the mode we had at drag-start.
      return {
        ...state,
        sortMode: state.dragPrevMode ?? state.sortMode,
        dragPrevMode: null,
      };

    case 'DRAG_COMMIT':
      // Drop committed: keep current (custom) sortMode, clear the transient.
      return { ...state, dragPrevMode: null };

    default:
      return state;
  }
}

/**
 * Selector: a family is on unless it is in the deselected set.
 * @param {{ off: Set<string> }} state
 * @param {string} key
 * @returns {boolean}
 */
export function isFamilyOn(state, key) {
  return !state.off.has(key);
}
