import { supabase } from './supabase';

// Per-user Export preferences live in the `profiles.settings` jsonb column,
// namespaced under `export` (currently just { cropToSheet }). This preference
// backs the Run Plan's Export Receipt — whether an export is cropped to the
// Sheet — and is surfaced as a Preferences toggle.
//
// IMPORTANT — this is the SECOND writer settingsService warns about. That module
// merges + writes patternPicker in ONE round trip with NO read-before-write
// (last-write-wins), which is safe only while it is the sole writer into the
// blob. This module writes a DIFFERENT namespace (`export`) into the SAME row,
// so it MUST re-read the freshly-persisted `settings` before writing: skipping
// the read would clobber whatever patternPicker (or any other namespace) another
// tab/writer just wrote. Read-before-write here is not caution — it is the whole
// point of the lane.

// Guest / unconfigured-backend fallback lives in localStorage. Stable key
// (documented deviation: repo elsewhere uses a `sonoform-` prefix, but the app
// is now Naqsha and the Run Plan surfaces adopt the `naqsha-` prefix).
const EXPORT_SETTINGS_KEY = 'naqsha-export-settings';

// Schema default: crop-to-Sheet is ON unless the user has turned it off.
const DEFAULT_EXPORT_SETTINGS = { cropToSheet: true };

/**
 * Pure read of the `export` namespace. Accepts either a fetched profile row
 * ({ id, settings }) or a bare settings blob ({ export: {...} }), returning the
 * resolved { cropToSheet } with the default (true) applied when absent.
 */
export function getExportSettings(profileOrSettings) {
  // A profile row nests under `.settings`; a bare settings blob is used as-is.
  const settings = profileOrSettings?.settings ?? profileOrSettings;
  return { cropToSheet: settings?.export?.cropToSheet ?? DEFAULT_EXPORT_SETTINGS.cropToSheet };
}

/**
 * Pure merge helper mirroring settingsService.mergePatternPicker: deep-merges
 * `exportPatch` into the `export` namespace of `baseSettings`, preserving every
 * other top-level settings key (esp. patternPicker). Returns a NEW object
 * (does not mutate `baseSettings`).
 */
export function mergeExport(baseSettings = {}, exportPatch = {}) {
  const base = baseSettings || {};
  return {
    ...base,
    export: { ...(base.export || {}), ...exportPatch },
  };
}

/**
 * Merge `exportPatch` into the `export` namespace and persist the whole settings
 * blob to `profiles.settings` for `userId`, doing a READ-BEFORE-WRITE so the
 * patternPicker (and any other) namespace is preserved — see the IMPORTANT block.
 *
 * GUARDED: no supabase client (unconfigured backend) OR no userId (guest) =>
 * fall back to localStorage. On a supabase read/update error we log and return
 * an error-shaped result rather than throwing (a toggle in Preferences must not
 * crash the UI on a transient write failure).
 *
 * @returns {Promise<{ok:true, settings:object} | {ok:true, local:true, export:object} | {ok:false, error:object}>}
 */
export async function writeExportSettings(userId, exportPatch) {
  // Guest or unconfigured backend — persist locally instead of clobbering nothing.
  if (!supabase || !userId) return writeGuestExportSettings(exportPatch);

  // READ: pull the freshly-persisted row so we merge onto current siblings.
  const { data, error: readError } = await supabase
    .from('profiles')
    .select('settings')
    .eq('id', userId)
    .single();

  if (readError) {
    console.warn('Failed to read settings before export write:', readError.message);
    return { ok: false, error: readError };
  }

  const settings = mergeExport(data?.settings || {}, exportPatch);

  // WRITE: the merged blob still carries every sibling namespace.
  const { error } = await supabase
    .from('profiles')
    .update({ settings })
    .eq('id', userId);

  if (error) {
    console.warn('Failed to persist export settings:', error.message);
    return { ok: false, error };
  }
  return { ok: true, settings };
}

/**
 * Guest reader: read the `export` namespace from the same localStorage key with
 * the default (cropToSheet true) applied.
 */
export function getGuestExportSettings() {
  return { cropToSheet: readGuestExport()?.cropToSheet ?? DEFAULT_EXPORT_SETTINGS.cropToSheet };
}

// ─── guest localStorage helpers ──────────────────────────────────────────────

function readGuestExport() {
  try {
    const raw = localStorage.getItem(EXPORT_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeGuestExportSettings(exportPatch = {}) {
  try {
    // Read-before-write within localStorage too, so a partial patch does not
    // drop previously-stored keys of the export namespace.
    const next = { ...readGuestExport(), ...exportPatch };
    localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(next));
    return { ok: true, local: true, export: next };
  } catch (error) {
    console.warn('Failed to persist guest export settings:', error?.message);
    return { ok: false, error };
  }
}
