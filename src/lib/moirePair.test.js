import { describe, it, expect } from 'vitest';
import {
  isMoireMember,
  findMoirePartnerA,
  findMoirePartnerB,
  resolveMoireSource,
} from './moirePair';

// Single-source-of-truth resolution: role B reads role A's params; an orphan B
// (no partner A) resolves to null so callers render/export nothing.

const A = {
  id: 'a',
  patternType: 'moire',
  moireRole: 'A',
  moireGroupId: 'g1',
  params: { fieldType: 'parallelLines', density: 120, moireRotation: 5 },
};
const B = {
  id: 'b',
  patternType: 'moire',
  moireRole: 'B',
  moireGroupId: 'g1',
  params: { fieldType: 'parallelLines', density: 999 }, // garbage — must be ignored
};
const NORMAL = { id: 'n', patternType: 'grid', params: { cols: 12 } };

describe('moirePair helpers', () => {
  it('isMoireMember is true only for moire layers with a role + group', () => {
    expect(isMoireMember(A)).toBe(true);
    expect(isMoireMember(B)).toBe(true);
    expect(isMoireMember(NORMAL)).toBe(false);
    expect(isMoireMember({ patternType: 'moire' })).toBe(false); // no role/group
    expect(isMoireMember(null)).toBe(false);
  });

  it('findMoirePartnerA / B locate the sibling by groupId + role', () => {
    const all = [A, B, NORMAL];
    expect(findMoirePartnerA(B, all)).toBe(A);
    expect(findMoirePartnerB(A, all)).toBe(B);
    expect(findMoirePartnerA(A, all)).toBe(A); // A's "A partner" is itself
  });

  it('role A resolves to its OWN params', () => {
    const res = resolveMoireSource(A, [A, B]);
    expect(res).toEqual({ params: A.params, moireRole: 'A' });
  });

  it('role B resolves to partner A\'s params (NOT its own)', () => {
    const res = resolveMoireSource(B, [A, B]);
    expect(res.moireRole).toBe('B');
    expect(res.params).toBe(A.params);
    expect(res.params.density).toBe(120); // A's, not B's 999
  });

  it('orphan B (no partner A) resolves to null', () => {
    const orphanB = { ...B, moireGroupId: 'lonely' };
    expect(resolveMoireSource(orphanB, [orphanB, NORMAL])).toBeNull();
  });

  it('null layer resolves to null', () => {
    expect(resolveMoireSource(null, [])).toBeNull();
  });

  // Render-guard contract: the useCanvas render loop skips a layer when the
  // resolver returns null. This mirrors that loop over an array containing an
  // ORPHAN B and proves it produces no render params / doesn't throw.
  it('render loop over a layers array with an orphan B skips it (no throw)', () => {
    const orphanB = { ...B, id: 'ob', moireGroupId: 'lonely' };
    const layers = [A, B, orphanB, NORMAL];
    const rendered = [];
    expect(() => {
      for (const layer of layers) {
        let renderParams = layer.params;
        if (layer.moireRole) {
          const resolved = resolveMoireSource(layer, layers);
          if (!resolved) continue; // orphan B → skip, no instance
          renderParams = { ...resolved.params, moireRole: resolved.moireRole };
        }
        rendered.push({ id: layer.id, renderParams });
      }
    }).not.toThrow();
    // A, B (resolved to A's params), NORMAL render; orphan B skipped.
    expect(rendered.map((r) => r.id)).toEqual(['a', 'b', 'n']);
    const bRendered = rendered.find((r) => r.id === 'b');
    expect(bRendered.renderParams.density).toBe(120); // A's params, role B
    expect(bRendered.renderParams.moireRole).toBe('B');
  });
});
