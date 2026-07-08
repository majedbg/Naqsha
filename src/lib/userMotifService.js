// userMotifService.js — P4-2 (svg-motif-editor DECISIONS D1)
//
// The GLOBAL, per-user motif library. A custom motif lives in a document's
// `customGlyphs` store; the user may PROMOTE it here ("Save to my library") to
// reuse across documents. Leans on the existing Supabase cloud persistence and
// mirrors designService's shape: every fn guards `!supabase` (offline / no
// backend → graceful no-op), scopes by `user_id`, and throws on a real error.
//
// COPY-on-use (not reference): on PLACE the client copies the returned glyph
// into the document's customGlyphs keyed by the row uuid, so documents stay
// self-contained and share links carry the motif (never resolved at render).
// See docs/svg-motif-editor-P4-ORCHESTRATOR.md.

import { supabase } from './supabase';

// ── Pure mappers (glyph ⇄ row) ──────────────────────────────────────────────

/**
 * Map an in-app glyph to the insertable row payload (user_id is added by the
 * caller). The library row's display name is derived from the glyph.
 * @param {object} glyph
 * @returns {{ name: string, glyph: object }}
 */
export function glyphToRow(glyph) {
  return {
    name: glyph?.name || 'Untitled motif',
    glyph,
  };
}

/**
 * Map a DB row to a "library motif" for the picker. The inner glyph.id is
 * RE-KEYED to the row uuid so (a) getGlyph never shadows it with a built-in
 * (uuids can't equal leaf/dot/diamond/rosette) and (b) copy-on-use is
 * idempotent — placing the same library motif twice merges on the same key.
 * @param {{ id: string, name: string, glyph: object }} row
 * @returns {{ id: string, name: string, glyph: object }}
 */
export function rowToLibraryMotif(row) {
  return {
    id: row.id,
    name: row.name,
    glyph: { ...row.glyph, id: row.id },
  };
}

// ── Service CRUD (offline-graceful) ─────────────────────────────────────────

/**
 * Promote a glyph to the signed-in user's global library.
 * @returns {Promise<{id,name,glyph}|null>} the stored library motif, or null offline.
 */
export async function saveUserMotif(userId, glyph) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_motifs')
    .insert({ user_id: userId, ...glyphToRow(glyph) })
    .select()
    .single();
  if (error) throw error;
  return rowToLibraryMotif(data);
}

/**
 * Load the user's global motif library (newest first).
 * @returns {Promise<Array<{id,name,glyph}>>} empty when offline or no user.
 */
export async function loadUserMotifs(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('user_motifs')
    .select('id, name, glyph, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToLibraryMotif);
}

/** Remove a library motif (owner-scoped). No-op offline. */
export async function deleteUserMotif(id, userId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_motifs')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}
