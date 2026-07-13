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

// ── Sequencer slot ops (C3) ──────────────────────────────────────────────────
//
// The Sequencer card authors the terminal `sequence` block's `slots` array. These
// helpers mutate ONE sequence block (identified by `seqIndex`) immutably, honoring
// the SAME no-op / rejection contract as the block ops above: an out-of-range
// index, a non-sequence target, or a true no-op returns the INPUT ARRAY UNCHANGED
// (same reference), so the rack's edit wrapper skips onUpdateLayer (no phantom undo
// entry, no accidental legacy→chain migration). Every accepted edit produces a new
// sequence block object (siblings keep identity) via setBlock, so the render seam
// and one-undo path behave exactly as they do for selection-block edits.

// Resolve the sequence block at `seqIndex`, or null if it isn't a sequence.
function seqBlockAt(list, seqIndex) {
  const b = list[seqIndex];
  return b && b.type === 'sequence' ? b : null;
}

/** Append a slot to the sequence block at `seqIndex`. */
export function addSlot(chain, seqIndex, slot) {
  const list = chain || [];
  const seq = seqBlockAt(list, seqIndex);
  if (!seq) return list;
  const slots = Array.isArray(seq.slots) ? seq.slots : [];
  return setBlock(list, seqIndex, { slots: [...slots, slot] });
}

/** Remove the slot at `slotIndex`; out-of-range returns the same ref. */
export function removeSlot(chain, seqIndex, slotIndex) {
  const list = chain || [];
  const seq = seqBlockAt(list, seqIndex);
  if (!seq) return list;
  const slots = Array.isArray(seq.slots) ? seq.slots : [];
  if (slotIndex < 0 || slotIndex >= slots.length) return list;
  const next = slots.slice();
  next.splice(slotIndex, 1);
  return setBlock(list, seqIndex, { slots: next });
}

/** Move the slot at `from` to `to`; degenerate/out-of-range returns the same ref. */
export function reorderSlots(chain, seqIndex, from, to) {
  const list = chain || [];
  const seq = seqBlockAt(list, seqIndex);
  if (!seq) return list;
  const slots = Array.isArray(seq.slots) ? seq.slots : [];
  if (
    from < 0 ||
    from >= slots.length ||
    to < 0 ||
    to >= slots.length ||
    from === to
  ) {
    return list;
  }
  return setBlock(list, seqIndex, { slots: arrayMove(slots, from, to) });
}

/** Shallow-merge `patch` into the slot at `slotIndex`; other slots keep identity. */
export function setSlot(chain, seqIndex, slotIndex, patch) {
  const list = chain || [];
  const seq = seqBlockAt(list, seqIndex);
  if (!seq) return list;
  const slots = Array.isArray(seq.slots) ? seq.slots : [];
  if (slotIndex < 0 || slotIndex >= slots.length) return list;
  const next = slots.map((s, i) => (i === slotIndex ? { ...s, ...patch } : s));
  return setBlock(list, seqIndex, { slots: next });
}

/**
 * Point the slot at `slotIndex` at `glyphRef` (the commit-back rebind for a
 * forked built-in/unresolved slot glyph). Same contract as setSlot.
 */
export function setSlotGlyphRef(chain, seqIndex, slotIndex, glyphRef) {
  return setSlot(chain, seqIndex, slotIndex, { glyphRef });
}

// ── Route pickedPaths op (C4) ────────────────────────────────────────────────
//
// The Route card's `picked` path scope filters anchors by `meta.pathIndex`
// (engine chain.js applyRoute). A designer selects paths by CLICKING an
// edge-ghost dot on the canvas — each dot carries its path's `meta.pathIndex`,
// and a click TOGGLES that index in the route block's `pickedPaths` number[].
// This is the pure op behind that click (the canvas wiring composes it with
// ensureChainForm/deepMergeBinding in motifLayer.applyPickedPathToggle).
//
// tolerate-dangling (D5 / runbook): a pickedPaths index the host no longer has
// simply drops at render (engine filters `picked.has(pathIndex)`), so no cleanup
// is needed here — a positional pathIndex is NOT spatially rebindable, so we
// tolerate, never re-match.

/**
 * Toggle `pathIndex` in the `pickedPaths` array of the ROUTE block at
 * `routeIndex`. Adds it when absent, removes it when present. A non-route or
 * out-of-range target returns the INPUT ARRAY UNCHANGED (same ref) so the
 * one-undo edit wrapper skips a stale/misdirected write. A toggle is never a
 * no-op on a valid route (it always adds or removes), so an accepted toggle
 * always produces a new chain. `pickedPaths` stays a plain number[].
 * @param {Array<object>} chain
 * @param {number} routeIndex
 * @param {number} pathIndex
 * @returns {Array<object>}
 */
export function togglePickedPath(chain, routeIndex, pathIndex) {
  const list = chain || [];
  const block = list[routeIndex];
  if (!block || block.type !== 'route') return list;
  const current = Array.isArray(block.pickedPaths) ? block.pickedPaths : [];
  const next = current.includes(pathIndex)
    ? current.filter((p) => p !== pathIndex)
    : [...current, pathIndex];
  return setBlock(list, routeIndex, { pickedPaths: next });
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
