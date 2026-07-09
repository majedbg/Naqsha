// workPieceSize — shared display/matching math for the work piece (the Sheet).
// Single-sourced here so the two surfaces that edit the Sheet — the Document
// Setup dialog (File menu) and the SheetInspector (empty-selection Inspector,
// #75) — can never disagree on rounding or preset matching.
//
// canvasW/canvasH are canonical px @96 PPI everywhere; presets are authored in
// inches (PRESET_SIZES). Display happens in the active unit; conversion back
// to px is the caller's boundary (units.js unitToPx + Math.round).

import { PRESET_SIZES, PPI } from "../constants";

// The sentinel "Custom" entry in PRESET_SIZES (width/height: null).
export const CUSTOM_PRESET_INDEX = PRESET_SIZES.findIndex(
  (p) => p.width === null
);

// Round a unit value for display: integers for mm/px, 2dp for inches.
export function roundForUnit(v, unit) {
  if (unit === "in") return Math.round(v * 100) / 100;
  return Math.round(v);
}

// Given live canvas px dims, find the matching named preset (if any) — mirrors
// useCanvasSize's applyCanvasSize matching. Falls back to Custom.
export function presetIndexForSize(w, h) {
  const idx = PRESET_SIZES.findIndex(
    (p) =>
      p.width !== null &&
      Math.round(p.width * PPI) === Math.round(w) &&
      Math.round(p.height * PPI) === Math.round(h)
  );
  return idx >= 0 ? idx : CUSTOM_PRESET_INDEX;
}
