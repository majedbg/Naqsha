// materialEvaluationService.js — material-evaluation slice 1
//
// An EVALUATION SUBMISSION (docs/material-evaluation-VISION.md): the maker's
// photo of their physical Sheet next to a screenshot of the 3D preview
// rendering the same Material Archetype, stored as ONE row + two objects in a
// PRIVATE storage bucket. The pairing is the atomic unit of evidence — the
// photo and the render are never stored apart.
//
// Mirrors userMotifService's shape: pure mappers up top, offline-graceful CRUD
// below (every fn guards `!supabase`, scopes by `user_id`, throws on a real
// error). Storage objects live under `<user_id>/<evaluation_id>/…` — the
// owner-uid-first path is what the bucket RLS keys on (migration 014).
//
// The render screenshot arrives as the data URL <SnapshotCapture> already
// produces for the "Save image" button (ADR 0003 preview snapshot — NEVER part
// of the fabrication path); here it is uploaded instead of downloaded.

import { supabase } from './supabase';

// Bucket + limits — the same values migration 014 encodes server-side; kept
// here so the client can reject early with a friendly message instead of a
// storage error.
export const EVALUATION_BUCKET = 'material-evaluations';
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const SIGNED_URL_TTL_S = 60 * 60; // 1 hour — review-session length, not a share link.

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** File extension for an allowed image mime; jpg as the phone-photo default. */
export function extensionForMime(mime) {
  return MIME_EXT[mime] || 'jpg';
}

/**
 * Storage object paths for one evaluation. Owner uid FIRST — the bucket RLS
 * policy keys on the first path segment (migration 014).
 * @returns {{ photoPath: string, renderPath: string }}
 */
export function buildEvaluationPaths({ userId, evaluationId, photoMime }) {
  const base = `${userId}/${evaluationId}`;
  return {
    photoPath: `${base}/photo.${extensionForMime(photoMime)}`,
    renderPath: `${base}/render.png`,
  };
}

/**
 * Decode a `data:<mime>;base64,…` URL (the shape SnapshotCapture emits) into a
 * Blob for upload. Returns null for anything that isn't a base64 data URL.
 */
export function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  const [, mime, b64] = match;
  const bytes = atob(b64);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

/**
 * Client-side pre-flight for a submission — mirrors the bucket's server-side
 * limits so failures are friendly and early.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateSubmission({ material, photoFile, renderDataUrl } = {}) {
  if (!material?.id) return { ok: false, reason: 'Pick a preview material first.' };
  if (!renderDataUrl) return { ok: false, reason: 'No render screenshot was captured.' };
  if (!photoFile) return { ok: false, reason: 'Add a photo of your sheet.' };
  if (!ALLOWED_PHOTO_TYPES.includes(photoFile.type)) {
    return { ok: false, reason: 'Photo must be a PNG, JPEG, or WebP image.' };
  }
  if (photoFile.size > MAX_PHOTO_BYTES) {
    return { ok: false, reason: 'Photo is too large (max 10 MB).' };
  }
  return { ok: true };
}

/**
 * Insert payload for one evaluation row (snake_case; user_id/id added by the
 * caller). `kind` defaults to material-vs-render; the executed-piece evolution
 * lands as a new kind value (vision doc), not a new shape.
 */
export function evaluationToRow({ material, archetype, photoPath, renderPath, note, kind }) {
  return {
    material_id: material.id,
    material_name: material.name,
    archetype,
    kind: kind || 'material-vs-render',
    photo_path: photoPath,
    render_path: renderPath,
    note: note ?? null,
  };
}

/** DB row → in-app camelCase evaluation. */
export function rowToEvaluation(row) {
  return {
    id: row.id,
    materialId: row.material_id,
    materialName: row.material_name,
    archetype: row.archetype,
    kind: row.kind,
    photoPath: row.photo_path,
    renderPath: row.render_path,
    note: row.note ?? null,
    createdAt: row.created_at,
  };
}

// ── Service (offline-graceful) ───────────────────────────────────────────────

/**
 * Submit one evaluation: upload photo + render to the private bucket, then
 * insert the row that pairs them. The evaluation id is generated client-side
 * so the object paths and the row agree before anything is written.
 *
 * @returns {Promise<object|null>} the stored evaluation, or null offline.
 * @throws on validation failure, upload error, or insert error.
 */
export async function submitEvaluation({
  userId,
  material,
  archetype,
  photoFile,
  renderDataUrl,
  note,
  kind,
}) {
  if (!supabase) return null;

  const valid = validateSubmission({ material, photoFile, renderDataUrl });
  if (!valid.ok) throw new Error(valid.reason);
  const renderBlob = dataUrlToBlob(renderDataUrl);
  if (!renderBlob) throw new Error('Render screenshot is not a valid image.');

  const evaluationId = crypto.randomUUID();
  const { photoPath, renderPath } = buildEvaluationPaths({
    userId,
    evaluationId,
    photoMime: photoFile.type,
  });

  const bucket = supabase.storage.from(EVALUATION_BUCKET);
  const uploads = [
    [photoPath, photoFile, photoFile.type],
    [renderPath, renderBlob, 'image/png'],
  ];
  for (const [path, body, contentType] of uploads) {
    const { error } = await bucket.upload(path, body, { contentType, upsert: false });
    if (error) throw error;
  }

  const { data, error } = await supabase
    .from('material_evaluations')
    .insert({
      id: evaluationId,
      user_id: userId,
      ...evaluationToRow({ material, archetype, photoPath, renderPath, note, kind }),
    })
    .select()
    .single();
  if (error) throw error;
  return rowToEvaluation(data);
}

/**
 * Load the user's evaluations (newest first) with short-lived signed URLs for
 * both sides of each pairing (the bucket is private). A row whose signing
 * fails stays listed with null URLs — its metadata is still reviewable.
 * @returns {Promise<Array<object>>} empty when offline or no user.
 */
export async function loadEvaluations(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase
    .from('material_evaluations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const bucket = supabase.storage.from(EVALUATION_BUCKET);
  const sign = async (path) => {
    const { data: signed, error: signErr } = await bucket.createSignedUrl(path, SIGNED_URL_TTL_S);
    return signErr ? null : signed?.signedUrl ?? null;
  };
  return Promise.all(
    (data || []).map(async (row) => ({
      ...rowToEvaluation(row),
      photoUrl: await sign(row.photo_path),
      renderUrl: await sign(row.render_path),
    })),
  );
}
