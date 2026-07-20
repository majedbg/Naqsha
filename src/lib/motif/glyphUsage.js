// glyphUsage — count how many places in the document reference a glyph id
// (motif-shell, D). Pure, no React.
//
// A glyph is referenced from TWO places: a motif layer's base
// `params.glyphRef`, and any Sequencer slot's `glyphRef` inside the layer's
// chain (`params.binding.chain[i].slots[n].glyphRef`). The old
// `usedByCount` in useMotifEditor counted only the base ref, so an in-place
// Save claimed isolation while silently restamping sequencer slots (audit
// 2026-07 bug 3) — every "is this glyph in use?" question must go through
// here instead.
import { isMotifLayer } from './motifLayer';

/**
 * @param {Array} layers   the document's layers
 * @param {string} glyphId the glyph id to count references to
 * @returns {number} total reference count (base refs + sequencer-slot refs)
 */
export function glyphUseCount(layers, glyphId) {
  if (!glyphId) return 0;
  let n = 0;
  for (const l of layers || []) {
    if (!isMotifLayer(l)) continue;
    if (l.params?.glyphRef === glyphId) n += 1;
    const chain = l.params?.binding?.chain;
    if (!Array.isArray(chain)) continue;
    for (const block of chain) {
      const slots = Array.isArray(block?.slots) ? block.slots : [];
      for (const slot of slots) {
        if (slot?.glyphRef === glyphId) n += 1;
      }
    }
  }
  return n;
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
      chain.some(
        (block) =>
          Array.isArray(block?.slots) &&
          block.slots.some((slot) => slot?.glyphRef === glyphId)
      )
    ) {
      n += 1;
    }
  }
  return n;
}
