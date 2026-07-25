// etchSourceStorage — signed-in source storage for an Etch (Raster Etch S7, #86).
//
// The SIGNED-IN half of the hybrid source persistence (grilled decision 7): a
// guest/offline Etch keeps its capped (≤~1024px) source data-URI ON the layer
// (S1, UNCHANGED). A signed-in Etch uploads its FULL-resolution source photo to a
// PRIVATE Supabase storage bucket and the layer stores a `sourcePath` instead —
// so the saved design stays small and the full-res source survives the
// localStorage quota that capped guest sources hit (NEEDS-HUMAN S1 note).
//
// Mirrors materialEvaluationService: a bucket constant, owner-uid-FIRST object
// paths (the bucket RLS keys on the leading uid — migration 015), a size/mime
// preflight, and graceful offline behaviour (every fn guards `!supabase`). On
// load the source is DOWNLOADED, not served via a signed URL: the bytes go
// through a data-URL into the SAME resolveEtchBitmap pipeline, keeping the
// resample canvas same-origin (a cross-origin signed URL would taint the
// getImageData readback). Downloads are memoized by `sourcePath` because
// useCanvas re-resolves on every Stage/Hold/resize edit.
//
// `sourcePath` is a plain layer param that rides inside the design's `config`
// jsonb (designs.config = { layers, … }); there is NO new table or column — the
// migration provisions only the bucket + its owner-only object RLS.

import { supabase } from '../supabase';

// Bucket + limits — the same values migration 015 encodes server-side; kept here
// so the client can reject early with a friendly message instead of a storage
// error. Mirrors the material-evaluation bucket's conservative defaults.
export const ETCH_SOURCE_BUCKET = 'etch-sources';
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_SOURCE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** File extension for an allowed image mime; jpg as the phone-photo default. */
export function extensionForMime(mime) {
  return MIME_EXT[mime] || 'jpg';
}

/**
 * Storage object path for one Etch source. Owner uid FIRST — the bucket RLS
 * policy keys on the first path segment (migration 015), the standard Supabase
 * per-user-folder pattern.
 * @returns {string} `<userId>/<sourceId>/source.<ext>`
 */
export function buildEtchSourcePath({ userId, sourceId, mime }) {
  return `${userId}/${sourceId}/source.${extensionForMime(mime)}`;
}

/**
 * Client-side preflight for a source upload — mirrors the bucket's server-side
 * limits so failures are friendly and early.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateSource(file) {
  if (!file) return { ok: false, reason: 'No source image.' };
  if (!ALLOWED_SOURCE_TYPES.includes(file.type)) {
    return { ok: false, reason: 'Source must be a PNG, JPEG, or WebP image.' };
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return { ok: false, reason: 'Source image is too large (max 10 MB).' };
  }
  return { ok: true };
}

// ── Upload (import time) ─────────────────────────────────────────────────────

/**
 * Upload a full-resolution source photo to the private bucket. The source id is
 * generated client-side so the object path is known before the write.
 * @returns {Promise<{ sourcePath: string }|null>} null when offline / no user.
 * @throws on validation failure or upload error (the caller falls back).
 */
export async function uploadEtchSource({ userId, file } = {}) {
  if (!supabase || !userId) return null;

  const valid = validateSource(file);
  if (!valid.ok) throw new Error(valid.reason);

  const sourceId = crypto.randomUUID();
  const sourcePath = buildEtchSourcePath({ userId, sourceId, mime: file.type });

  const { error } = await supabase.storage
    .from(ETCH_SOURCE_BUCKET)
    .upload(sourcePath, file, { contentType: file.type, upsert: false });
  if (error) throw error;

  return { sourcePath };
}

/**
 * Decide the persisted source params for a NEW Etch, at import time. A SIGNED-IN
 * user uploads the full-res `file` to the bucket → `{ sourcePath, sourceWidth,
 * sourceHeight }` (full-res dims, NO inline base64). A GUEST/offline user — OR
 * any upload failure — gets the S1 capped data-URI fallback `{ source,
 * sourceWidth, sourceHeight }` (capped dims): the maker's work is NEVER lost.
 * `upload` is injectable for tests.
 *
 * @param {object}  args
 * @param {string=} args.userId               signed-in user id (falsy → guest)
 * @param {Blob=}   args.file                  the original full-res source file
 * @param {{source:string,width:number,height:number}} args.capped  S1 fallback
 * @param {{width:number,height:number}=}      args.full            full-res dims
 * @param {Function=} args.upload              injectable uploader (tests)
 * @returns {Promise<object>} the params to hand `addEtchLayer`.
 */
export async function persistEtchSource({ userId, file, capped, full, upload = uploadEtchSource } = {}) {
  const fallback = {
    source: capped?.source ?? null,
    sourceWidth: capped?.width ?? 0,
    sourceHeight: capped?.height ?? 0,
  };
  if (!supabase || !userId || !file) return fallback;
  try {
    const res = await upload({ userId, file });
    if (res?.sourcePath) {
      return {
        sourcePath: res.sourcePath,
        sourceWidth: full?.width ?? fallback.sourceWidth,
        sourceHeight: full?.height ?? fallback.sourceHeight,
      };
    }
  } catch {
    // Upload failed (network / quota / RLS): fall back to the local data-URI so
    // the maker never loses their imported source. Non-fatal by design.
  }
  return fallback;
}

// ── Load ─────────────────────────────────────────────────────────────────────

// sourcePath → Promise<dataUrl|null>. useCanvas re-resolves an Etch on every
// signature change (each Stage / Hold / resize edit); without this the full blob
// would re-download per edit. Successful downloads stay cached; failures evict
// so a later resolve retries.
const _downloadCache = new Map();

// Blob → `data:<mime>;base64,…`. Uses arrayBuffer + btoa (not FileReader) so it
// runs identically in the browser AND under node/vitest — keeping the module
// node-testable like the rest of the Etch code.
async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const mime = blob.type || 'application/octet-stream';
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * Download a bucket-backed source into a data-URL. DOWNLOAD (not a signed URL)
 * on purpose: the resample step reads the canvas back with getImageData, and a
 * cross-origin signed URL would taint it (SecurityError / blank). Downloading
 * through the owner's ambient session keeps the bytes same-origin. Memoized by
 * `sourcePath`. Returns null offline / on error.
 * @param {string} sourcePath
 * @returns {Promise<string|null>}
 */
export async function fetchEtchSourceDataUrl(sourcePath) {
  if (!supabase || !sourcePath) return null;
  if (_downloadCache.has(sourcePath)) return _downloadCache.get(sourcePath);

  const p = (async () => {
    const { data, error } = await supabase.storage.from(ETCH_SOURCE_BUCKET).download(sourcePath);
    if (error || !data) {
      _downloadCache.delete(sourcePath); // evict → a later resolve retries
      return null;
    }
    try {
      return await blobToDataUrl(data);
    } catch {
      _downloadCache.delete(sourcePath);
      return null;
    }
  })();
  _downloadCache.set(sourcePath, p);
  return p;
}

/** Clear the download memo — for tests and (future) cache invalidation. */
export function _clearEtchSourceCache() {
  _downloadCache.clear();
}

/**
 * The loadable source URL for an Etch layer — the SINGLE seam both paths feed
 * into resolveEtchBitmap. A guest layer's inline `source` data-URI is returned
 * as-is (no bucket call); a signed-in layer's `sourcePath` is downloaded from the
 * bucket. `fetchSource` is injectable (default: the bucket download) so the
 * branch is node-testable.
 * @param {object} layer
 * @param {(sourcePath:string)=>Promise<string|null>} [fetchSource]
 * @returns {Promise<string|null>}
 */
export async function resolveEtchSourceUrl(layer, fetchSource = fetchEtchSourceDataUrl) {
  const { source, sourcePath } = layer?.params || {};
  if (source) return source;
  if (sourcePath) return fetchSource(sourcePath);
  return null;
}
