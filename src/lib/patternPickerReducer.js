/**
 * Pure reducer for the Pattern Picker gallery (deselected-set model).
 *
 * State shape: { view: 'grid' | 'map', off: Set<familyKey> }
 *   `off` is the set of DESELECTED family keys (empty = all families on).
 *   New families default ON automatically because absence from `off` means on.
 *
 * The reducer is PURE and IMMUTABLE: no side effects (no localStorage, no
 * Date.now, no randomness) and it never mutates the incoming state or its Set —
 * every change returns a new Set instance. Persistence is handled by the hook.
 */

/**
 * Seed state for the reducer. The hook uses this to seed `view` from storage.
 * @param {'grid'|'map'} [view='grid']
 * @returns {{ view: 'grid'|'map', off: Set<string> }}
 */
export function initialPickerState(view = 'grid') {
  return { view, off: new Set() };
}

/**
 * @param {{ view: 'grid'|'map', off: Set<string> }} state
 * @param {object} action
 * @returns {{ view: 'grid'|'map', off: Set<string> }}
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
      // filter reset only; view is intentionally left unchanged
      return { ...state, off: new Set() };

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
