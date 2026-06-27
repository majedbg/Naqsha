/**
 * lensSelection (S3, PRD D1/D2) — PURE derivation of the canvas lens toggle's
 * single "active lens" from the two independent sources of truth.
 *
 * The toggle (ColorViewControl) is a 3-way radio: Operation | Material | 3D.
 * Operation/Material are owned + persisted by `useColorView` (colorView.mode);
 * the 3D sub-mode is owned by `use3DPreview` (threeD.subMode). Rather than store a
 * third "selected lens" (which would risk desync), the active lens is DERIVED:
 *
 *   - Surface A (`panel-stack`) is the always-on lens PEER → active lens '3d'.
 *   - Surface B (`height-surface`) is NOT a lens (D2) → toggle keeps showing the
 *     underlying 2D lens.
 *   - otherwise → the 2D lens (operation|material).
 *
 * Because entering 3D never mutates colorView, closing 3D (sub-mode → 'off')
 * restores the EXACT prior 2D/lens state BY CONSTRUCTION (D14) — there is no
 * capture/restore reducer to keep in sync.
 *
 * @param {'operation'|'material'} colorViewMode
 * @param {'off'|'panel-stack'|'height-surface'} threeDSubMode
 * @returns {'operation'|'material'|'3d'}
 */
export function deriveActiveLens(colorViewMode, threeDSubMode) {
  if (threeDSubMode === 'panel-stack') return '3d';
  return colorViewMode;
}
