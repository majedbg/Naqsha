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
import { removeLibraryEntry, updateLibraryEntry } from './libraryStore';
import {
  normalizeNote,
  normalizeFavorite,
  normalizeTags,
  normalizeCollectionId,
  normalizeSlug,
  normalizeTradition,
} from './extraction/provenanceMeta';
import { sanitizeText } from './extraction/locationMeta';

export const PHOTO_BUCKET = 'pattern-photos';
const TABLE = 'user_patterns';

async function authedUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

// Photo extensions we accept for the bucket object key. Anything else — user
// filenames are arbitrary strings — falls back to 'jpg' (review finding 4).
const PHOTO_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic']);

function sanitizePhotoExt(ext) {
  const e = String(ext || '').toLowerCase();
  return PHOTO_EXTS.has(e) ? e : 'jpg';
}

/**
 * Persist an ExtractedPattern: insert the serialized row FIRST, then upload
 * the original photo into `<uid>/<patternId>.<ext>` of the private bucket and
 * back-fill the row's photo_path (both photo steps best-effort). Insert-first
 * means a failed insert can never orphan a storage object (review finding 4).
 * Returns { entity, persisted, reason? } — `entity` carries the final
 * photoPath actually recorded in the row.
 */
export async function saveExtractedPattern(entity, { photoBlob, photoExt = 'png' } = {}) {
  if (!supabase) return { entity, persisted: false, reason: 'no-supabase' };

  const user = await authedUser();
  if (!user) return { entity, persisted: false, reason: 'guest' };

  let saved = { ...entity, photoPath: entity.photoPath ?? null };

  const { error } = await supabase
    .from(TABLE)
    .insert({ ...serializeExtractedPattern(saved), user_id: user.id });
  if (error) {
    return { entity: saved, persisted: false, reason: `save failed: ${error.message}` };
  }

  if (photoBlob) {
    const path = `${user.id}/${entity.patternId}.${sanitizePhotoExt(photoExt)}`;
    const { error: upErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, photoBlob, { contentType: photoBlob.type, upsert: false });
    if (upErr) {
      console.warn('Pattern photo upload failed (pattern still saved):', upErr.message);
    } else {
      const { error: updErr } = await supabase
        .from(TABLE)
        .update({ photo_path: path })
        .eq('pattern_id', entity.patternId)
        .eq('user_id', user.id);
      if (updErr) {
        // Row says null, so the entity says null — the object is reachable by
        // its deterministic `<uid>/<patternId>.<ext>` key if ever needed.
        console.warn('Pattern photo_path back-fill failed (pattern still saved):', updErr.message);
      } else {
        saved = { ...saved, photoPath: path };
      }
    }
  }

  return { entity: saved, persisted: true };
}

// Editable-later fields (S9, issue #58): each maps a normalized entity field to
// its user_patterns column. Palette + tile are NOT here — palette is auto-
// derived (never user-edited), geometry is fixed. `title` normalizes to a
// trimmed non-empty string (empty edits are ignored, not blanked).
const META_FIELDS = {
  title: { column: 'name', normalize: (v) => sanitizeText(v, 200) },
  note: { column: 'note', normalize: normalizeNote },
  favorite: { column: 'favorite', normalize: normalizeFavorite },
  tags: { column: 'tags', normalize: normalizeTags },
  collectionId: { column: 'collection_id', normalize: normalizeCollectionId },
  sourceType: { column: 'source_type', normalize: normalizeSlug },
  material: { column: 'material', normalize: normalizeSlug },
  tradition: { column: 'tradition', normalize: normalizeTradition },
};

/**
 * Edit metadata on an existing entry (S9 editable-later). Updates the in-memory
 * store ALWAYS (so guest / session-only entries edit immediately) and, when
 * signed in, best-effort persists the change — a guest / missing supabase /
 * missing-column / RLS denial degrades to a session-only edit, never a dead
 * end. Only keys present in `patch` (and in META_FIELDS) are touched; each is
 * normalized (validate-and-null) before it reaches the store or the row.
 * @returns {Promise<{ entity, persisted, reason? }>}
 */
export async function updateExtractedPatternMeta(patternId, patch = {}) {
  const entityPatch = {};
  const rowPatch = {};
  for (const [key, val] of Object.entries(patch)) {
    const field = META_FIELDS[key];
    if (!field) continue;
    const normalized = field.normalize(val);
    // A blank title edit (normalize→null) is ignored so a name is never wiped.
    if (key === 'title' && normalized == null) continue;
    entityPatch[key === 'title' ? 'title' : key] = normalized;
    rowPatch[field.column] = normalized;
  }

  // Store first — the edit is visible this session regardless of persistence.
  updateLibraryEntry(patternId, entityPatch);

  if (!supabase) return { entity: entityPatch, persisted: false, reason: 'no-supabase' };
  const user = await authedUser();
  if (!user) return { entity: entityPatch, persisted: false, reason: 'guest' };
  if (Object.keys(rowPatch).length === 0) return { entity: entityPatch, persisted: true };

  const { error } = await supabase
    .from(TABLE)
    .update(rowPatch)
    .eq('pattern_id', patternId)
    .eq('user_id', user.id);
  if (error) {
    return { entity: entityPatch, persisted: false, reason: `save failed: ${error.message}` };
  }
  return { entity: entityPatch, persisted: true };
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

/** Delete one extracted pattern row and drop it from BOTH runtime surfaces
 *  (picker registry + library store — one entity, two surfaces). */
export async function deleteExtractedPattern(patternId) {
  if (supabase) {
    const { error } = await supabase.from(TABLE).delete().eq('pattern_id', patternId);
    if (error) console.warn('Failed to delete extracted pattern:', error.message);
  }
  unregisterPattern(patternId);
  removeLibraryEntry(patternId);
}

/**
 * Resolve a short-lived signed URL for a private library photo. Best-effort:
 * guests / missing supabase / missing object all resolve to null — the Library
 * view falls back to the tile preview, never a dead end.
 */
export async function getPhotoURL(photoPath, ttlSeconds = 3600) {
  if (!supabase || !photoPath) return null;
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photoPath, ttlSeconds);
  if (error) {
    console.warn('Failed to sign library photo URL:', error.message);
    return null;
  }
  return data?.signedUrl ?? null;
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
      // created_at threads into the library store so the Library view keeps
      // its newest-first order across reloads.
      registerExtractedPattern(entity, { createdAt: row.created_at ?? null });
      entities.push(entity);
    } catch (err) {
      console.warn(`Skipping corrupt extracted pattern ${row.pattern_id}:`, err.message);
    }
  }
  return entities;
}
