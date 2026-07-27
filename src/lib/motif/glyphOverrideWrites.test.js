// The WRITE side of the per-glyph override model (#139).
//
// The canvas dot and the popover must agree perfectly — same records, same
// order, same chain-vs-legacy slot — so both route through these pure helpers
// instead of open-coding the edit. This file pins the behaviour the UI depends
// on, especially the two asymmetries that are invisible from a call site:
//
//   • the eye-toggle is a 4-state machine, NOT `hidden: !hidden`;
//   • Reset clears the whole record (hidden included) while Paste writes only
//     scale + angle and leaves hidden alone.
import { describe, it, expect } from 'vitest';
import {
  clearGlyphRecord,
  editBindingOverrides,
  findGlyphRecord,
  isChainFormBinding,
  patchGlyphRecord,
  readBindingOverrides,
  toggleGlyphHidden,
  writeBindingOverrides,
} from './overrides';

const chainBinding = (overrides) => ({
  chain: [{ type: 'route', roles: ['crossing'] }],
  ...(overrides ? { overrides } : {}),
});
const legacyBinding = (overrides) => ({
  selection: { roles: ['tip'], ...(overrides ? { overrides } : {}) },
});

describe('binding shape', () => {
  it('recognizes chain form by the presence of a chain ARRAY', () => {
    expect(isChainFormBinding(chainBinding())).toBe(true);
    expect(isChainFormBinding(legacyBinding())).toBe(false);
    expect(isChainFormBinding({ chain: 'nope' })).toBe(false);
    expect(isChainFormBinding(null)).toBe(false);
  });

  it('reads the slot that matches the shape, never the other one', () => {
    const ov = { records: [{ ref: 'a', hidden: true }] };
    expect(readBindingOverrides(chainBinding(ov))).toBe(ov);
    expect(readBindingOverrides(legacyBinding(ov))).toBe(ov);
    // The D bug: a chain-form binding must NOT be read at selection.overrides.
    const mixed = { chain: [], selection: { overrides: ov } };
    expect(readBindingOverrides(mixed)).toEqual({});
  });

  it('returns {} rather than null for a binding with no overrides', () => {
    expect(readBindingOverrides(chainBinding())).toEqual({});
    expect(readBindingOverrides(undefined)).toEqual({});
  });
});

describe('patchGlyphRecord', () => {
  it('appends a record when the glyph has none', () => {
    expect(patchGlyphRecord([], 'a', { scale: 2 })).toEqual([{ ref: 'a', scale: 2 }]);
  });

  it('merges into an existing record, matching by refKey across ref shapes', () => {
    const records = [{ ref: { id: 'a' }, hidden: true }];
    expect(patchGlyphRecord(records, 'a', { scale: 2 })).toEqual([
      { ref: { id: 'a' }, hidden: true, scale: 2 },
    ]);
  });

  it('DELETES a key set to null instead of storing it', () => {
    const records = [{ ref: 'a', hidden: true, scale: 2 }];
    const next = patchGlyphRecord(records, 'a', { hidden: null });
    expect(next).toEqual([{ ref: 'a', scale: 2 }]);
    expect('hidden' in next[0]).toBe(false);
  });

  it('drops a record left carrying nothing but its ref', () => {
    expect(patchGlyphRecord([{ ref: 'a', hidden: true }], 'a', { hidden: null })).toEqual([]);
  });

  it('never appends a record that would be born bare', () => {
    const records = [];
    expect(patchGlyphRecord(records, 'a', { hidden: null })).toBe(records);
  });

  it('leaves the other records untouched and in order', () => {
    const records = [
      { ref: 'a', scale: 2 },
      { ref: 'b', angle: 90 },
      { ref: 'c', hidden: true },
    ];
    const next = patchGlyphRecord(records, 'b', { scale: 0.5 });
    expect(next[0]).toBe(records[0]);
    expect(next[2]).toBe(records[2]);
    expect(next[1]).toEqual({ ref: 'b', angle: 90, scale: 0.5 });
  });

  it('does not mutate its input', () => {
    const records = [{ ref: 'a', scale: 2 }];
    const snapshot = JSON.parse(JSON.stringify(records));
    patchGlyphRecord(records, 'a', { angle: 12 });
    expect(records).toEqual(snapshot);
  });

  it('stores angle 0 — a legitimate absolute bearing, not an absent value', () => {
    expect(patchGlyphRecord([], 'a', { angle: 0 })).toEqual([{ ref: 'a', angle: 0 }]);
  });
});

describe('clearGlyphRecord — the popover Reset', () => {
  it('removes the whole record, hidden included', () => {
    const records = [
      { ref: 'a', hidden: true, scale: 2, angle: 45 },
      { ref: 'b', scale: 3 },
    ];
    expect(clearGlyphRecord(records, 'a')).toEqual([{ ref: 'b', scale: 3 }]);
  });

  it('returns the SAME array when there is nothing to clear (no phantom write)', () => {
    const records = [{ ref: 'b', scale: 3 }];
    expect(clearGlyphRecord(records, 'a')).toBe(records);
  });
});

describe('toggleGlyphHidden — the 4-state machine, not a boolean flip', () => {
  it('force-HIDES a glyph the rules currently place', () => {
    expect(toggleGlyphHidden([], 'a', true)).toEqual([{ ref: 'a', hidden: true }]);
  });

  it('force-SHOWS a candidate the rules do NOT place', () => {
    // The case a naive `hidden: !hidden` gets backwards.
    expect(toggleGlyphHidden([], 'a', false)).toEqual([{ ref: 'a', hidden: false }]);
  });

  it('clears an existing force-hide back to "let the rules decide"', () => {
    expect(toggleGlyphHidden([{ ref: 'a', hidden: true }], 'a', true)).toEqual([]);
  });

  it('clears an existing force-show back to "let the rules decide"', () => {
    expect(toggleGlyphHidden([{ ref: 'a', hidden: false }], 'a', false)).toEqual([]);
  });

  it('un-hiding PRESERVES a record that still carries scale or angle', () => {
    const records = [{ ref: 'a', hidden: true, scale: 2, angle: 45 }];
    expect(toggleGlyphHidden(records, 'a', true)).toEqual([{ ref: 'a', scale: 2, angle: 45 }]);
  });

  it('hiding MERGES into a record that already carries scale', () => {
    const records = [{ ref: 'a', scale: 2 }];
    expect(toggleGlyphHidden(records, 'a', true)).toEqual([
      { ref: 'a', scale: 2, hidden: true },
    ]);
  });

  it('treats hidden:false as "already forced" — the middle state is not skipped', () => {
    // hidden:false is falsy; a truthiness check here would re-force it to true
    // instead of clearing it.
    expect(toggleGlyphHidden([{ ref: 'a', hidden: false }], 'a', true)).toEqual([]);
  });
});

describe('writeBindingOverrides — shape-aware, no forced migration', () => {
  const records = [{ ref: 'a', scale: 2 }];

  it('writes chain-form overrides TOP-LEVEL and adds no selection key', () => {
    const next = writeBindingOverrides(chainBinding(), records);
    expect(next.overrides).toEqual({ records });
    expect('selection' in next).toBe(false);
  });

  it('writes legacy overrides under selection and keeps the binding legacy', () => {
    const next = writeBindingOverrides(legacyBinding(), records);
    expect(next.selection.overrides).toEqual({ records });
    expect(next.selection.roles).toEqual(['tip']);
    expect('overrides' in next).toBe(false);
    expect('chain' in next).toBe(false);
  });

  it('REPLACES the slot rather than merging, so stale legacy keys cannot resurrect', () => {
    const stale = legacyBinding({ include: ['x'], exclude: ['y'] });
    const next = writeBindingOverrides(stale, records);
    expect(next.selection.overrides).toEqual({ records });
    expect(next.selection.overrides.include).toBeUndefined();
    expect(next.selection.overrides.exclude).toBeUndefined();
  });

  it('carries a tolerance through when one was given', () => {
    expect(writeBindingOverrides(chainBinding(), records, 12).overrides).toEqual({
      records,
      tolerance: 12,
    });
  });
});

describe('editBindingOverrides — read, edit, write in one call', () => {
  it('migrates legacy include/exclude to records on write', () => {
    const binding = legacyBinding({ include: ['a'], exclude: ['b'] });
    const next = editBindingOverrides(binding, (recs) => patchGlyphRecord(recs, 'c', { scale: 2 }));
    expect(next.selection.overrides.records).toEqual([
      { ref: 'a', hidden: false },
      { ref: 'b', hidden: true },
      { ref: 'c', scale: 2 },
    ]);
  });

  it('returns the ORIGINAL binding reference when the edit changed nothing', () => {
    const binding = chainBinding({ records: [{ ref: 'a', scale: 2 }] });
    expect(editBindingOverrides(binding, (recs) => clearGlyphRecord(recs, 'nope'))).toBe(binding);
  });

  it('round-trips a chain-form edit through the slot the render seam reads', () => {
    const binding = chainBinding();
    const next = editBindingOverrides(binding, (recs) =>
      patchGlyphRecord(recs, 'a', { angle: 0, scale: 1.5 }),
    );
    expect(next.overrides.records).toEqual([{ ref: 'a', angle: 0, scale: 1.5 }]);
    expect(findGlyphRecord(next.overrides.records, 'a')).toEqual({
      ref: 'a',
      angle: 0,
      scale: 1.5,
    });
  });

  it('preserves an existing tolerance across an edit', () => {
    const binding = chainBinding({ records: [], tolerance: 20 });
    const next = editBindingOverrides(binding, (recs) => patchGlyphRecord(recs, 'a', { scale: 2 }));
    expect(next.overrides.tolerance).toBe(20);
  });
});

describe('the paste / reset asymmetry (charting decisions 7 and "Reset")', () => {
  it('paste overwrites scale + angle and LEAVES hidden alone', () => {
    const records = [{ ref: 'a', hidden: true, scale: 2, angle: 10 }];
    const pasted = patchGlyphRecord(records, 'a', { scale: 0.5, angle: 200 });
    expect(pasted).toEqual([{ ref: 'a', hidden: true, scale: 0.5, angle: 200 }]);
  });

  it('reset clears hidden TOO — the deliberate difference from paste', () => {
    const records = [{ ref: 'a', hidden: true, scale: 2, angle: 10 }];
    expect(clearGlyphRecord(records, 'a')).toEqual([]);
  });
});
