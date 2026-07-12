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
