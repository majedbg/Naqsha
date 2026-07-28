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
// role, an added/removed block, or a route change are all REAL structure ⇒
// preserved ⇒ 'custom'.
//
// ── MODE IDENTITY SPLITS BY PRESET KIND (ADR 0008) ───────────────────────────
// This module DELIBERATELY REVERSES its prior "a swapped slot glyph ⇒ custom"
// contract. A mode's identity now depends on whether its terminal `sequence` is
// flat or zoned:
//   • FLAT sequence (Alternate x‑o, Sparse scatter, Border march): identity is
//     the RHYTHM, glyph-agnostic. `canonicalSlot` OMITS `glyphRef` — swapping the
//     diamond for a dot KEEPS the mode. But the rhythm still counts: adding a
//     slot, deleting a rest, or a modifier change (size/rotation/weight/flip/
//     rotationRandom) is a new rhythm ⇒ 'custom'. Slots are never ignored
//     wholesale — x‑o's identity IS its two-step pattern.
//   • ZONED sequence (Vine): identity is the ZONE SKELETON — Route + block
//     structure + the sorted set of zone ids. Everything INSIDE a zone (glyphs,
//     slot counts, deal mode, ends, continuous, modifiers, rests) is the maker's
//     content and never flips the mode. A `zoned:true` marker on the canonical
//     block means a zoned sequence can NEVER equal a flat one, nor vice versa.
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
//
// ── IDENTITY IS THE **EFFECTIVE** CHAIN, NOT THE STORED ONE (2026-07-28) ──────
// (ADR 0008 amendment. Forced by #154 step 2 + the Grid axis toggle #166/#168.)
// The stored side is run through `coerceRoles` before it is canonicalized, so
// what is compared is the chain the CANVAS RENDERS, not the text on disk. The
// symptom that forced it: build an Alternate x‑o on a two-axis Grid (stores
// `roles:['crossing']`), then toggle the Grid to columns-only. The Grid becomes
// an EDGE host, `coerceRoles` narrows the stored `['crossing']` to `['edge']` at
// render — the glyphs do not vanish, they relocate from the crossings to along
// the lines — but the raw stored chain no longer equalled anything a chip builds
// HERE, so the mode column read **Custom** with no motif edit. The label was
// describing the document instead of the picture.
//
// The label was the visible half. The half that costs the maker work is
// `Inspector.applyMode`, which stashes the OUTGOING chain in `params.modeCache`
// under the mode it currently READS as: with the chain reading `custom`, a
// maker's customizations were filed under `cache.custom` instead of
// `cache['alternate-xo']`, so switching back to Alternate x‑o later returned the
// FACTORY build and their work was reachable only via the Custom chip. Matching
// the effective chain fixes that as a side effect, and that is the point.
//
// ONLY THE STORED SIDE IS COERCED. The rebuilt chip chain is already
// params-aware (`chip.build(type, params)`) and is by construction what the host
// can serve; coercing it too would be a no-op at best and could only mask a real
// disagreement.
//
// READ-ONLY, ALWAYS. `coerceRoles` clones and never mutates, this function
// returns a string, and NOTHING here writes the coerced value back — the
// document keeps the maker's stored intent, exactly as the render does.

import { STARTER_CHIPS } from './starterChips.js';
import { coerceRoles } from './edgeRoles.js';
import { isEdgeHost } from './hostKinds.js';

/**
 * Which starter mode does this motif's chain represent on `hostPatternType`?
 * @param {{chain?: Array<object>}} binding  the motif's stored binding.
 * @param {string} hostPatternType  the host the motif adorns (chips are host-aware).
 * @param {object} [hostParams]  the host's live params. PARAMS-AWARE BY NECESSITY
 *   (#154 step 2): create-time role defaults are params-aware, so a chip must be
 *   REBUILT under the same params it was built with or the two disagree about
 *   roles and every chip on a single-axis Grid reads as 'custom'. Omitting it
 *   keeps the by-type answer, matching the rest of the host seam — and the
 *   coercion below degrades with it, since a params-blind caller genuinely does
 *   not know which chain the canvas renders.
 * @returns {string} a STARTER_CHIP id, or 'custom'.
 */
export function modeForMotif(binding, hostPatternType, hostParams) {
  const chain = binding && Array.isArray(binding.chain) ? binding.chain : null;
  if (!chain) return 'custom'; // legacy selection-form, empty, or null ⇒ custom.

  const target = normalizeChain(effectiveChain(binding, hostPatternType, hostParams));
  for (const chip of STARTER_CHIPS) {
    const built = normalizeChain(chip.build(hostPatternType, hostParams).binding.chain);
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
 * @param {object} [hostParams]  see modeForMotif — must match what will re-derive it.
 * @returns {{glyphRef:string, anchorMode:string, binding:object}|null}
 */
export function applyModeChain(chipId, hostPatternType, hostParams) {
  const chip = STARTER_CHIPS.find((c) => c.id === chipId);
  return chip ? chip.build(hostPatternType, hostParams) : null;
}

// ── The effective chain ──────────────────────────────────────────────────────

/**
 * The chain the CANVAS RENDERS for this binding on this host — the stored chain
 * with its Route roles resolved against what the host actually emits, via the
 * one shared `coerceRoles` seam MotifPattern and AnchorGhostOverlay both use.
 * Clones (or returns the stored array untouched when nothing needed coercing);
 * never mutates, never writes.
 *
 * WHY `anchorMode` IS DERIVED HERE RATHER THAN READ OFF THE MOTIF. The motif
 * stores an `anchorMode`, and threading it in was the obvious plan — it is the
 * wrong one, for two independent reasons:
 *   • NEITHER RENDER PATH TRUSTS THE STORED FIELD. `AnchorGhostOverlay` DERIVES
 *     it (`isEdgeHost(host.patternType, host.params) ? 'edge' : 'semantic'`), and
 *     `MotifPattern` reads `p.anchorMode` only AFTER `resolveMotifHost` has
 *     already forced 'edge' for an edge host. Reading the stored value here would
 *     make mode-matching the one place that believes a field both render paths
 *     deliberately override — and would drag issue #174 (createMotifParams
 *     defaults to 'edge' on semantic hosts) into the mode column.
 *   • IT BUYS NOTHING FOR THE MOTIVATING CASE. On a columns-only Grid
 *     `isEdgeHost('grid', params)` is already true, so `coerceRoles`' edge branch
 *     fires whatever the stored anchorMode says.
 * So it is derived from the two arguments this function already has, EXACTLY as
 * the overlay derives it. One fact, one derivation, three surfaces.
 *
 * WHAT THE DERIVED VALUE ACTUALLY GUARDS, precisely: `coerceRoles` reads a
 * MISSING anchorMode as 'edge' (MotifPattern's default), and its first branch is
 * `(anchorMode ?? 'edge') === 'edge' || isEdgeHost(type, params)` — so passing
 * 'edge', or passing nothing, would rewrite EVERY semantic host's Route to
 * `['edge']` and read Custom on a Voronoi or a Recursive that never changed.
 * Passing anything else falls through to the intersection. Because that branch
 * re-asks `isEdgeHost` itself, the derivation is today observationally identical
 * to a hardcoded 'semantic'; it is written as the derivation anyway so it mirrors
 * the overlay and does not silently depend on that second disjunct surviving a
 * future edit of `coerceRoles`.
 *
 * THE BRANCH-3 FALLBACK, decided rather than inherited. When a stored role
 * survives no intersection, `coerceRoles` falls back to `defaultRolesForHost` —
 * which is params-BLIND, so in principle identity could be decided by a role
 * neither side can serve. It is safe here, and the reasoning is the same as the
 * whole change: the RENDER runs that identical fallback, so the mode named is
 * still the chain the canvas drew. (Concretely: a Voronoi Route storing `['tip']`
 * — a role Voronoi does not emit, #154 — renders on `['crossing']`, i.e. exactly
 * the anchors an Alternate x‑o draws, and the mode column now says so instead of
 * showing Custom over a picture indistinguishable from the preset.) The fallback
 * is also never itself unserveable: the only params-narrowing SEMANTIC host is
 * `grid`, and a single-axis Grid is diverted by branch 1 long before the fallback
 * is reachable. modeMatch.test.js asserts that as a standing invariant over
 * SEMANTIC_MOTIF_HOSTS, so a future host cannot break it quietly.
 *
 * @param {object} binding  the motif's stored binding (chain-form)
 * @param {string} type     the host's registry id
 * @param {object} [params] the host's live params
 * @returns {Array<object>} the chain to canonicalize
 */
function effectiveChain(binding, type, params) {
  const anchorMode = isEdgeHost(type, params) ? 'edge' : 'semantic';
  return coerceRoles(binding, { type, params, anchorMode }).chain;
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
      if (Array.isArray(b.zones)) {
        // ZONED (ADR 0008): identity is the Zone SKELETON only — the presence and
        // set of zones. Glyphs, slot counts, deal mode, ends, continuous,
        // modifiers and rests INSIDE a zone are the maker's content and never
        // affect the mode. `zoned:true` is a marker so a zoned sequence can never
        // structurally equal a flat one (different key set). Zone ids are sorted:
        // authoring order is not identity. Worked example — the Vine canonicalizes
        // to { type:'sequence', zoned:true, zones:['apex','stem'] }.
        out.zoned = true;
        out.zones = b.zones.map((z) => (z && z.zone != null ? z.zone : null)).sort();
      } else {
        // FLAT: identity is the rhythm (see canonicalSlot — glyph-agnostic).
        out.mode = b.mode != null ? b.mode : 'cycle';
        out.continuous = !!b.continuous;
        out.seed = b.seed != null ? b.seed : 1;
        out.slots = Array.isArray(b.slots) ? b.slots.map(canonicalSlot) : [];
      }
      break;
    default:
      break; // unknown block type: type-only (lenient; matches nothing but itself)
  }
  return out;
}

/**
 * Canonicalize a FLAT Sequencer slot. `glyphRef` is DELIBERATELY OMITTED (ADR
 * 0008): a flat mode's identity is its rhythm, glyph-agnostic — swapping the
 * diamond for a dot keeps "Alternate x‑o". What still counts is the rhythm and
 * modifiers: `rest` (a rest vs a glyph is a different step; removing/adding a
 * slot is a count change), sizeScale/rotationOffset/weight/rotationRandom/flip.
 * `flip` is left AS-SPECIFIED (undefined ≠ false — the engine's flipSpecified
 * distinction), included only when present, so an unspecified flip on both sides
 * matches while specified-vs-unspecified differ.
 */
function canonicalSlot(slot) {
  const s = slot || {};
  const out = {
    rest: !!s.rest,
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
