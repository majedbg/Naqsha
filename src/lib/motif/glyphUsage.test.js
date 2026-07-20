// glyphUsage — reference counting across base glyphRefs AND sequencer slots
// (motif-shell D; the audit's bug-3 lesson: counting only the base ref makes
// an in-place Save claim isolation while restamping slots).
import { describe, it, expect } from 'vitest';
import { glyphUseCount, glyphUsedByLayerCount } from './glyphUsage';
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
