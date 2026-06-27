import { useReducer, useMemo } from 'react';
import { subModeReducer, initialSubModeState } from './subModeReducer.js';

/**
 * React hook wrapping the pure 3D sub-mode state machine (S1 foundation).
 *
 * WebGL-free: it only owns the `{ mode, focusFieldLayerId }` state and exposes
 * stable action callbacks. The actual three.js/R3F render lives behind the
 * lazy-imported <Canvas3DHost>, so importing this hook never pulls three into
 * the 2D bundle.
 *
 * @returns {{
 *   subMode: 'off'|'panel-stack'|'height-surface',
 *   focusFieldLayerId: string|null,
 *   openPanelStack: () => void,
 *   openHeightSurface: (focusFieldLayerId: string) => void,
 *   close: () => void,
 * }}
 */
export function use3DPreview() {
  const [state, dispatch] = useReducer(subModeReducer, undefined, initialSubModeState);

  const actions = useMemo(
    () => ({
      openPanelStack: () => dispatch({ type: 'OPEN_A' }),
      openHeightSurface: (focusFieldLayerId) =>
        dispatch({ type: 'OPEN_B', focusFieldLayerId }),
      close: () => dispatch({ type: 'CLOSE' }),
    }),
    [],
  );

  return {
    subMode: state.mode,
    focusFieldLayerId: state.focusFieldLayerId,
    ...actions,
  };
}
