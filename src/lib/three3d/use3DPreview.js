import { useReducer, useMemo, useEffect } from 'react';
import { subModeReducer, initialSubModeState } from './subModeReducer.js';
import { savePreview3DSettings } from './preview3dPersistence.js';

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

  // Persist the last NON-off sub-mode (D13/S11). We record it but never
  // auto-reopen 3D: per D14, closing restores the prior 2D view and opening
  // always reframes via zoom-fit — so persistence here is a recorded preference,
  // not an auto-launch. Camera is deliberately NOT persisted.
  useEffect(() => {
    if (state.mode !== 'off') {
      savePreview3DSettings({ subMode: state.mode });
    }
  }, [state.mode]);

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
