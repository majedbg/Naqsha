import { describe, it, expect } from 'vitest';
import {
  initialPickerState,
  patternPickerReducer,
  isFamilyOn,
} from './patternPickerReducer.js';

describe('initialPickerState', () => {
  it('defaults view to "grid" with an empty off set', () => {
    const s = initialPickerState();
    expect(s.view).toBe('grid');
    expect(s.off).toBeInstanceOf(Set);
    expect(s.off.size).toBe(0);
  });

  it('accepts an explicit view', () => {
    const s = initialPickerState('map');
    expect(s.view).toBe('map');
    expect(s.off.size).toBe(0);
  });

  it('seeds sort defaults: sortMode "auto", empty manualOrder, dragPrevMode null', () => {
    const s = initialPickerState();
    expect(s.sortMode).toBe('auto');
    expect(s.manualOrder).toEqual([]);
    expect(s.dragPrevMode).toBe(null);
  });

  it('accepts seeded sortMode and manualOrder (copying the array)', () => {
    const seed = ['a', 'b', 'c'];
    const s = initialPickerState('grid', { sortMode: 'custom', manualOrder: seed });
    expect(s.sortMode).toBe('custom');
    expect(s.manualOrder).toEqual(['a', 'b', 'c']);
    expect(s.manualOrder).not.toBe(seed); // defensive copy
    expect(s.dragPrevMode).toBe(null);
  });
});

describe('patternPickerReducer — SET_VIEW', () => {
  it('changes view and leaves off untouched', () => {
    const start = { view: 'grid', off: new Set(['a', 'b']) };
    const next = patternPickerReducer(start, { type: 'SET_VIEW', view: 'map' });
    expect(next.view).toBe('map');
    expect(next.off).toBe(start.off); // off reference unchanged
    expect([...next.off]).toEqual(['a', 'b']);
  });
});

describe('patternPickerReducer — TOGGLE_FAMILY', () => {
  it('adds a key then removes it on round-trip', () => {
    const s0 = initialPickerState();
    const s1 = patternPickerReducer(s0, { type: 'TOGGLE_FAMILY', key: 'x' });
    expect(s1.off.has('x')).toBe(true);
    const s2 = patternPickerReducer(s1, { type: 'TOGGLE_FAMILY', key: 'x' });
    expect(s2.off.has('x')).toBe(false);
    expect(s2.off.size).toBe(0);
  });

  it('returns a new Set and does not mutate the incoming state', () => {
    const start = { view: 'grid', off: new Set() };
    const next = patternPickerReducer(start, { type: 'TOGGLE_FAMILY', key: 'x' });
    expect(next.off).not.toBe(start.off); // new Set instance
    expect(start.off.size).toBe(0); // original untouched
    expect(next).not.toBe(start);
    expect(next.view).toBe('grid');
  });
});

describe('patternPickerReducer — SELECT_ALL / CLEAR_ALL', () => {
  it('SELECT_ALL empties off', () => {
    const start = { view: 'grid', off: new Set(['a', 'b', 'c']) };
    const next = patternPickerReducer(start, { type: 'SELECT_ALL' });
    expect(next.off.size).toBe(0);
    expect(next.off).not.toBe(start.off);
    expect(start.off.size).toBe(3); // original untouched
  });

  it('CLEAR_ALL fills off with exactly the given keys', () => {
    const start = { view: 'map', off: new Set() };
    const keys = ['a', 'b', 'c'];
    const next = patternPickerReducer(start, { type: 'CLEAR_ALL', keys });
    expect([...next.off].sort()).toEqual(['a', 'b', 'c']);
    expect(next.view).toBe('map'); // view untouched
    expect(next.off).not.toBe(keys); // does not alias the passed array as a Set source identity
  });
});

describe('patternPickerReducer — RESET', () => {
  it('empties off but does not change view', () => {
    const start = { view: 'map', off: new Set(['a', 'b']) };
    const next = patternPickerReducer(start, { type: 'RESET' });
    expect(next.off.size).toBe(0);
    expect(next.view).toBe('map');
    expect(start.off.size).toBe(2); // original untouched
  });
});

describe('patternPickerReducer — unknown action', () => {
  it('returns the same state reference unchanged', () => {
    const start = { view: 'grid', off: new Set(['a']) };
    const next = patternPickerReducer(start, { type: 'NOPE' });
    expect(next).toBe(start);
  });
});

describe('isFamilyOn', () => {
  it('is on when key is absent from off, off when present', () => {
    const s = { view: 'grid', off: new Set(['a']) };
    expect(isFamilyOn(s, 'a')).toBe(false);
    expect(isFamilyOn(s, 'b')).toBe(true);
  });
});

describe('patternPickerReducer — SET_SORT_MODE', () => {
  it('sets sortMode to custom and back to auto', () => {
    const s0 = initialPickerState();
    const s1 = patternPickerReducer(s0, { type: 'SET_SORT_MODE', mode: 'custom' });
    expect(s1.sortMode).toBe('custom');
    expect(s1).not.toBe(s0);
    const s2 = patternPickerReducer(s1, { type: 'SET_SORT_MODE', mode: 'auto' });
    expect(s2.sortMode).toBe('auto');
  });

  it('leaves other fields untouched', () => {
    const s0 = initialPickerState('map', { manualOrder: ['a', 'b'] });
    const s1 = patternPickerReducer(s0, { type: 'SET_SORT_MODE', mode: 'custom' });
    expect(s1.view).toBe('map');
    expect(s1.manualOrder).toBe(s0.manualOrder); // array reference unchanged
  });
});

describe('patternPickerReducer — SEED_MANUAL', () => {
  it('seeds an empty manualOrder to the given ids', () => {
    const s0 = initialPickerState();
    const ids = ['a', 'b', 'c'];
    const s1 = patternPickerReducer(s0, { type: 'SEED_MANUAL', ids });
    expect(s1.manualOrder).toEqual(['a', 'b', 'c']);
  });

  it('preserves existing custom order while appending NEW ids at the end', () => {
    // user has reordered to c,a,b; a new id "d" arrives (NEW/AI pattern)
    const s0 = initialPickerState('grid', { manualOrder: ['c', 'a', 'b'] });
    const ids = ['a', 'b', 'c', 'd']; // family order, includes new "d"
    const s1 = patternPickerReducer(s0, { type: 'SEED_MANUAL', ids });
    expect(s1.manualOrder).toEqual(['c', 'a', 'b', 'd']);
  });

  it('drops stale ids that are no longer in the set', () => {
    const s0 = initialPickerState('grid', { manualOrder: ['c', 'a', 'b', 'gone'] });
    const ids = ['a', 'b', 'c']; // "gone" removed
    const s1 = patternPickerReducer(s0, { type: 'SEED_MANUAL', ids });
    expect(s1.manualOrder).toEqual(['c', 'a', 'b']);
  });

  it('combines drop-stale and append-new in one pass', () => {
    const s0 = initialPickerState('grid', { manualOrder: ['c', 'gone', 'a'] });
    const ids = ['a', 'b', 'c', 'd'];
    const s1 = patternPickerReducer(s0, { type: 'SEED_MANUAL', ids });
    // keep c,a (existing & present, in order) then append b,d (new, in ids order)
    expect(s1.manualOrder).toEqual(['c', 'a', 'b', 'd']);
  });

  it('treats a missing ids field as empty (clears stale order)', () => {
    const s0 = initialPickerState('grid', { manualOrder: ['a', 'b'] });
    const s1 = patternPickerReducer(s0, { type: 'SEED_MANUAL' });
    expect(s1.manualOrder).toEqual([]);
  });

  it('does not mutate the incoming state or the ids array', () => {
    const s0 = initialPickerState('grid', { manualOrder: ['c', 'a'] });
    const before = [...s0.manualOrder];
    const ids = ['a', 'b', 'c'];
    const idsBefore = [...ids];
    const s1 = patternPickerReducer(s0, { type: 'SEED_MANUAL', ids });
    expect(s0.manualOrder).toEqual(before); // original untouched
    expect(s1.manualOrder).not.toBe(s0.manualOrder);
    expect(ids).toEqual(idsBefore); // input array untouched
  });
});

describe('patternPickerReducer — MOVE', () => {
  const base = () =>
    initialPickerState('grid', { manualOrder: ['a', 'b', 'c', 'd'] });

  it('moves first → last', () => {
    const s = patternPickerReducer(base(), { type: 'MOVE', id: 'a', toIndex: 3 });
    expect(s.manualOrder).toEqual(['b', 'c', 'd', 'a']);
  });

  it('moves last → first', () => {
    const s = patternPickerReducer(base(), { type: 'MOVE', id: 'd', toIndex: 0 });
    expect(s.manualOrder).toEqual(['d', 'a', 'b', 'c']);
  });

  it('moves middle → middle (b to index 2, after removal-then-insert)', () => {
    // remove b -> [a,c,d]; insert at index 2 -> [a,c,b,d]
    const s = patternPickerReducer(base(), { type: 'MOVE', id: 'b', toIndex: 2 });
    expect(s.manualOrder).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves to index 0', () => {
    const s = patternPickerReducer(base(), { type: 'MOVE', id: 'c', toIndex: 0 });
    expect(s.manualOrder).toEqual(['c', 'a', 'b', 'd']);
  });

  it('moves to the end via an in-range high index', () => {
    const s = patternPickerReducer(base(), { type: 'MOVE', id: 'b', toIndex: 3 });
    expect(s.manualOrder).toEqual(['a', 'c', 'd', 'b']);
  });

  it('clamps a too-large toIndex to the end', () => {
    const s = patternPickerReducer(base(), { type: 'MOVE', id: 'a', toIndex: 99 });
    expect(s.manualOrder).toEqual(['b', 'c', 'd', 'a']);
  });

  it('clamps a negative toIndex to 0', () => {
    const s = patternPickerReducer(base(), { type: 'MOVE', id: 'c', toIndex: -5 });
    expect(s.manualOrder).toEqual(['c', 'a', 'b', 'd']);
  });

  it('is a no-op (same state ref) when the id is absent', () => {
    const s0 = base();
    const s1 = patternPickerReducer(s0, { type: 'MOVE', id: 'zzz', toIndex: 1 });
    expect(s1).toBe(s0);
  });

  it('does not mutate the original manualOrder', () => {
    const s0 = base();
    const before = [...s0.manualOrder];
    const s1 = patternPickerReducer(s0, { type: 'MOVE', id: 'a', toIndex: 2 });
    expect(s0.manualOrder).toEqual(before);
    expect(s1.manualOrder).not.toBe(s0.manualOrder);
  });
});

describe('patternPickerReducer — RESET_MANUAL', () => {
  it('sets manualOrder to the supplied order (copying the array)', () => {
    const s0 = initialPickerState('grid', { manualOrder: ['c', 'a', 'b'] });
    const ids = ['a', 'b', 'c'];
    const s1 = patternPickerReducer(s0, { type: 'RESET_MANUAL', ids });
    expect(s1.manualOrder).toEqual(['a', 'b', 'c']);
    expect(s1.manualOrder).not.toBe(ids); // defensive copy
  });

  it('treats a missing ids field as empty', () => {
    const s0 = initialPickerState('grid', { manualOrder: ['a', 'b'] });
    const s1 = patternPickerReducer(s0, { type: 'RESET_MANUAL' });
    expect(s1.manualOrder).toEqual([]);
  });
});

describe('patternPickerReducer — drag lifecycle', () => {
  it('DRAG_START records prevMode and switches sortMode to custom', () => {
    const s0 = initialPickerState(); // sortMode 'auto'
    const s1 = patternPickerReducer(s0, { type: 'DRAG_START', prevMode: 'auto' });
    expect(s1.sortMode).toBe('custom');
    expect(s1.dragPrevMode).toBe('auto');
  });

  it('DRAG_CANCEL reverts to prevMode "auto" and clears dragPrevMode', () => {
    const s0 = initialPickerState();
    const s1 = patternPickerReducer(s0, { type: 'DRAG_START', prevMode: 'auto' });
    const s2 = patternPickerReducer(s1, { type: 'DRAG_CANCEL' });
    expect(s2.sortMode).toBe('auto');
    expect(s2.dragPrevMode).toBe(null);
  });

  it('DRAG_CANCEL reverts to prevMode "custom" (drag begun while already custom)', () => {
    const s0 = initialPickerState('grid', { sortMode: 'custom' });
    const s1 = patternPickerReducer(s0, { type: 'DRAG_START', prevMode: 'custom' });
    expect(s1.sortMode).toBe('custom');
    const s2 = patternPickerReducer(s1, { type: 'DRAG_CANCEL' });
    expect(s2.sortMode).toBe('custom');
    expect(s2.dragPrevMode).toBe(null);
  });

  it('DRAG_CANCEL without a recorded prevMode keeps the current sortMode', () => {
    const s0 = initialPickerState('grid', { sortMode: 'custom' }); // dragPrevMode null
    const s1 = patternPickerReducer(s0, { type: 'DRAG_CANCEL' });
    expect(s1.sortMode).toBe('custom');
    expect(s1.dragPrevMode).toBe(null);
  });

  it('DRAG_COMMIT keeps custom sortMode and clears dragPrevMode', () => {
    const s0 = initialPickerState();
    const s1 = patternPickerReducer(s0, { type: 'DRAG_START', prevMode: 'auto' });
    const s2 = patternPickerReducer(s1, { type: 'DRAG_COMMIT' });
    expect(s2.sortMode).toBe('custom');
    expect(s2.dragPrevMode).toBe(null);
  });
});
