// LibraryRepository — persistence for the personal Pattern Library (S0 spine,
// issue #49; PRD #48 "Domain / persistence").
//
// One entity, two surfaces (locked decision 6): rows in the unified
// `user_patterns` table (migration 009, source='extracted') back BOTH the
// future Library view and the picker's custom family. This module owns the
// Supabase side: CRUD + the private per-user `pattern-photos` bucket.
//
// Persistence is DELIBERATELY best-effort, mirroring aiPatternService: a
// guest, a missing supabase config, an unapplied migration, or an RLS denial
// must never dead-end the flow — the pattern still registers for the session
// and the caller learns why via { persisted:false, reason }.

import { supabase } from './supabase';
import {
  serializeExtractedPattern,
  deserializeExtractedPattern,
} from './extraction/extractedPattern';
import { registerExtractedPattern } from './patterns/ExtractedPatternGenerator';
import { unregisterPattern } from './patternRegistry';

export const PHOTO_BUCKET = 'pattern-photos';
const TABLE = 'user_patterns';

async function authedUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/**
 * Persist an ExtractedPattern: upload the original photo (best-effort) into
 * `<uid>/<patternId>.<ext>` of the private bucket, then insert the serialized
 * row. Returns { entity, persisted, reason?, record? } — `entity` carries the
 * final photoPath.
 */
export async function saveExtractedPattern(entity, { photoBlob, photoExt = 'png' } = {}) {
  if (!supabase) return { entity, persisted: false, reason: 'no-supabase' };

  const user = await authedUser();
  if (!user) return { entity, persisted: false, reason: 'guest' };

  let saved = { ...entity, photoPath: entity.photoPath ?? null };

  if (photoBlob) {
    const path = `${user.id}/${entity.patternId}.${photoExt}`;
    const { error: upErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, photoBlob, { contentType: photoBlob.type, upsert: false });
    if (upErr) {
      console.warn('Pattern photo upload failed (pattern still saved):', upErr.message);
      saved = { ...saved, photoPath: null };
    } else {
      saved = { ...saved, photoPath: path };
    }
  }

  const { error } = await supabase
    .from(TABLE)
    .insert({ ...serializeExtractedPattern(saved), user_id: user.id });
  if (error) {
    return { entity: saved, persisted: false, reason: `save failed: ${error.message}` };
  }
  return { entity: saved, persisted: true };
}

/** All extracted rows for a user, newest first. */
export async function listExtractedPatterns(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('source', 'extracted');
  if (error) {
    console.warn('Failed to list extracted patterns:', error.message);
    return [];
  }
  // Newest first; sorted client-side so the mock builder stays minimal.
  return (data || [])
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

/** Delete one extracted pattern row and drop it from the runtime registry. */
export async function deleteExtractedPattern(patternId) {
  if (supabase) {
    const { error } = await supabase.from(TABLE).delete().eq('pattern_id', patternId);
    if (error) console.warn('Failed to delete extracted pattern:', error.message);
  }
  unregisterPattern(patternId);
}

/**
 * Load a user's extracted patterns and register each into the dynamic
 * registry (→ picker custom family). Corrupt rows are skipped with a warning
 * so one bad record never hides the rest of the library.
 */
export async function loadAndRegisterExtractedPatterns(userId) {
  const rows = await listExtractedPatterns(userId);
  const entities = [];
  for (const row of rows) {
    try {
      const entity = deserializeExtractedPattern(row);
      registerExtractedPattern(entity);
      entities.push(entity);
    } catch (err) {
      console.warn(`Skipping corrupt extracted pattern ${row.pattern_id}:`, err.message);
    }
  }
  return entities;
}
