// locationMeta (S8, issue #57): normalization + validation for the optional
// capture metadata that rides an ExtractedPattern — location, capture date,
// and camera EXIF.
//
// Discipline (locked): location is FULLY OPTIONAL and must NEVER block. So —
// unlike tile path-data and lattice, which THROW on a malformed stored row so
// the whole entry is skipped — a bad location field is VALIDATED-AND-NULLED,
// never fatal. A corrupt placeName or an out-of-range latitude drops the bad
// piece (or the whole location) while the pattern + photo survive.
//
// These strings render only through React text nodes (auto-escaped), so the
// injection surface is low; we still bound length and strip control characters
// so an attacker-writable jsonb row can't smuggle absurd payloads or terminal
// escapes into the Library UI.

// Source vocabulary: WRITE the S8 contract values ('exif' | 'manual' |
// 'geocoded'); READ tolerantly — the PRD/#57 also speak of 'pin' | 'address',
// and a future reconciliation (or S9 facet work) may write those. Accepting
// the union on read means such rows are kept, not destroyed as "corrupt". The
// value stays soft jsonb with NO database CHECK, so reconciling later is a
// value change, not a migration.
export const LOCATION_SOURCES = ['exif', 'manual', 'geocoded'];
const ACCEPTED_SOURCES = new Set([...LOCATION_SOURCES, 'pin', 'address']);

const MAX_PLACE = 200;
const MAX_ADDRESS = 500;
const MAX_CAMERA = 200;

// Control characters (C0 + DEL) — stripped so a stored jsonb string can't carry
// terminal escapes or NULs into the Library UI.
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/** Coerce to a trimmed, control-char-stripped, length-capped string or null. */
export function sanitizeText(value, maxLen) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(CONTROL_CHARS, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

function coord(value, lo, hi) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < lo || value > hi) return null;
  return value;
}

/**
 * Normalize a location proposal/row into { lat, lng, placeName, address,
 * source } or null. Never throws. Returns null when nothing meaningful
 * survives (no valid coord AND no place text) — an "empty" location is simply
 * absent.
 */
export function normalizeLocation(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = coord(loc.lat, -90, 90);
  const lng = coord(loc.lng, -180, 180);
  // A lone coordinate axis is meaningless — require the pair or drop both.
  const hasCoords = lat !== null && lng !== null;
  const placeName = sanitizeText(loc.placeName, MAX_PLACE);
  const address = sanitizeText(loc.address, MAX_ADDRESS);
  if (!hasCoords && !placeName && !address) return null;
  const source = ACCEPTED_SOURCES.has(loc.source) ? loc.source : 'manual';
  return {
    lat: hasCoords ? lat : null,
    lng: hasCoords ? lng : null,
    placeName,
    address,
    source,
  };
}

/** Capture date → canonical ISO string, or null. Never throws. */
export function normalizeCaptureDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? d.toISOString() : null;
}

/** Camera EXIF → { camera } (sanitized) or null. Never throws. */
export function normalizeExif(exif) {
  if (!exif || typeof exif !== 'object') return null;
  const camera = sanitizeText(exif.camera, MAX_CAMERA);
  if (!camera) return null;
  return { camera };
}
