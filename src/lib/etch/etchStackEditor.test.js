import { describe, it, expect } from 'vitest';
import { createToneStage } from './etchStage.js';
import {
  addStage,
  removeStage,
  reorderStage,
  setBypass,
  patchStageParams,
} from './etchStackEditor.js';

const s = (id) => ({ id, type: 'tone', bypassed: false, params: { exposure: 0, brightness: 0, contrast: 0, levels: { blackPoint: 0, whitePoint: 255, gamma: 1 } } });

describe('etchStackEditor — pure document-state ops on an Etch Stack', () => {
  it('addStage appends without mutating the input array', () => {
    const stack = [s('a')];
    const next = addStage(stack, createToneStage());
    expect(next.length).toBe(2);
    expect(stack.length).toBe(1); // immutable
    expect(next[0]).toBe(stack[0]);
  });

  it('removeStage drops by id', () => {
    const next = removeStage([s('a'), s('b'), s('c')], 'b');
    expect(next.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('reorderStage moves a Stage from one index to another (order is document state)', () => {
    const stack = [s('a'), s('b'), s('c')];
    expect(reorderStage(stack, 0, 2).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(reorderStage(stack, 2, 0).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    // out-of-range / no-op returns an equivalent order, never throws
    expect(reorderStage(stack, 1, 1).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(reorderStage(stack, -1, 5).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('setBypass flips only the targeted Stage', () => {
    const next = setBypass([s('a'), s('b')], 'a', true);
    expect(next.find((x) => x.id === 'a').bypassed).toBe(true);
    expect(next.find((x) => x.id === 'b').bypassed).toBe(false);
  });

  it('patchStageParams shallow-merges params and deep-merges nested levels', () => {
    const stack = [s('a')];
    const next = patchStageParams(stack, 'a', { exposure: 40, levels: { gamma: 1.8 } });
    const p = next[0].params;
    expect(p.exposure).toBe(40);
    expect(p.brightness).toBe(0); // untouched
    expect(p.levels).toEqual({ blackPoint: 0, whitePoint: 255, gamma: 1.8 }); // merged, not replaced
    // original untouched
    expect(stack[0].params.exposure).toBe(0);
    expect(stack[0].params.levels.gamma).toBe(1);
  });
});
