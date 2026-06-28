/**
 * Pure decision helper for the Inspector's "Preview in 3D" button (Surface B).
 *
 * three.js-free — lives on the 2D side of the dynamic-import boundary so it's
 * unit-testable in jsdom.
 *
 * The button on a guide layer's MODULATOR panel is a TOGGLE:
 *   - When Surface B (height-surface) is open FOR THIS guide layer, the button
 *     reads "Close preview" and its click CLOSES the preview.
 *   - Otherwise it reads "Preview in 3D" and its click OPENS Surface B focused on
 *     this layer — including when a DIFFERENT guide's preview is currently open
 *     (clicking then re-focuses to this layer via openHeightSurface).
 *
 * `subMode` may be undefined/missing (callers that don't wire 3D state, e.g.
 * legacy/standalone Inspector renders + existing tests) — that collapses to the
 * "open" branch, so the button behaves exactly as before.
 *
 * @param {{ subMode?: string, focusLayerId?: string|null, layerId: string }} input
 * @returns {{ previewingThis: boolean, label: string, action: 'open'|'close' }}
 */
export function previewButtonState({ subMode, focusLayerId, layerId } = {}) {
  const previewingThis =
    subMode === 'height-surface' && focusLayerId != null && focusLayerId === layerId;
  return previewingThis
    ? { previewingThis: true, label: 'Close preview', action: 'close' }
    : { previewingThis: false, label: 'Preview in 3D', action: 'open' };
}
