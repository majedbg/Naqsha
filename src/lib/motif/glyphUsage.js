// glyphUsage — count how many places in the document reference a glyph id
// (motif-shell, D). Pure, no React.
//
// A glyph is referenced from TWO places: a motif layer's base
// `params.glyphRef`, and any Sequencer slot's `glyphRef` inside the layer's
// chain (`params.binding.chain[i].slots[n].glyphRef`, or the zoned
// `…chain[i].zones[z].slots[n].glyphRef`). The old
// `usedByCount` in useMotifEditor counted only the base ref, so an in-place
// Save claimed isolation while silently restamping sequencer slots (audit
// 2026-07 bug 3) — every "is this glyph in use?" question must go through
// here instead.
//
// A ZONED sequence Block (ADR 0008) keeps its slots under `zones[].slots` with
// no flat block-level `slots`, so every read here goes through `sequenceSlots`
// — reading `block.slots` directly undercounted a Vine's zone glyphs to ZERO,
// the same class of lie as bug 3 (the library panel would offer a glyph the
// Vine is actively stamping as safe to delete).
import { isMotifLayer } from './motifLayer';
import { sequenceSlots } from './sequencer.js';

/**
 * Visit every glyph-reference OCCURRENCE in the document — a motif layer's base
 * `params.glyphRef` plus every Sequencer-slot `glyphRef` — once. `visit` is
 * called with each truthy ref (rest/empty slots and missing base refs are
 * skipped, so no falsy id ever reaches the callback). Shared by glyphUseCount
 * and glyphUsageMap so the two can never drift on WHAT counts as a reference.
 * @param {Array} layers the document's layers
 * @param {(glyphId: string) => void} visit
 */
function eachGlyphRef(layers, visit) {
  for (const l of layers || []) {
    if (!isMotifLayer(l)) continue;
    if (l.params?.glyphRef) visit(l.params.glyphRef);
    const chain = l.params?.binding?.chain;
    if (!Array.isArray(chain)) continue;
    for (const block of chain) {
      for (const slot of sequenceSlots(block)) {
        if (slot?.glyphRef) visit(slot.glyphRef);
      }
    }
  }
}

/**
 * @param {Array} layers   the document's layers
 * @param {string} glyphId the glyph id to count references to
 * @returns {number} total reference count (base refs + sequencer-slot refs)
 */
export function glyphUseCount(layers, glyphId) {
  if (!glyphId) return 0;
  let n = 0;
  eachGlyphRef(layers, (id) => {
    if (id === glyphId) n += 1;
  });
  return n;
}

/**
 * Reference count for EVERY glyph in ONE pass — the map form of glyphUseCount,
 * so a render can count all glyphs without an O(glyphs × layers × blocks ×
 * slots) nested scan (one glyphUseCount call per entry). Contract: the returned
 * Map holds ONLY referenced ids — an unused glyph is ABSENT (callers read
 * `map.get(id) ?? 0`), never keyed to 0 — and each value equals the glyph's
 * glyphUseCount. No falsy id is ever a key.
 * @param {Array} layers the document's layers
 * @returns {Map<string, number>} glyphId → reference count
 */
export function glyphUsageMap(layers) {
  const counts = new Map();
  eachGlyphRef(layers, (id) => {
    counts.set(id, (counts.get(id) || 0) + 1);
  });
  return counts;
}

/**
 * Distinct LAYERS referencing a glyph (base ref or any slot ref) — the number
 * a "Used by N layers" badge should show.
 */
export function glyphUsedByLayerCount(layers, glyphId) {
  if (!glyphId) return 0;
  let n = 0;
  for (const l of layers || []) {
    if (!isMotifLayer(l)) continue;
    if (l.params?.glyphRef === glyphId) {
      n += 1;
      continue;
    }
    const chain = l.params?.binding?.chain;
    if (
      Array.isArray(chain) &&
      chain.some((block) => sequenceSlots(block).some((slot) => slot?.glyphRef === glyphId))
    ) {
      n += 1;
    }
  }
  return n;
}
