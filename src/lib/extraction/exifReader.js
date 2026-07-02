// ExifReader (S8, issue #57): parse capture date + GPS + camera from the
// uploaded photo, CLIENT-SIDE, so "optional" location/date fields fill
// themselves (PRD design principle: auto-capture beats manual entry).
//
// Dependency choice: `exifr` (pinned 7.1.3) — a small, well-maintained,
// browser+node EXIF reader that tree-shakes and lands in the LAZY extraction
// chunk (imported only through ExtractStepper). A hand-rolled JPEG/TIFF parser
// for just these fields is possible, but EXIF's IFD/rational/endianness edge
// cases (and HEIC's ISO-BMFF boxes for iPhone photos) are exactly the kind of
// fiddly binary work a focused, tested dep does better. Reading only — nothing
// here writes or strips EXIF.
//
// PRIVACY: this module is PURE (no network). Reverse geocoding lives in
// geocode.js and fires only on explicit user action (issue #57 locked rule:
// GPS never leaves the device without a visible request).
//
// WHAT SURVIVES IN STORAGE: the app uploads the ORIGINAL file as-is
// (LibraryRepository), so the stored photo keeps its embedded EXIF — including
// GPS — even if the user clears the auto-filled location proposal. Clearing the
// editable field affects the saved metadata row, NOT the photo blob. The bucket
// is private + per-user RLS (owner-only read), which is the mitigation; EXIF
// stripping (a client-side re-encode) is deliberately out of S8 scope.

import * as exifr from 'exifr';

// Parse only the fields we use — keeps exifr's work (and any surface for
// throwing on exotic tags) minimal.
const PARSE_OPTIONS = {
  tiff: true,
  exif: true,
  gps: true,
  // Skip thumbnails / interoperability / maker-notes: irrelevant + heavier.
  ifd1: false,
  interop: false,
  makerNote: false,
  userComment: false,
  // Return raw values we normalize ourselves; dates come back as Date objects.
  reviveValues: true,
};

function toIsoOrNull(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? d.toISOString() : null;
}

function validGps(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null; // null-island — almost always absent GPS
  return { lat, lng };
}

function cameraLabel(make, model) {
  const mk = typeof make === 'string' ? make.trim() : '';
  const md = typeof model === 'string' ? model.trim() : '';
  if (!mk && !md) return null;
  // Avoid "Apple Apple ..." when the model already begins with the make.
  if (mk && md.toLowerCase().startsWith(mk.toLowerCase())) return md;
  return [mk, md].filter(Boolean).join(' ') || null;
}

/**
 * Read capture metadata from a File/Blob/ArrayBuffer/Uint8Array.
 * @returns {Promise<{ date: string|null, gps: {lat,lng}|null, camera: string|null }>}
 * Corrupt or absent EXIF resolves to all-nulls — NEVER throws outward (issue
 * #57: missing metadata is zero-friction, never a blocker).
 */
export async function readExif(input) {
  if (!input) return { date: null, gps: null, camera: null };
  let tags;
  try {
    // Normalize Blob/File → ArrayBuffer ourselves rather than lean on exifr's
    // environment-specific Blob handling (its browser build reads Blobs via
    // paths jsdom/tests don't provide). exifr parses an ArrayBuffer/typed
    // array identically everywhere.
    const buf =
      typeof input.arrayBuffer === 'function' && !(input instanceof ArrayBuffer)
        ? await input.arrayBuffer()
        : input;
    tags = await exifr.parse(buf, PARSE_OPTIONS);
  } catch {
    // Truncated/garbage payloads: fail soft.
    return { date: null, gps: null, camera: null };
  }
  // exifr returns undefined for no-EXIF, or an object carrying `errors` for a
  // partially-unreadable segment — both flow through the optional chaining
  // below to nulls.
  const date =
    toIsoOrNull(tags?.DateTimeOriginal) ??
    toIsoOrNull(tags?.CreateDate) ??
    toIsoOrNull(tags?.DateTime) ??
    toIsoOrNull(tags?.ModifyDate);
  const gps = validGps(tags?.latitude, tags?.longitude);
  const camera = cameraLabel(tags?.Make, tags?.Model);
  return { date, gps, camera };
}
