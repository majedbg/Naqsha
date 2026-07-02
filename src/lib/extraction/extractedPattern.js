// ExtractedPattern — domain entity + serializer for photo-extracted patterns
// (S0 spine, issue #49; PRD #48 "Domain / persistence").
//
// One entity backs BOTH library surfaces (locked decision 6): the Library
// entry persisted by LibraryRepository and the picker-registered runtime
// pattern rendered by ExtractedPatternGenerator.
//
// Entity shape:
//   {
//     patternId:  'extracted-…'   runtime registry id
//     title:      string
//     source:     'extracted'
//     visibility: 'private'       (sharing scaffold — locked decision, PRD §data safety)
//     tile:       { width, height, fills:[{d,role}], strokes:[{d,role}] }
//     lattice:    null | { t1:[x,y], t2:[x,y], cell:{width,height}, type,
//                          confidence }  (S5, issue #54; null = single-motif
//                          floor. Validated by lattice.validateLattice on
//                          BOTH construction and deserialize — stored rows
//                          are attacker-writable, and these numbers drive
//                          tiling loops and transform attributes.)
//     photoPath:  null | string   storage path of the original photo
//   }
//
// Serialization targets the unified user_patterns row (migration 009):
// `tile_svg` (canonical standalone SVG markup, the faithful tile) plus
// `fabrication_tags` carrying the engrave/cut/score role per path — the tags
// live structurally in jsonb, not only as data-role attributes, so fabrication
// mapping never depends on markup parsing (locked decision 9).

import { FABRICATION_ROLES } from './vectorizer';
import { validateLattice } from './lattice';
import {
  normalizeLocation,
  normalizeCaptureDate,
  normalizeExif,
} from './locationMeta';
import { normalizeProvenance } from './provenanceMeta';

const SVG_NS = 'http://www.w3.org/2000/svg';

function newPatternId() {
  return `extracted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** XML attribute escaping — shared with ExtractedPatternGenerator.toSVGGroup. */
export function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Stored-row validation (adversarial-review finding 1) ────────────────────
// user_patterns rows are attacker-writable in principle (any tool holding the
// user's JWT can insert arbitrary strings), so everything deserialized from a
// row is validated against a strict shape BEFORE it can reach markup surfaces
// (thumbnail dangerouslySetInnerHTML, exported SVG). Violations throw; the
// loader treats that as a corrupt row and skips it.

const PATTERN_ID_RE = /^[A-Za-z0-9_-]+$/;

// SVG path data only: command letters, numbers (incl. exponents), separators.
// Notably excludes `<`, `>`, `"`, `&` — nothing markup-active can pass.
const SAFE_PATH_D_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9\s.,+eE-]*$/;

function assertSafePathD(d) {
  if (!SAFE_PATH_D_RE.test(d)) {
    throw new Error('ExtractedPattern: rejected unsafe path data in stored row');
  }
}

function assertKnownRole(role) {
  if (!FABRICATION_ROLES.includes(role)) {
    throw new Error(`ExtractedPattern: rejected unknown fabrication role "${role}"`);
  }
}

/**
 * Build an ExtractedPattern entity. Throws when the tile carries no geometry —
 * the extraction flow guarantees a single-motif floor (locked decision 8), so
 * an empty tile is always a programming error, never a user dead end.
 */
export function makeExtractedPattern({
  patternId,
  title,
  tile,
  lattice = null,
  photoPath = null,
  visibility = 'private',
  // S8 (issue #57): optional capture metadata. All validate-and-null (never
  // throw) — location/date/camera are fully optional and must never block.
  location = null,
  captureDate = null,
  exif = null,
  // S9 (issue #58): organization + provenance metadata + palette facet. Same
  // validate-and-null discipline — none of it may block a save or destroy a
  // good entry (progressive disclosure; nothing but the title matters).
  note = null,
  favorite = false,
  tags = [],
  collectionId = null,
  sourceType = null,
  material = null,
  tradition = null,
  palette = [],
} = {}) {
  const fills = tile?.fills ?? [];
  const strokes = tile?.strokes ?? [];
  if (fills.length + strokes.length === 0) {
    throw new Error('ExtractedPattern requires tile geometry (guaranteed single-motif floor)');
  }
  return {
    patternId: patternId || newPatternId(),
    title: title || 'Extracted pattern',
    source: 'extracted',
    visibility,
    tile: {
      width: tile.width,
      height: tile.height,
      fills: fills.map(({ d, role }) => ({ d, role })),
      strokes: strokes.map(({ d, role }) => ({ d, role })),
    },
    // Throws on a malformed lattice (same corrupt-row discipline as the path
    // data below); null stays null — the single-motif floor.
    lattice: validateLattice(lattice),
    photoPath,
    // Optional metadata — normalized, never fatal (see locationMeta).
    location: normalizeLocation(location),
    captureDate: normalizeCaptureDate(captureDate),
    exif: normalizeExif(exif),
    // S9 metadata — one shared validation surface (see provenanceMeta).
    ...normalizeProvenance({
      note,
      favorite,
      tags,
      collectionId,
      sourceType,
      material,
      tradition,
      palette,
    }),
  };
}

/**
 * Canonical tile markup: a standalone <svg> whose only children are <path>
 * elements in emission order fills-then-strokes. deserializeExtractedPattern
 * parses exactly this shape; keep the two in lockstep.
 */
export function tileToSVG(tile) {
  const paths = [
    ...tile.fills.map(
      ({ d, role }) =>
        `  <path d="${escapeAttr(d)}" data-kind="fill" data-role="${escapeAttr(role)}" fill="#000" fill-rule="evenodd" stroke="none"/>`
    ),
    ...tile.strokes.map(
      ({ d, role }) =>
        `  <path d="${escapeAttr(d)}" data-kind="stroke" data-role="${escapeAttr(role)}" fill="none" stroke="#000" stroke-width="1"/>`
    ),
  ].join('\n');
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${tile.width} ${tile.height}" width="${tile.width}" height="${tile.height}" data-source="extracted">\n${paths}\n</svg>`;
}

/** Entity → unified user_patterns row payload. */
export function serializeExtractedPattern(entity) {
  return {
    pattern_id: entity.patternId,
    name: entity.title,
    source: 'extracted',
    visibility: entity.visibility,
    tile_svg: tileToSVG(entity.tile),
    fabrication_tags: {
      fills: entity.tile.fills.map((f) => f.role),
      strokes: entity.tile.strokes.map((s) => s.role),
    },
    lattice: entity.lattice,
    photo_path: entity.photoPath,
    // S8: capture metadata → columns added by migration 010 (soft jsonb/text).
    // 010 is human-gated and ships WITH 009 (apply 010 after/with 009). If a
    // deployment has 009 but not 010, this insert fails on the unknown columns
    // and saveExtractedPattern's best-effort path degrades to a session-only
    // save (persisted:false) — never a dead end, exactly like the unapplied-009
    // path in S0.
    location: entity.location,
    capture_date: entity.captureDate,
    exif: entity.exif,
    // S9: organization + provenance + palette → columns added by migration 011
    // (additive, human-gated, ships after 010). A deployment on 009/010 but not
    // 011 fails this insert on the unknown columns; saveExtractedPattern
    // degrades to a session-only save (persisted:false) — never a dead end,
    // exactly like S8's 009-only path. jsonb columns hold arrays directly.
    note: entity.note,
    favorite: entity.favorite,
    tags: entity.tags,
    collection_id: entity.collectionId,
    source_type: entity.sourceType,
    material: entity.material,
    tradition: entity.tradition,
    palette: entity.palette,
  };
}

const PATH_RE = /<path\s+d="([^"]*)"\s+data-kind="([^"]*)"\s+data-role="([^"]*)"/g;
const VIEWBOX_RE = /viewBox="0 0 ([\d.]+) ([\d.]+)"/;

function unescapeAttr(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Unified user_patterns row (or serialize output) → entity. Regex-parses the
 * canonical markup emitted by tileToSVG — no DOM needed, so this runs in
 * node, workers, and the browser identically. `fabrication_tags` is the
 * authoritative role source; data-role attributes are a fallback.
 */
export function deserializeExtractedPattern(record) {
  if (!PATTERN_ID_RE.test(String(record.pattern_id ?? ''))) {
    throw new Error('ExtractedPattern: rejected malformed pattern_id in stored row');
  }

  const svg = record.tile_svg || '';
  const vb = svg.match(VIEWBOX_RE);
  const width = vb ? parseFloat(vb[1]) : 0;
  const height = vb ? parseFloat(vb[2]) : 0;

  const fills = [];
  const strokes = [];
  let m;
  PATH_RE.lastIndex = 0;
  while ((m = PATH_RE.exec(svg)) !== null) {
    const [, dRaw, kind, roleAttr] = m;
    const d = unescapeAttr(dRaw);
    assertSafePathD(d);
    const list = kind === 'stroke' ? strokes : fills;
    list.push({ d, role: unescapeAttr(roleAttr) });
  }
  const tags = record.fabrication_tags;
  if (tags?.fills?.length === fills.length) {
    fills.forEach((f, i) => { f.role = tags.fills[i]; });
  }
  if (tags?.strokes?.length === strokes.length) {
    strokes.forEach((s, i) => { s.role = tags.strokes[i]; });
  }
  // Validate the FINAL role (fabrication_tags is the authoritative source and
  // is just as attacker-writable as the markup attributes).
  fills.forEach((f) => assertKnownRole(f.role));
  strokes.forEach((s) => assertKnownRole(s.role));

  return makeExtractedPattern({
    patternId: record.pattern_id,
    title: record.name,
    tile: { width, height, fills, strokes },
    lattice: record.lattice ?? null,
    photoPath: record.photo_path ?? null,
    visibility: record.visibility || 'private',
    // S8: metadata is validate-and-null inside makeExtractedPattern — a corrupt
    // location/date/camera on an attacker-writable row drops the bad piece, it
    // never throws, so a good pattern + photo are never lost to bad metadata.
    location: record.location ?? null,
    captureDate: record.capture_date ?? null,
    exif: record.exif ?? null,
    // S9: metadata is validate-and-null inside makeExtractedPattern — a corrupt
    // tag/material/palette on an attacker-writable row drops the bad piece, it
    // never throws, so a good pattern is never lost to bad metadata. Palette hex
    // is hard-validated before it can reach a chip's style attribute.
    note: record.note ?? null,
    favorite: record.favorite ?? false,
    tags: record.tags ?? [],
    collectionId: record.collection_id ?? null,
    sourceType: record.source_type ?? null,
    material: record.material ?? null,
    tradition: record.tradition ?? null,
    palette: record.palette ?? [],
  });
}
