import { supabase } from './supabase';

// Per-user pattern-picker preferences live in the `profiles.settings` jsonb
// column, namespaced under `patternPicker` (e.g. { sortMode, manualOrder }).
//
// IMPORTANT — last-write-wins: the caller passes `baseSettings` (the already
// in-memory profile.settings) so we can merge + write in ONE round trip, with
// no read-before-write. That makes this last-write-wins, which is fine for the
// current single-user / single-tab usage. A future SECOND writer into the same
// blob (e.g. moving `colorView` prefs into profiles.settings) must re-read the
// row before writing, or it will silently clobber whatever the picker wrote.

/**
 * Pure read of the patternPicker namespace from an already-fetched profile row.
 * @returns the { sortMode, manualOrder, ... } object, or null when absent.
 */
export function getPatternPickerSettings(profile) {
  return profile?.settings?.patternPicker ?? null;
}

/**
 * Pure merge helper: deep-merges `pickerSettings` into the `patternPicker`
 * namespace of `baseSettings`, preserving every other top-level settings key.
 * Returns a NEW object (does not mutate `baseSettings`).
 */
export function mergePatternPicker(baseSettings = {}, pickerSettings = {}) {
  const base = baseSettings || {};
  return {
    ...base,
    patternPicker: { ...(base.patternPicker || {}), ...pickerSettings },
  };
}

/**
 * Merge `pickerSettings` into `baseSettings.patternPicker` and persist the
 * whole settings blob to `profiles.settings` for `userId`.
 *
 * GUARDED: no supabase client (local dev / unconfigured backend) OR no userId
 * (guest) => NO-OP that resolves without throwing. On a supabase error we log
 * and return an error-shaped result rather than throwing (callers fire this on
 * drag-end / toggle and must not crash the UI on a transient write failure).
 *
 * @returns {Promise<{ok:true, settings:object} | {ok:false, skipped:true} | {ok:false, error:object}>}
 */
export async function writePatternPickerSettings(userId, pickerSettings, baseSettings = {}) {
  // Guest or unconfigured backend — nothing to persist.
  if (!supabase || !userId) return { ok: false, skipped: true };

  const settings = mergePatternPicker(baseSettings, pickerSettings);

  const { error } = await supabase
    .from('profiles')
    .update({ settings })
    .eq('id', userId);

  if (error) {
    console.warn('Failed to persist pattern-picker settings:', error.message);
    return { ok: false, error };
  }
  return { ok: true, settings };
}
