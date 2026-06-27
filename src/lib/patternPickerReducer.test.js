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
