// Pure Block-chain edit operations (C2) — the rack's reorder/add/remove/bypass
// logic, split out of the React component so the LOAD-BEARING invariant (the
// Sequencer is terminal, at-most-one, and last) is unit-pinned without a DOM /
// real pointer drag (jsdom can't drive dnd-kit).

import { describe, it, expect } from 'vitest';
import {
  isSequenceType,
  hasSequence,
  sequenceIndex,
  makeBlock,
  canAddBlock,
  addBlock,
  removeBlock,
  setBlock,
  toggleBypass,
  reorderChain,
  addSlot,
  duplicateSlot,
  duplicateZoneSlot,
  removeSlot,
  reorderSlots,
  setSlot,
  setSlotGlyphRef,
  togglePickedPath,
  setZoneSlot,
  setZoneSlotGlyphRef,
  addZoneSlot,
  removeZoneSlot,
  reorderZoneSlots,
  setZoneMode,
  setZoneEnds,
} from './chainEditor.js';

const route = () => ({ type: 'route', roles: null, pathScope: 'all' });
const everyN = () => ({ type: 'everyN', n: 2, offset: 0, continuous: false });
const density = () => ({ type: 'density', density: 0.5, seed: 1, rngMode: 'hash' });
const sequence = () => ({ type: 'sequence', mode: 'cycle', slots: [] });

describe('chainEditor — predicates', () => {
  it('isSequenceType keys off type only (empty-slots authoring sequence counts)', () => {
    expect(isSequenceType({ type: 'sequence', slots: [] })).toBe(true);
    expect(isSequenceType({ type: 'everyN' })).toBe(false);
    expect(isSequenceType(null)).toBe(false);
  });

  it('hasSequence / sequenceIndex locate the terminal block', () => {
    expect(hasSequence([route(), everyN()])).toBe(false);
    expect(hasSequence([route(), sequence()])).toBe(true);
    expect(sequenceIndex([route(), everyN(), sequence()])).toBe(2);
    expect(sequenceIndex([route(), everyN()])).toBe(-1);
  });
});

describe('chainEditor — makeBlock defaults', () => {
  it('makes each block type with sensible defaults; new density is hash (ADR-0005)', () => {
    expect(makeBlock('route')).toMatchObject({ type: 'route', pathScope: 'all' });
    expect(makeBlock('everyN')).toMatchObject({ type: 'everyN', continuous: false });
    expect(makeBlock('skip').type).toBe('skip');
    expect(makeBlock('density')).toMatchObject({ type: 'density', rngMode: 'hash' });
    expect(makeBlock('field')).toMatchObject({ type: 'field', invert: false });
    expect(makeBlock('sequence')).toMatchObject({ type: 'sequence', slots: [] });
  });
});

describe('chainEditor — canAddBlock (sequence is at-most-one)', () => {
  it('forbids a SECOND sequence; selection blocks stay repeatable', () => {
    const withSeq = [route(), sequence()];
    expect(canAddBlock(withSeq, 'sequence')).toBe(false);
    expect(canAddBlock(withSeq, 'everyN')).toBe(true);
    expect(canAddBlock([route()], 'sequence')).toBe(true);
    // repeatable: adding a second everyN is allowed
    expect(canAddBlock([route(), everyN()], 'everyN')).toBe(true);
  });
});

describe('chainEditor — addBlock (sequence terminal + last)', () => {
  it('appends a selection block to the end when there is no sequence', () => {
    const out = addBlock([route()], everyN());
    expect(out.map((b) => b.type)).toEqual(['route', 'everyN']);
  });

  it('inserts a selection block BEFORE an existing sequence (never after)', () => {
    const out = addBlock([route(), sequence()], everyN());
    expect(out.map((b) => b.type)).toEqual(['route', 'everyN', 'sequence']);
  });

  it('appends a sequence block to the very end', () => {
    const out = addBlock([route(), everyN()], sequence());
    expect(out.map((b) => b.type)).toEqual(['route', 'everyN', 'sequence']);
  });

  it('REJECTS a second sequence, returning the SAME array ref (no churn)', () => {
    const input = [route(), sequence()];
    const out = addBlock(input, sequence());
    expect(out).toBe(input); // same ref → editChain skips onUpdateLayer
  });
});

describe('chainEditor — reorderChain (invariant: sequence stays last)', () => {
  it('reorders two selection blocks', () => {
    const out = reorderChain([route(), everyN(), density()], 0, 2);
    expect(out.map((b) => b.type)).toEqual(['everyN', 'density', 'route']);
  });

  it('REJECTS moving a selection block BELOW the sequence (same ref)', () => {
    const input = [route(), everyN(), sequence()];
    // try to move 'route' (0) past the sequence (to index 2)
    const out = reorderChain(input, 0, 2);
    expect(out).toBe(input);
  });

  it('REJECTS moving the sequence OFF the end (same ref)', () => {
    const input = [route(), everyN(), sequence()];
    // try to move the sequence (2) up to index 0
    const out = reorderChain(input, 2, 0);
    expect(out).toBe(input);
  });

  it('allows reordering selection blocks ABOVE a sequence', () => {
    const out = reorderChain([route(), everyN(), sequence()], 0, 1);
    expect(out.map((b) => b.type)).toEqual(['everyN', 'route', 'sequence']);
  });

  it('is a no-op (same ref) for from===to / out-of-range', () => {
    const input = [route(), everyN()];
    expect(reorderChain(input, 1, 1)).toBe(input);
    expect(reorderChain(input, 0, 9)).toBe(input);
    expect(reorderChain(input, -1, 0)).toBe(input);
  });
});

describe('chainEditor — removeBlock / setBlock / toggleBypass', () => {
  it('removes a block by index', () => {
    const out = removeBlock([route(), everyN(), density()], 1);
    expect(out.map((b) => b.type)).toEqual(['route', 'density']);
  });

  it('removeBlock out-of-range returns the same ref (no churn)', () => {
    const input = [route()];
    expect(removeBlock(input, 5)).toBe(input);
  });

  it('setBlock patches one block, leaving siblings untouched', () => {
    const input = [route(), everyN()];
    const out = setBlock(input, 1, { n: 5 });
    expect(out[1]).toMatchObject({ type: 'everyN', n: 5 });
    expect(out[0]).toBe(input[0]); // sibling identity preserved
  });

  it('toggleBypass flips block.bypass', () => {
    const out1 = toggleBypass([route(), everyN()], 1);
    expect(out1[1].bypass).toBe(true);
    const out2 = toggleBypass(out1, 1);
    expect(out2[1].bypass).toBe(false);
  });
});

// ── C3: Sequencer slot ops ─────────────────────────────────────────────────
describe('chainEditor — slot ops (C3)', () => {
  const glyphSlot = (ref) => ({ glyphRef: ref });
  const restSlot = () => ({ rest: true });
  // A chain whose terminal sequence sits at index 1 with two slots.
  const withSeq = (slots) => [route(), { type: 'sequence', mode: 'cycle', slots }];

  it('addSlot appends to the sequence block; siblings + other blocks keep identity', () => {
    const input = withSeq([glyphSlot('flower')]);
    const out = addSlot(input, 1, restSlot());
    expect(out[1].slots).toEqual([{ glyphRef: 'flower' }, { rest: true }]);
    expect(out[0]).toBe(input[0]); // route block identity preserved
    expect(out).not.toBe(input);
  });

  it('addSlot on a non-sequence index returns the same ref (no churn)', () => {
    const input = withSeq([glyphSlot('flower')]);
    expect(addSlot(input, 0, restSlot())).toBe(input); // index 0 is route
    expect(addSlot(input, 9, restSlot())).toBe(input); // out of range
  });

  it('removeSlot drops the slot at index; out-of-range returns the same ref', () => {
    const input = withSeq([glyphSlot('a'), glyphSlot('b'), glyphSlot('c')]);
    const out = removeSlot(input, 1, 1);
    expect(out[1].slots).toEqual([{ glyphRef: 'a' }, { glyphRef: 'c' }]);
    expect(removeSlot(input, 1, 9)).toBe(input);
    expect(removeSlot(input, 1, -1)).toBe(input);
  });

  // Duplicate inserts AFTER the source, not at the end: the slot card's "…"
  // menu duplicates a slot you have just tuned, and a rhythm is built by
  // repeating a beat WHERE IT SITS. Appending would be a different gesture.
  it('duplicateSlot inserts a copy directly after the source', () => {
    const input = withSeq([glyphSlot('a'), glyphSlot('b'), glyphSlot('c')]);
    const out = duplicateSlot(input, 1, 1);
    expect(out[1].slots.map((s) => s.glyphRef)).toEqual(['a', 'b', 'b', 'c']);
  });

  it('duplicateSlot copies every tuned field', () => {
    const tuned = {
      glyphRef: 'a',
      sizeScale: 1.4,
      rotationOffset: 180,
      flip: false,
      weight: 2,
      rotationRandom: { range: 30, spread: 'bell' },
    };
    const out = duplicateSlot(withSeq([tuned]), 1, 0);
    expect(out[1].slots[1]).toEqual(tuned);
  });

  // The copy is a fresh object: patching the duplicate must never reach back
  // into the original, and `rotationRandom` is the nested case that a plain
  // spread would still share.
  it('duplicateSlot shares no object identity with its source', () => {
    const input = withSeq([{ glyphRef: 'a', rotationRandom: { range: 30, spread: 'flat' } }]);
    const out = duplicateSlot(input, 1, 0);
    expect(out[1].slots[1]).not.toBe(out[1].slots[0]);
    expect(out[1].slots[1].rotationRandom).not.toBe(out[1].slots[0].rotationRandom);
  });

  it('duplicateSlot on a non-sequence / out-of-range index returns the same ref', () => {
    const input = withSeq([glyphSlot('a')]);
    expect(duplicateSlot(input, 0, 0)).toBe(input); // index 0 is route
    expect(duplicateSlot(input, 1, 9)).toBe(input);
    expect(duplicateSlot(input, 1, -1)).toBe(input);
  });

  it('reorderSlots moves a slot; degenerate/out-of-range returns the same ref', () => {
    const input = withSeq([glyphSlot('a'), glyphSlot('b'), glyphSlot('c')]);
    const out = reorderSlots(input, 1, 0, 2);
    expect(out[1].slots.map((s) => s.glyphRef)).toEqual(['b', 'c', 'a']);
    expect(reorderSlots(input, 1, 1, 1)).toBe(input); // from === to
    expect(reorderSlots(input, 1, 0, 9)).toBe(input); // out of range
  });

  it('setSlot shallow-merges a patch into one slot; other slots keep identity', () => {
    const input = withSeq([glyphSlot('a'), glyphSlot('b')]);
    const out = setSlot(input, 1, 0, { weight: 3 });
    expect(out[1].slots[0]).toEqual({ glyphRef: 'a', weight: 3 });
    expect(out[1].slots[1]).toBe(input[1].slots[1]); // sibling slot identity
  });

  it('setSlot can add and remove rotationRandom (progressive disclosure round-trip)', () => {
    const input = withSeq([glyphSlot('a')]);
    const on = setSlot(input, 1, 0, { rotationRandom: { range: 30, spread: 'flat' } });
    expect(on[1].slots[0].rotationRandom).toEqual({ range: 30, spread: 'flat' });
    const off = setSlot(on, 1, 0, { rotationRandom: undefined });
    expect('rotationRandom' in off[1].slots[0]).toBe(true);
    expect(off[1].slots[0].rotationRandom).toBeUndefined();
  });

  it('setSlot out-of-range / non-sequence returns the same ref', () => {
    const input = withSeq([glyphSlot('a')]);
    expect(setSlot(input, 1, 9, { weight: 2 })).toBe(input);
    expect(setSlot(input, 0, 0, { weight: 2 })).toBe(input); // route, not sequence
  });

  it('setSlotGlyphRef rebinds one slot glyphRef (the fork commit-back rebind)', () => {
    const input = withSeq([glyphSlot('leaf'), restSlot()]);
    const out = setSlotGlyphRef(input, 1, 0, 'custom-uuid-1');
    expect(out[1].slots[0].glyphRef).toBe('custom-uuid-1');
    expect(out[1].slots[1]).toEqual({ rest: true }); // rest untouched
    expect(out[0]).toBe(input[0]); // route identity preserved
  });
});

// ── togglePickedPath (C4) ─────────────────────────────────────────────────────
describe('togglePickedPath', () => {
  it('adds a pathIndex to an absent/empty pickedPaths', () => {
    const chain = [{ type: 'route', roles: null, pathScope: 'picked' }];
    const out = togglePickedPath(chain, 0, 3);
    expect(out).not.toBe(chain);
    expect(out[0].pickedPaths).toEqual([3]);
    // pathScope untouched — togglePickedPath only edits pickedPaths.
    expect(out[0].pathScope).toBe('picked');
  });

  it('round-trips: adding then removing the same index clears it', () => {
    const chain = [{ type: 'route', pathScope: 'picked', pickedPaths: [1] }];
    const added = togglePickedPath(chain, 0, 4);
    expect(added[0].pickedPaths).toEqual([1, 4]);
    const removed = togglePickedPath(added, 0, 4);
    expect(removed[0].pickedPaths).toEqual([1]);
  });

  it('a valid toggle always returns a NEW chain (never a no-op on a route)', () => {
    const chain = [{ type: 'route', pathScope: 'picked', pickedPaths: [2] }];
    expect(togglePickedPath(chain, 0, 2)).not.toBe(chain); // remove
    expect(togglePickedPath(chain, 0, 9)).not.toBe(chain); // add
  });

  it('a NON-route target returns the same ref (no accidental write)', () => {
    const chain = [{ type: 'everyN', n: 2 }, { type: 'route', pathScope: 'picked' }];
    expect(togglePickedPath(chain, 0, 1)).toBe(chain); // index 0 is everyN
  });

  it('an out-of-range index returns the same ref', () => {
    const chain = [{ type: 'route', pathScope: 'picked' }];
    expect(togglePickedPath(chain, 5, 1)).toBe(chain);
    expect(togglePickedPath(chain, -1, 1)).toBe(chain);
  });

  it('siblings keep identity across a toggle', () => {
    const chain = [
      { type: 'everyN', n: 2 },
      { type: 'route', pathScope: 'picked', pickedPaths: [] },
    ];
    const out = togglePickedPath(chain, 1, 0);
    expect(out[0]).toBe(chain[0]); // everyN untouched
    expect(out[1].pickedPaths).toEqual([0]);
  });
});

// ── Zoned Sequencer slot/mode ops (ADR-0008) ─────────────────────────────────
// The terminal `sequence` gains an optional `zones` array (presence = zoned;
// flat `slots`/`mode`/`continuous` absent when zoned). Each Zone is addressed by
// its `zone` field (Apex/Stem), NOT by array position — order in the array is not
// part of the address. These ops mirror the flat slot ops' no-op/same-ref
// discipline: invalid seqIndex / non-sequence / flat (un-zoned) sequence / unknown
// zoneId / out-of-range slotIndex ⇒ the INPUT ARRAY UNCHANGED (same ref).
describe('chainEditor — zoned Sequencer ops (ADR-0008)', () => {
  const glyphSlot = (ref) => ({ glyphRef: ref });
  const restSlot = () => ({ rest: true });
  // A zoned sequence with the Stem zone listed BEFORE the Apex zone, so tests
  // that address by `zone` field also prove addressing is order-independent.
  const zoned = (apexSlots, stemSlots) => [
    route(),
    {
      type: 'sequence',
      zones: [
        { zone: 'stem', mode: 'cycle', continuous: false, slots: stemSlots },
        { zone: 'apex', mode: 'cycle', continuous: true, ends: 'both', slots: apexSlots },
      ],
    },
  ];
  const zoneOf = (block, id) => block.zones.find((z) => z.zone === id);

  it('addZoneSlot appends to the addressed zone (by id, not array order)', () => {
    const input = zoned([glyphSlot('flower')], [glyphSlot('leaf')]);
    const out = addZoneSlot(input, 1, 'apex', restSlot());
    expect(zoneOf(out[1], 'apex').slots).toEqual([{ glyphRef: 'flower' }, { rest: true }]);
    expect(out).not.toBe(input);
  });

  it('addZoneSlot to the Apex leaves the Stem zone reference identical (cross-zone isolation)', () => {
    const input = zoned([glyphSlot('flower')], [glyphSlot('leaf')]);
    const stemIn = zoneOf(input[1], 'stem');
    const out = addZoneSlot(input, 1, 'apex', restSlot());
    // Stem addressed by id regardless of its array position; untouched ⇒ same ref.
    expect(zoneOf(out[1], 'stem')).toBe(stemIn);
    expect(out[0]).toBe(input[0]); // route block identity preserved
  });

  it('removeZoneSlot drops the slot at index in the addressed zone; out-of-range ⇒ same ref', () => {
    const input = zoned([glyphSlot('a'), glyphSlot('b'), glyphSlot('c')], [glyphSlot('leaf')]);
    const out = removeZoneSlot(input, 1, 'apex', 1);
    expect(zoneOf(out[1], 'apex').slots).toEqual([{ glyphRef: 'a' }, { glyphRef: 'c' }]);
    expect(removeZoneSlot(input, 1, 'apex', 9)).toBe(input);
    expect(removeZoneSlot(input, 1, 'apex', -1)).toBe(input);
  });

  it('duplicateZoneSlot inserts after the source in the addressed zone, isolating the others', () => {
    const input = zoned([glyphSlot('a'), glyphSlot('b')], [glyphSlot('leaf')]);
    const stemIn = zoneOf(input[1], 'stem');
    const out = duplicateZoneSlot(input, 1, 'apex', 0);
    expect(zoneOf(out[1], 'apex').slots.map((s) => s.glyphRef)).toEqual(['a', 'a', 'b']);
    expect(zoneOf(out[1], 'stem')).toBe(stemIn);
  });

  it('duplicateZoneSlot on an unknown zone / out-of-range index ⇒ same ref', () => {
    const input = zoned([glyphSlot('a')], [glyphSlot('leaf')]);
    expect(duplicateZoneSlot(input, 1, 'node', 0)).toBe(input);
    expect(duplicateZoneSlot(input, 1, 'apex', 9)).toBe(input);
    expect(duplicateZoneSlot(input, 1, 'apex', -1)).toBe(input);
  });

  it('reorderZoneSlots moves a slot in the addressed zone; from===to / out-of-range ⇒ same ref', () => {
    const input = zoned([glyphSlot('a'), glyphSlot('b'), glyphSlot('c')], [glyphSlot('leaf')]);
    const out = reorderZoneSlots(input, 1, 'apex', 0, 2);
    expect(zoneOf(out[1], 'apex').slots.map((s) => s.glyphRef)).toEqual(['b', 'c', 'a']);
    expect(reorderZoneSlots(input, 1, 'apex', 1, 1)).toBe(input); // from === to
    expect(reorderZoneSlots(input, 1, 'apex', 0, 9)).toBe(input); // out of range
  });

  it('setZoneSlot shallow-merges a patch into one slot; other slots keep identity', () => {
    const input = zoned([glyphSlot('a'), glyphSlot('b')], [glyphSlot('leaf')]);
    const out = setZoneSlot(input, 1, 'apex', 0, { weight: 3 });
    expect(zoneOf(out[1], 'apex').slots[0]).toEqual({ glyphRef: 'a', weight: 3 });
    expect(zoneOf(out[1], 'apex').slots[1]).toBe(zoneOf(input[1], 'apex').slots[1]); // sibling slot identity
    expect(setZoneSlot(input, 1, 'apex', 9, { weight: 2 })).toBe(input); // out of range
  });

  it('setZoneSlotGlyphRef rebinds one slot glyphRef in the addressed zone', () => {
    const input = zoned([glyphSlot('leaf'), restSlot()], [glyphSlot('stemleaf')]);
    const out = setZoneSlotGlyphRef(input, 1, 'apex', 0, 'custom-uuid-1');
    expect(zoneOf(out[1], 'apex').slots[0].glyphRef).toBe('custom-uuid-1');
    expect(zoneOf(out[1], 'apex').slots[1]).toEqual({ rest: true }); // rest untouched
  });

  it('setZoneMode merges a full deal patch ({mode, continuous})', () => {
    const input = zoned([glyphSlot('flower')], [glyphSlot('leaf')]);
    const out = setZoneMode(input, 1, 'apex', { mode: 'random', continuous: false });
    expect(zoneOf(out[1], 'apex')).toMatchObject({ mode: 'random', continuous: false });
    expect(out).not.toBe(input);
  });

  it('setZoneMode with a partial patch ({continuous} only) flips only that key, leaving mode intact', () => {
    const input = zoned([glyphSlot('flower')], [glyphSlot('leaf')]);
    const out = setZoneMode(input, 1, 'apex', { continuous: false });
    expect(zoneOf(out[1], 'apex').continuous).toBe(false);
    expect(zoneOf(out[1], 'apex').mode).toBe('cycle'); // mode untouched
  });

  it('setZoneMode with an identical-value patch returns the SAME ref (no undo churn)', () => {
    const input = zoned([glyphSlot('flower')], [glyphSlot('leaf')]);
    // Apex fixture is already mode:'cycle', continuous:true.
    expect(setZoneMode(input, 1, 'apex', { mode: 'cycle' })).toBe(input);
    expect(setZoneMode(input, 1, 'apex', { mode: 'cycle', continuous: true })).toBe(input);
  });

  it('setZoneEnds sets the Apex end selector; an identical value returns the SAME ref', () => {
    const input = zoned([glyphSlot('flower')], [glyphSlot('leaf')]);
    const out = setZoneEnds(input, 1, 'apex', 'up');
    expect(zoneOf(out[1], 'apex').ends).toBe('up');
    expect(setZoneEnds(out, 1, 'apex', 'up')).toBe(out); // identical ⇒ same ref
  });

  it('unknown zoneId returns the SAME ref across every op', () => {
    const input = zoned([glyphSlot('flower')], [glyphSlot('leaf')]);
    expect(addZoneSlot(input, 1, 'node', restSlot())).toBe(input);
    expect(removeZoneSlot(input, 1, 'node', 0)).toBe(input);
    expect(reorderZoneSlots(input, 1, 'node', 0, 1)).toBe(input);
    expect(setZoneSlot(input, 1, 'node', 0, { weight: 2 })).toBe(input);
    expect(setZoneSlotGlyphRef(input, 1, 'node', 0, 'x')).toBe(input);
    expect(setZoneMode(input, 1, 'node', { mode: 'random' })).toBe(input);
    expect(setZoneEnds(input, 1, 'node', 'up')).toBe(input);
  });

  it('a flat (un-zoned) sequence is rejected by every zone op (same ref)', () => {
    const flat = [route(), { type: 'sequence', mode: 'cycle', slots: [glyphSlot('a')] }];
    expect(addZoneSlot(flat, 1, 'apex', restSlot())).toBe(flat);
    expect(removeZoneSlot(flat, 1, 'apex', 0)).toBe(flat);
    expect(reorderZoneSlots(flat, 1, 'apex', 0, 1)).toBe(flat);
    expect(setZoneSlot(flat, 1, 'apex', 0, { weight: 2 })).toBe(flat);
    expect(setZoneSlotGlyphRef(flat, 1, 'apex', 0, 'x')).toBe(flat);
    expect(setZoneMode(flat, 1, 'apex', { mode: 'random' })).toBe(flat);
    expect(setZoneEnds(flat, 1, 'apex', 'up')).toBe(flat);
  });

  it('an invalid seqIndex / non-sequence target is rejected by every zone op (same ref)', () => {
    const input = zoned([glyphSlot('flower')], [glyphSlot('leaf')]);
    expect(addZoneSlot(input, 0, 'apex', restSlot())).toBe(input); // index 0 is route
    expect(removeZoneSlot(input, 9, 'apex', 0)).toBe(input); // out of range
    expect(reorderZoneSlots(input, 0, 'apex', 0, 1)).toBe(input);
    expect(setZoneSlot(input, 0, 'apex', 0, { weight: 2 })).toBe(input);
    expect(setZoneMode(input, 9, 'apex', { mode: 'random' })).toBe(input);
    expect(setZoneEnds(input, 0, 'apex', 'up')).toBe(input);
  });
});
