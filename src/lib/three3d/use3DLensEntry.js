import { useState, useCallback } from 'react';
import { deriveActiveLens } from './lensSelection.js';
import { buildDesignSnapshot } from './designSnapshot.js';

/**
 * use3DLensEntry (S3, PRD D1/D2/D14) — the entry + transition coordinator for the
 * always-on Surface A lens.
 *
 * It composes the two existing single-source hooks WITHOUT introducing a third
 * state: `colorView` (operation|material, owned + persisted by useColorView) and
 * `threeD` (sub-mode, owned by use3DPreview). The "active lens" shown by the
 * 3-way toggle (Operation | Material | 3D) is DERIVED, never stored.
 *
 * Transition contract:
 *   - enter3D       → snapshot the CURRENT design (D14, scene is NOT live), then
 *                     open Surface A (sub-mode 'panel-stack'). colorView is left
 *                     untouched, so the prior 2D lens is preserved underneath.
 *   - rebuild       → re-snapshot in place (the "↻ Rebuild" affordance).
 *   - exit3D        → close 3D (sub-mode 'off'); the prior 2D/lens state is
 *                     restored BY CONSTRUCTION. Drops the snapshot.
 *   - selectLens(l) → '3d' enters Surface A; 'operation'/'material' exits 3D (if
 *                     up) and switches the underlying 2D lens.
 *
 * three-free: lives on the 2D side of the dynamic-import boundary.
 *
 * @param {{
 *   colorView: { mode: 'operation'|'material', setMode: (m: string) => void },
 *   threeD: { subMode: 'off'|'panel-stack'|'height-surface', openPanelStack: () => void, close: () => void },
 *   captureDesign: () => { layers?: object[], panels?: object[], operations?: object[], machineProfile?: string|null },
 * }} deps
 */
export function use3DLensEntry({ colorView, threeD, captureDesign }) {
  const [snapshot, setSnapshot] = useState(null);

  const activeLens = deriveActiveLens(colorView.mode, threeD.subMode);

  const enter3D = useCallback(() => {
    setSnapshot(buildDesignSnapshot(captureDesign()));
    threeD.openPanelStack();
  }, [captureDesign, threeD]);

  const rebuild = useCallback(() => {
    setSnapshot(buildDesignSnapshot(captureDesign()));
  }, [captureDesign]);

  const exit3D = useCallback(() => {
    threeD.close();
    setSnapshot(null);
  }, [threeD]);

  const selectLens = useCallback(
    (lens) => {
      if (lens === '3d') {
        enter3D();
        return;
      }
      // A 2D lens (operation|material). Leave 3D first so the toggle never shows
      // two active lenses, then switch the underlying lens.
      if (threeD.subMode !== 'off') {
        threeD.close();
        setSnapshot(null);
      }
      colorView.setMode(lens);
    },
    [enter3D, threeD, colorView],
  );

  return { activeLens, snapshot, enter3D, exit3D, rebuild, selectLens };
}
