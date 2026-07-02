// provenanceMeta (S9, issue #58): normalization + validation for the
// organization + provenance metadata that rides an ExtractedPattern — user
// meta (note, favorite, tags, collection), provenance (source_type, material,
// tradition), and the auto-derived palette facet.
//
// Discipline (locked, inherited from S8 locationMeta): every field here is
// OPTIONAL and must NEVER block a save or destroy an otherwise-good entry. So,
// unlike tile path-data and lattice (which THROW on a malformed stored row so
// the whole entry is skipped), bad metadata is VALIDATED-AND-NULLED — the bad
// piece drops, the pattern + photo survive.
//
// user_patterns rows are attacker-writable in principle (any tool holding the
// user's JWT). These values render through React text nodes (auto-escaped) and,
// for the palette, as chip background colors — so on top of length/control-char
// bounding we hard-validate hex against a strict pattern before it can reach a
// style attribute (invariant: palette chips must not interpolate unvalidated
// strings into style/DOM).

import { sanitizeText } from './locationMeta';

// ── Vocabularies (PRD canonical values; UI offers these) ────────────────────
// STORED values are the canonical slugs; the UI maps them to display labels
// ("in_person" → "In person"). Kept as soft text with NO database CHECK and a
// TOLERANT read (see normalizeSlug) so reconciling the vocabulary later is a
// value change, not a migration — exactly like locationMeta's source field.
export const SOURCE_TYPES = ['in_person', 'book', 'screenshot', 'url'];
export const MATERIALS = ['stone', 'glass', 'wood', 'textile', 'ceramic', 'metal', 'other'];

const MAX_NOTE = 2000;
const MAX_TAG = 40;
const MAX_TAGS = 30;
const MAX_TRADITION = 100;
const MAX_PALETTE = 12;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_RE = /^#[0-9a-f]{6}$/i;
// A facet slug: short, lowercased, no markup-active chars. Tolerant read —
// accepts any well-formed slug, not only today's enum members, so a future
// vocabulary value written to the row is kept rather than destroyed.
const SLUG_RE = /^[a-z0-9_-]{1,40}$/;

/** Enum-ish slug → itself (lowercased) or null. Never throws. */
export function normalizeSlug(value) {
  const s = sanitizeText(value, MAX_TAG);
  if (!s) return null;
  const lower = s.toLowerCase();
  return SLUG_RE.test(lower) ? lower : null;
}

/** Free-form tradition/style label → sanitized string or null. */
export function normalizeTradition(value) {
  return sanitizeText(value, MAX_TRADITION);
}

/** Free-form note → sanitized string or null. */
export function normalizeNote(value) {
  return sanitizeText(value, MAX_NOTE);
}

/** Boolean coercion — only literal true survives; anything else is false. */
export function normalizeFavorite(value) {
  return value === true;
}

/**
 * Tags → a de-duplicated array of sanitized short strings (case-insensitive
 * dedupe, original casing kept). Non-array or empty → []. Never throws.
 */
export function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const t = sanitizeText(raw, MAX_TAG);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Collection reference → uuid string or null. Never throws. */
export function normalizeCollectionId(value) {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

/**
 * Palette → array of { hex:'#rrggbb', coverage:0..1 }, dropping any malformed
 * swatch (bad hex, non-finite coverage) and capping the count. Non-array → [].
 * Never throws. Hard hex validation here is the gate before a stored value can
 * reach a chip's style attribute.
 */
export function normalizePalette(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const sw of value) {
    if (!sw || typeof sw !== 'object') continue;
    const hex = typeof sw.hex === 'string' && HEX_RE.test(sw.hex) ? sw.hex.toLowerCase() : null;
    if (!hex) continue;
    let coverage = typeof sw.coverage === 'number' && Number.isFinite(sw.coverage) ? sw.coverage : 0;
    if (coverage < 0) coverage = 0;
    if (coverage > 1) coverage = 1;
    out.push({ hex, coverage });
    if (out.length >= MAX_PALETTE) break;
  }
  return out;
}

/**
 * Normalize the whole provenance/organization bundle in one shot. Returns a
 * flat object of already-validated fields (all nullable / empty-array). Used by
 * makeExtractedPattern so every construction + deserialize path shares one
 * validation surface.
 */
export function normalizeProvenance({
  note = null,
  favorite = false,
  tags = [],
  collectionId = null,
  sourceType = null,
  material = null,
  tradition = null,
  palette = [],
} = {}) {
  return {
    note: normalizeNote(note),
    favorite: normalizeFavorite(favorite),
    tags: normalizeTags(tags),
    collectionId: normalizeCollectionId(collectionId),
    sourceType: normalizeSlug(sourceType),
    material: normalizeSlug(material),
    tradition: normalizeTradition(tradition),
    palette: normalizePalette(palette),
  };
}
