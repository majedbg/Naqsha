/**
 * Pure sub-mode state machine for the 3D preview (S1 foundation, spec D1/D9).
 *
 * The 3D preview is one shared R3F surface (PRD D1) with two sub-modes that swap
 * INTO the canvas region (p5 hidden, never unmounted):
 *   - 'panel-stack'    → Surface A (stacked acrylic viewer, whole design)
 *   - 'height-surface' → Surface B (a guide layer's modulation relief)
 *   - 'off'            → 2D canvas is showing (no 3D mounted content)
 *
 * State shape:
 *   {
 *     mode: 'off' | 'panel-stack' | 'height-surface',
 *     focusFieldLayerId: string | null,   // Surface B's source guide layer; null otherwise
 *   }
 *
 * This module is PURE and IMMUTABLE — no side effects (no localStorage, no
 * Date.now, no randomness), and it never mutates the incoming state. Persistence
 * (D13) and the R3F render layer are wired elsewhere. This is the primary unit
 * gate for the foundation slice.
 */

/** @typedef {'off' | 'panel-stack' | 'height-surface'} SubMode */
/** @typedef {{ mode: SubMode, focusFieldLayerId: string | null }} SubModeState */

/**
 * Seed state: 3D off, no focused field.
 * @returns {SubModeState}
 */
export function initialSubModeState() {
  return { mode: 'off', focusFieldLayerId: null };
}

/**
 * @param {SubModeState} state
 * @param {{ type: string, focusFieldLayerId?: string | null }} action
 * @returns {SubModeState}
 */
export function subModeReducer(state, action) {
  switch (action.type) {
    case 'OPEN_A':
      // Surface A targets the whole design — no single focused field layer.
      return { mode: 'panel-stack', focusFieldLayerId: null };

    case 'OPEN_B':
      // Surface B focuses one guide layer's modulation field. Coerce undefined
      // to null so the shape stays stable even if a caller omits the id.
      return {
        mode: 'height-surface',
        focusFieldLayerId: action.focusFieldLayerId ?? null,
      };

    case 'CLOSE':
      return { mode: 'off', focusFieldLayerId: null };

    default:
      return state;
  }
}

/**
 * Selector: is any 3D sub-mode active (i.e. should the lazy host mount)?
 * @param {SubModeState} state
 * @returns {boolean}
 */
export function is3DActive(state) {
  return state.mode !== 'off';
}
