import { describe, it, expect } from 'vitest';
import {
  initialSubModeState,
  subModeReducer,
  is3DActive,
} from './subModeReducer.js';

describe('initialSubModeState', () => {
  it('starts off with no focused field', () => {
    expect(initialSubModeState()).toEqual({ mode: 'off', focusFieldLayerId: null });
  });

  it('returns a fresh object each call (no shared mutable singleton)', () => {
    expect(initialSubModeState()).not.toBe(initialSubModeState());
  });
});

describe('subModeReducer', () => {
  it('OPEN_A enters panel-stack with no focused field', () => {
    const next = subModeReducer(initialSubModeState(), { type: 'OPEN_A' });
    expect(next).toEqual({ mode: 'panel-stack', focusFieldLayerId: null });
  });

  it('OPEN_B enters height-surface and stores the focused field layer id', () => {
    const next = subModeReducer(initialSubModeState(), {
      type: 'OPEN_B',
      focusFieldLayerId: 'layer-7',
    });
    expect(next).toEqual({ mode: 'height-surface', focusFieldLayerId: 'layer-7' });
  });

  it('OPEN_B coerces a missing/undefined id to null', () => {
    const next = subModeReducer(initialSubModeState(), { type: 'OPEN_B' });
    expect(next).toEqual({ mode: 'height-surface', focusFieldLayerId: null });
  });

  it('CLOSE resets both mode and focusFieldLayerId', () => {
    const open = subModeReducer(initialSubModeState(), {
      type: 'OPEN_B',
      focusFieldLayerId: 'layer-7',
    });
    expect(subModeReducer(open, { type: 'CLOSE' })).toEqual({
      mode: 'off',
      focusFieldLayerId: null,
    });
  });

  it('A → B → A clears the focused field back to null', () => {
    let s = subModeReducer(initialSubModeState(), { type: 'OPEN_A' });
    s = subModeReducer(s, { type: 'OPEN_B', focusFieldLayerId: 'g1' });
    expect(s.focusFieldLayerId).toBe('g1');
    s = subModeReducer(s, { type: 'OPEN_A' });
    expect(s).toEqual({ mode: 'panel-stack', focusFieldLayerId: null });
  });

  it('ignores unknown actions, returning the SAME state reference', () => {
    const s = initialSubModeState();
    expect(subModeReducer(s, { type: 'NOPE' })).toBe(s);
  });

  it('never mutates the incoming state', () => {
    const s = initialSubModeState();
    const frozen = Object.freeze({ ...s });
    // Object.freeze throws on mutation in strict mode (ESM) — if the reducer
    // mutated `frozen`, this would throw rather than return a new object.
    expect(() => subModeReducer(frozen, { type: 'OPEN_A' })).not.toThrow();
    expect(frozen).toEqual({ mode: 'off', focusFieldLayerId: null });
  });
});

describe('is3DActive', () => {
  it('is false when off', () => {
    expect(is3DActive({ mode: 'off', focusFieldLayerId: null })).toBe(false);
  });

  it('is true for panel-stack and height-surface', () => {
    expect(is3DActive({ mode: 'panel-stack', focusFieldLayerId: null })).toBe(true);
    expect(is3DActive({ mode: 'height-surface', focusFieldLayerId: 'g1' })).toBe(true);
  });
});
