// glyphUsage — reference counting across base glyphRefs AND sequencer slots
// (motif-shell D; the audit's bug-3 lesson: counting only the base ref makes
// an in-place Save claim isolation while restamping slots).
import { describe, it, expect } from 'vitest';
import { glyphUseCount, glyphUsedByLayerCount, glyphUsageMap } from './glyphUsage';
import { MOTIF_TYPE } from './motifLayer';

const motif = (id, glyphRef, chain) => ({
  id,
  type: MOTIF_TYPE,
  patternType: MOTIF_TYPE,
  params: { hostLayerId: 'h', glyphRef, binding: chain ? { chain } : {} },
});
const plain = (id) => ({ id, patternType: 'grid', params: {} });

describe('glyphUseCount', () => {
  it('counts base glyphRef references', () => {
    const layers = [plain('h'), motif('m1', 'cg-1'), motif('m2', 'cg-1')];
    expect(glyphUseCount(layers, 'cg-1')).toBe(2);
  });

  it('counts sequencer-slot references (the bug-3 case)', () => {
    const chain = [
      { type: 'route', roles: ['crossing'] },
      { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'cg-2' }, { rest: true }, { glyphRef: 'cg-2' }] },
    ];
    const layers = [plain('h'), motif('m1', 'leaf', chain)];
    expect(glyphUseCount(layers, 'cg-2')).toBe(2);
  });

  it('sums base + slot refs and ignores non-motif layers', () => {
    const chain = [{ type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'cg-3' }] }];
    const layers = [plain('h'), motif('m1', 'cg-3', chain), plain('x')];
    expect(glyphUseCount(layers, 'cg-3')).toBe(2);
  });

  it('returns 0 for an unreferenced or empty id', () => {
    const layers = [plain('h'), motif('m1', 'leaf')];
    expect(glyphUseCount(layers, 'cg-9')).toBe(0);
    expect(glyphUseCount(layers, '')).toBe(0);
    expect(glyphUseCount(null, 'cg-9')).toBe(0);
  });
});

describe('glyphUsageMap', () => {
  // Single-pass replacement for calling glyphUseCount per glyph inside a render
  // map (was O(glyphs × layers × blocks × slots)). Contract: the returned Map
  // holds ONLY referenced ids; an unused glyph is ABSENT (callers use
  // `map.get(id) ?? 0`), and each id's value equals glyphUseCount for that id.
  it('counts base + slot refs across layers in one pass, agreeing with glyphUseCount', () => {
    const chain = [
      { type: 'route', roles: ['crossing'] },
      { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'cg-2' }, { rest: true }, { glyphRef: 'cg-2' }] },
    ];
    const layers = [plain('h'), motif('m1', 'cg-1', chain), motif('m2', 'cg-1'), plain('x')];
    const map = glyphUsageMap(layers);
    expect(map.get('cg-1')).toBe(2); // two base refs
    expect(map.get('cg-2')).toBe(2); // two sequencer slots
    // Agrees with the per-id function it replaces.
    expect(map.get('cg-1')).toBe(glyphUseCount(layers, 'cg-1'));
    expect(map.get('cg-2')).toBe(glyphUseCount(layers, 'cg-2'));
  });

  it('omits unreferenced ids and never keys a rest/empty slot', () => {
    const chain = [{ type: 'sequence', mode: 'cycle', slots: [{ rest: true }, { glyphRef: 'cg-3' }] }];
    const layers = [plain('h'), motif('m1', 'cg-3', chain)];
    const map = glyphUsageMap(layers);
    expect(map.get('cg-9')).toBeUndefined(); // absent, not 0
    expect(map.has(undefined)).toBe(false);
    expect(map.has('')).toBe(false);
    expect(map.get('cg-3')).toBe(2); // base + one slot
  });

  it('returns an empty map for empty/nullish layers', () => {
    expect(glyphUsageMap(null).size).toBe(0);
    expect(glyphUsageMap([]).size).toBe(0);
  });
});

describe('glyphUsedByLayerCount', () => {
  it('counts a layer ONCE even when base + multiple slots all reference the glyph', () => {
    const chain = [
      { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'cg-1' }, { glyphRef: 'cg-1' }] },
    ];
    const layers = [plain('h'), motif('m1', 'cg-1', chain), motif('m2', 'cg-1')];
    expect(glyphUsedByLayerCount(layers, 'cg-1')).toBe(2);
  });

  it('counts a slot-only reference as a using layer', () => {
    const chain = [{ type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'cg-4' }] }];
    const layers = [motif('m1', 'leaf', chain)];
    expect(glyphUsedByLayerCount(layers, 'cg-4')).toBe(1);
  });
});
