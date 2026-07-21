// modeMatch — resolve which starter MODE a motif's chain represents, for the
// Motif device's per-motif MODE selector (Variant D: 4 starter presets + Custom).
// Pure, deterministic, headless (no p5/DOM/React).
//
// `modeForMotif(binding, hostPatternType)` answers: "which STARTER_CHIP, built
// for THIS host, produces a chain structurally equal to the motif's chain?" —
// returning that chip's id, or 'custom' when none matches. The UI shows the mode
// so a designer knows whether they're on a preset or have diverged from one.
//
// ── NORMALIZATION IS THE CONTRACT (why this module is more than deep-equal) ───
// A chip's chain (starterChips.build) and a STORED motif chain describe the same
// design through DIFFERENT text, because:
//   • createMotifParams/normalizeBinding preserve `binding.chain` VERBATIM, so a
//     freshly chip-created motif is byte-equal — but once it round-trips through
//     the rack editor (chainEditor.js) or is re-serialized, volatile defaults can
//     appear that the chip omitted and the ENGINE treats as no-ops:
//       – `bypass:false` (engine: `if (block.bypass) skip` — false ⇔ absent);
//       – a `sequence` block's `mode:'cycle'` / `continuous:false` / `seed:1`
//         (sequencer.js defaults) the chip left implicit;
//       – a slot's `sizeScale:1` / `rotationOffset:0` / `weight:1` (defaults);
//       – key order (objects) and role order (engine reads roles as a Set).
//   • `pickedPaths` is only read when `pathScope==='picked'`; otherwise inert.
// So we canonicalize BOTH chains to a behavior-equivalent form — fill each
// block's engine defaults, drop inert/volatile keys, sort roles — then structural
// deep-equal (key-order-independent). A `bypass:true`, a changed `n`/`density`/
// role, or a swapped slot glyph are all REAL behavior ⇒ preserved ⇒ 'custom'.
//
// PLACEMENT IS IGNORED ENTIRELY: `binding.placement` (sizing/orientation/flip) is
// a placement tweak, not a mode — two motifs on the same mode may size
// differently. Only `binding.chain` participates.
//
// OVERRIDES: the fixed post-chain include/exclude step (ADR-0004) is NOT a chain
// block and does not participate in mode matching (a preset carries no overrides;
// adding them is a placement/selection tweak, not a different mode).
//
// LEGACY / NULL: a legacy selection-form binding (no `.chain`) is 'custom' — it
// predates modes; the UI offers to convert it. null/undefined/empty ⇒ 'custom'.

import { STARTER_CHIPS } from './starterChips.js';

/**
 * Which starter mode does this motif's chain represent on `hostPatternType`?
 * @param {{chain?: Array<object>}} binding  the motif's stored binding.
 * @param {string} hostPatternType  the host the motif adorns (chips are host-aware).
 * @returns {string} a STARTER_CHIP id, or 'custom'.
 */
export function modeForMotif(binding, hostPatternType) {
  const chain = binding && Array.isArray(binding.chain) ? binding.chain : null;
  if (!chain) return 'custom'; // legacy selection-form, empty, or null ⇒ custom.

  const target = normalizeChain(chain);
  for (const chip of STARTER_CHIPS) {
    const built = normalizeChain(chip.build(hostPatternType).binding.chain);
    if (deepEqual(target, built)) return chip.id;
  }
  return 'custom';
}

/**
 * The `{glyphRef, anchorMode, binding}` the UI writes when a preset is picked —
 * a thin wrapper over the chip's `build`, existing so the UI has ONE seam.
 * Returns null for 'custom' or an unknown id (the UI never writes a preset for
 * those). null-safe.
 * @param {string} chipId
 * @param {string} hostPatternType
 * @returns {{glyphRef:string, anchorMode:string, binding:object}|null}
 */
export function applyModeChain(chipId, hostPatternType) {
  const chip = STARTER_CHIPS.find((c) => c.id === chipId);
  return chip ? chip.build(hostPatternType) : null;
}

// ── Canonicalization ─────────────────────────────────────────────────────────

/** Canonicalize a whole chain: block order is preserved (reorder = new design). */
function normalizeChain(chain) {
  return chain.map(canonicalBlock);
}

/**
 * Canonicalize one block to a behavior-equivalent form: fill the engine's
 * defaults, drop inert/volatile keys, so two textually-different-but-behaviorally-
 * identical blocks compare equal. `bypass` is kept ONLY when truthy (a real skip).
 */
function canonicalBlock(block) {
  const b = block || {};
  const out = { type: b.type };
  if (b.bypass) out.bypass = true; // false/absent ⇒ omitted (engine treats alike)

  switch (b.type) {
    case 'route':
      out.roles = b.roles == null ? null : [...b.roles].sort();
      out.pathScope = b.pathScope != null ? b.pathScope : 'all';
      // pickedPaths is read ONLY under 'picked' scope; inert otherwise ⇒ omit.
      if (out.pathScope === 'picked') {
        out.pickedPaths = Array.isArray(b.pickedPaths) ? [...b.pickedPaths].sort() : [];
      }
      break;
    case 'everyN':
      out.n = clampN(b.n); // mirror engine: n<1 (or NaN) ⇒ 1 (keep-all)
      out.offset = b.offset != null ? b.offset : 0;
      out.continuous = !!b.continuous;
      break;
    case 'skip':
      out.mask = Array.isArray(b.mask) ? [...b.mask].map(Boolean) : [];
      out.continuous = !!b.continuous;
      break;
    case 'density':
      out.density = b.density != null ? b.density : 1;
      out.seed = b.seed != null ? b.seed : 1;
      out.rngMode = b.rngMode != null ? b.rngMode : 'sequential'; // engine default
      break;
    case 'field':
      out.threshold = b.threshold != null ? b.threshold : 0.5;
      out.invert = !!b.invert;
      // A field FUNCTION can't be structurally compared; mark presence so a
      // field-bearing block never accidentally equals a chip (chips carry none).
      out.hasField = !!b.field;
      break;
    case 'sequence':
      out.mode = b.mode != null ? b.mode : 'cycle';
      out.continuous = !!b.continuous;
      out.seed = b.seed != null ? b.seed : 1;
      out.slots = Array.isArray(b.slots) ? b.slots.map(canonicalSlot) : [];
      break;
    default:
      break; // unknown block type: type-only (lenient; matches nothing but itself)
  }
  return out;
}

/**
 * Canonicalize a Sequencer slot. `flip` is left AS-SPECIFIED (undefined ≠ false —
 * the engine's flipSpecified distinction), included only when present, so an
 * unspecified flip on both sides matches while specified-vs-unspecified differ.
 */
function canonicalSlot(slot) {
  const s = slot || {};
  const out = {
    rest: !!s.rest,
    glyphRef: s.glyphRef != null ? s.glyphRef : null,
    sizeScale: s.sizeScale != null ? s.sizeScale : 1,
    rotationOffset: s.rotationOffset != null ? s.rotationOffset : 0,
    weight: s.weight != null ? s.weight : 1,
    rotationRandom: canonicalRotationRandom(s.rotationRandom),
  };
  if (s.flip !== undefined) out.flip = !!s.flip;
  return out;
}

/** A rotationRandom with no positive range is a no-op ⇒ canonical null. */
function canonicalRotationRandom(rr) {
  if (!rr || !(rr.range > 0)) return null;
  return { range: rr.range, spread: rr.spread === 'bell' ? 'bell' : 'flat' };
}

/** Mirror the engine's every-N clamp: rawN>=1 ⇒ floor, else 1. */
function clampN(rawN) {
  const n = rawN != null ? rawN : 1;
  return n >= 1 ? Math.floor(n) : 1;
}

// ── Structural deep-equal (key-order-independent) ─────────────────────────────

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}
