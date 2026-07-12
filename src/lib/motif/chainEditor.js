// Pure Block-chain edit operations for the Motif rack UI (C2). Split out of the
// React component so the LOAD-BEARING rack invariant is unit-testable without a
// DOM or a real pointer drag:
//
//   THE SEQUENCER IS TERMINAL, AT-MOST-ONE, AND LAST.
//   (docs/motif-chain-ORCHESTRATOR.md — "The Sequencer's place in the pipeline")
//
// The `sequence` block is opaque/terminal (runSelectionChain partitions it out
// and A4 runs it in the placement stage). Selection blocks are repeatable, but a
// sequence must never be duplicated and must remain the final element — otherwise
// "repeatable blocks" produces an incoherent design (a filter after the terminal
// deal). Every op below enforces that; the UI mirrors it by hiding the illegal
// add-menu option and rejecting the illegal drop.
//
// NO-OP / REJECTION CONTRACT: an op that rejects or changes nothing returns its
// INPUT ARRAY UNCHANGED (same reference). The rack's edit wrapper skips
// onUpdateLayer when the returned chain === the input chain, so a rejected drag /
// forbidden add does NOT rewrite a legacy binding to chain-form or burn a phantom
// undo entry with zero visual change.

// A block is a sequence block by TYPE alone — an authoring sequence with empty
// slots still counts for ordering/menu purposes (isSequenceBlock in sequencer.js
// additionally requires non-empty slots, which is the RENDER gate, not this one).
export function isSequenceType(block) {
  return !!block && block.type === 'sequence';
}

export function hasSequence(chain) {
  return (chain || []).some(isSequenceType);
}

/** Index of the (at-most-one) sequence block, or -1. */
export function sequenceIndex(chain) {
  return (chain || []).findIndex(isSequenceType);
}

// Default factories for the add-block menu. Selection blocks default to a value
// that DOES something when added (so the add is visibly meaningful); new density
// defaults to hash RNG per ADR-0005 (only COMPILED legacy density is sequential).
// `route` roles default to null (all-pass) — the card's role checkboxes narrow it;
// path scope stays 'all' until C4 wires the picker. `sequence` is a minimal shell
// (empty slots) — C3 builds the slot strip.
export function makeBlock(type) {
  switch (type) {
    case 'route':
      return { type: 'route', roles: null, pathScope: 'all' };
    case 'everyN':
      return { type: 'everyN', n: 2, offset: 0, continuous: false };
    case 'skip':
      return { type: 'skip', mask: [false, true], continuous: false };
    case 'density':
      return { type: 'density', density: 0.5, seed: 1, rngMode: 'hash' };
    case 'field':
      return { type: 'field', threshold: 0.5, invert: false };
    case 'sequence':
      return { type: 'sequence', mode: 'cycle', slots: [] };
    default:
      return { type };
  }
}

/**
 * May a block of `type` be added to `chain`? Only the sequence is constrained
 * (at-most-one); selection blocks are always addable (repeatable).
 */
export function canAddBlock(chain, type) {
  if (type === 'sequence') return !hasSequence(chain);
  return true;
}

/**
 * Add a block, honoring the terminal-sequence invariant:
 *   • a sequence appends to the very end (and is REJECTED if one already exists —
 *     returns the same ref);
 *   • a selection block appends to the end, or is inserted BEFORE an existing
 *     sequence (never after it).
 */
export function addBlock(chain, block) {
  const list = chain || [];
  if (isSequenceType(block)) {
    if (hasSequence(list)) return list; // reject a second sequence (same ref)
    return [...list, block]; // terminal
  }
  const si = sequenceIndex(list);
  if (si === -1) return [...list, block];
  const next = list.slice();
  next.splice(si, 0, block); // insert before the sequence
  return next;
}

/** Remove the block at `index`; out-of-range returns the same ref. */
export function removeBlock(chain, index) {
  const list = chain || [];
  if (index < 0 || index >= list.length) return list;
  const next = list.slice();
  next.splice(index, 1);
  return next;
}

/** Shallow-merge `patch` into the block at `index`; siblings keep identity. */
export function setBlock(chain, index, patch) {
  const list = chain || [];
  if (index < 0 || index >= list.length) return list;
  return list.map((b, i) => (i === index ? { ...b, ...patch } : b));
}

/** Flip `bypass` on the block at `index`. */
export function toggleBypass(chain, index) {
  const list = chain || [];
  if (index < 0 || index >= list.length) return list;
  return list.map((b, i) => (i === index ? { ...b, bypass: !b.bypass } : b));
}

// Pure array move (inlined so this module has no dnd-kit dependency — the same
// splice @dnd-kit/sortable's arrayMove does).
function arrayMove(list, from, to) {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Reorder the block at `from` to `to`, REJECTING any move that would violate the
 * terminal-sequence invariant (a selection block ending up below the sequence,
 * or the sequence no longer last). A rejected / degenerate move returns the SAME
 * input ref so the caller can skip the write.
 */
export function reorderChain(chain, from, to) {
  const list = chain || [];
  if (
    from < 0 ||
    from >= list.length ||
    to < 0 ||
    to >= list.length ||
    from === to
  ) {
    return list;
  }
  const next = arrayMove(list, from, to);
  const si = sequenceIndex(next);
  // Invariant: if a sequence exists it must remain the final element.
  if (si !== -1 && si !== next.length - 1) return list; // reject
  return next;
}
