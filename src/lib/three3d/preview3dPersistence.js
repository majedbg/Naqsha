// 3D-preview persistence (PRD D13, slice S11).
//
// Persists ONLY the three view-preference scalars the spec calls out:
//   - subMode       last non-off sub-mode used ('panel-stack' | 'height-surface')
//   - spacing       Surface-A inter-panel gap in mm (Surface A)
//   - exaggeration  Surface-B vertical exaggeration in mm (Surface B)
//
// Camera is DELIBERATELY NOT persisted (D13): the scene always zoom-fits on open
// so the user can never restore into a lost/black view. Per-target drape toggles
// are also not persisted (they re-seed all-on so new targets light up).
//
// Stored in its OWN localStorage key — never the document — so saved/shared/
// exported designs carry no view state. This module is PURE/WebGL-free (it is the
// primary unit gate for S11); the React wiring lives in use3DPreview + Scene3D.

import { SPACING_DEFAULT, SPACING_MIN, SPACING_MAX } from './sheetSpecs.js';
import { EXAG_MIN } from './heightSurface.js';

export const PREVIEW3D_STORAGE_KEY = 'sonoform-3d-preview';

// Only the two real, user-reachable sub-modes are persistable. 'off' is the
// neutral 2D state and is never stored as a "last sub-mode".
const VALID_SUBMODES = new Set(['panel-stack', 'height-surface']);

/**
 * The default, fully-populated settings object.
 *   - subMode: null      → no remembered sub-mode (entry point decides A vs B)
 *   - spacing: 12mm      → SPACING_DEFAULT (D11)
 *   - exaggeration: null → consumer derives the bounds-relative default (D10)
 * @returns {{ subMode: null, spacing: number, exaggeration: null }}
 */
export function defaultPreview3DSettings() {
  return { subMode: null, spacing: SPACING_DEFAULT, exaggeration: null };
}

/**
 * Coerce an arbitrary parsed value into a clean, fully-populated settings object.
 * Unknown/invalid/missing fields fall back to defaults; numbers are validated and
 * (for spacing) clamped to the slider range so a corrupted store can never feed a
 * NaN/out-of-range value into the scene.
 * @param {unknown} raw
 * @returns {{ subMode: ('panel-stack'|'height-surface'|null), spacing: number, exaggeration: (number|null) }}
 */
export function normalizePreview3DSettings(raw) {
  const out = defaultPreview3DSettings();
  if (raw && typeof raw === 'object') {
    if (VALID_SUBMODES.has(raw.subMode)) out.subMode = raw.subMode;
    if (Number.isFinite(raw.spacing)) {
      out.spacing = Math.min(SPACING_MAX, Math.max(SPACING_MIN, raw.spacing));
    }
    // exaggeration max is bounds-dependent (resolved in the scene), so here we
    // only reject non-finite / sub-floor values; the scene clamps to its live max.
    if (Number.isFinite(raw.exaggeration) && raw.exaggeration >= EXAG_MIN) {
      out.exaggeration = raw.exaggeration;
    }
  }
  return out;
}

/**
 * Read + validate the persisted settings. Missing key, malformed JSON, or a
 * disabled/throwing localStorage all collapse to defaults — never throws.
 * @returns {{ subMode: ('panel-stack'|'height-surface'|null), spacing: number, exaggeration: (number|null) }}
 */
export function loadPreview3DSettings() {
  try {
    const raw = localStorage.getItem(PREVIEW3D_STORAGE_KEY);
    if (!raw) return defaultPreview3DSettings();
    return normalizePreview3DSettings(JSON.parse(raw));
  } catch {
    return defaultPreview3DSettings();
  }
}

/**
 * Merge a partial patch over the currently-persisted settings and write it back.
 * Partial updates are safe — writing only `{ spacing }` keeps the stored subMode
 * and exaggeration. Returns the merged settings actually written. Never throws
 * (quota / disabled storage is swallowed, as elsewhere in the app).
 * @param {{ subMode?: string, spacing?: number, exaggeration?: number }} patch
 * @returns {{ subMode: ('panel-stack'|'height-surface'|null), spacing: number, exaggeration: (number|null) }}
 */
export function savePreview3DSettings(patch) {
  const merged = normalizePreview3DSettings({ ...loadPreview3DSettings(), ...patch });
  try {
    localStorage.setItem(PREVIEW3D_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore quota / disabled storage */
  }
  return merged;
}
