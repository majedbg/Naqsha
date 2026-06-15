// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLayers from './useLayers';
import { DEFAULT_PARAMS } from '../constants';

// Pair-aware layer infrastructure for Moiré (Phase 2). useLayers owns setLayers,
// so the atomic multi-layer ops (spawn pair, dissolve pair, pair delete/reorder/
// duplicate) live here. The pattern-switch patch is the same one usePatternCache
// computes; here we just feed a minimal `{patternType:'moire'}` patch.

// A minimal moire-switch patch (what usePatternCache would produce).
const moirePatch = {
  patternType: 'moire',
  params: { ...DEFAULT_PARAMS.moire },
  randomizeKeys: [],
  paramsCache: {},
};

function setup({ maxLayers } = {}) {
  return renderHook(() => useLayers({ persistToLocal: false, maxLayers }));
}

describe('useLayers — Moiré pair lifecycle', () => {
  it('starts with one non-moiré layer (persistToLocal:false)', () => {
    const { result } = setup();
    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers[0].moireRole).toBeUndefined();
  });

  it('selecting moire spawns a 2-layer pair (A + B, same groupId, distinct roles)', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch));

    const ls = result.current.layers;
    expect(ls.length).toBe(2);
    const [a, b] = ls;
    expect(a.patternType).toBe('moire');
    expect(b.patternType).toBe('moire');
    expect(a.moireRole).toBe('A');
    expect(b.moireRole).toBe('B');
    expect(a.moireGroupId).toBe(b.moireGroupId);
    expect(a.moireGroupId).toBeTruthy();
    // B is adjacent, right after A
    expect(ls.indexOf(b)).toBe(ls.indexOf(a) + 1);
    // Independent surfaces: distinct ids + colors
    expect(a.id).not.toBe(b.id);
    expect(a.color).not.toBe(b.color);
  });

  it('selecting moire when ALREADY a member is a no-op (no 3rd surface)', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch));
    const aId = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(aId, moirePatch));
    expect(result.current.layers.length).toBe(2);
  });

  it('blocks spawn (no spawn + blocked flag) when there is no free slot', () => {
    // Guest cap = 3; fill to 3 first.
    const { result } = setup({ maxLayers: 3 });
    act(() => result.current.addLayer());
    act(() => result.current.addLayer());
    expect(result.current.layers.length).toBe(3);
    const id = result.current.layers[0].id;
    let res;
    act(() => { res = result.current.changeLayerPattern(id, moirePatch); });
    expect(result.current.layers.length).toBe(3); // unchanged
    expect(res.blocked).toBe(true);
    expect(result.current.layers[0].patternType).not.toBe('moire');
  });

  it('delete A removes BOTH members', () => {
    const { result } = setup({ maxLayers: 6 });
    act(() => result.current.addLayer()); // give a survivor so min-1 holds
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch));
    expect(result.current.layers.length).toBe(3); // A, B, survivor
    const aId = result.current.layers.find((l) => l.moireRole === 'A').id;
    act(() => result.current.removeLayer(aId));
    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers.some((l) => l.patternType === 'moire')).toBe(false);
  });

  it('delete B removes BOTH members', () => {
    const { result } = setup({ maxLayers: 6 });
    act(() => result.current.addLayer());
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch));
    const bId = result.current.layers.find((l) => l.moireRole === 'B').id;
    act(() => result.current.removeLayer(bId));
    expect(result.current.layers.length).toBe(1);
    expect(result.current.layers.some((l) => l.patternType === 'moire')).toBe(false);
  });

  it('delete is blocked when the pair IS the whole canvas (min-1 post-removal)', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch));
    expect(result.current.layers.length).toBe(2);
    const aId = result.current.layers[0].id;
    act(() => result.current.removeLayer(aId));
    expect(result.current.layers.length).toBe(2); // blocked — would empty canvas
  });

  it('switch-away from A dissolves the pair (partner removed, role fields cleared)', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch));
    const aId = result.current.layers.find((l) => l.moireRole === 'A').id;
    act(() =>
      result.current.changeLayerPattern(aId, {
        patternType: 'grid',
        params: { ...DEFAULT_PARAMS.grid },
        randomizeKeys: [],
        paramsCache: {},
      })
    );
    const ls = result.current.layers;
    expect(ls.length).toBe(1);
    expect(ls[0].patternType).toBe('grid');
    expect(ls[0].moireRole).toBeUndefined();
    expect(ls[0].moireGroupId).toBeUndefined();
  });

  it('switch-away from B dissolves the pair too (B becomes the normal layer)', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch));
    const bId = result.current.layers.find((l) => l.moireRole === 'B').id;
    act(() =>
      result.current.changeLayerPattern(bId, {
        patternType: 'spiral',
        params: { ...DEFAULT_PARAMS.spiral },
        randomizeKeys: [],
        paramsCache: {},
      })
    );
    const ls = result.current.layers;
    expect(ls.length).toBe(1);
    expect(ls[0].id).toBe(bId);
    expect(ls[0].patternType).toBe('spiral');
    expect(ls[0].moireRole).toBeUndefined();
  });

  it('duplicate of a pair yields a NEW pair with a new groupId (needs 2 slots)', () => {
    const { result } = setup({ maxLayers: 6 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch));
    const aId = result.current.layers[0].id;
    const origGroup = result.current.layers[0].moireGroupId;
    act(() => result.current.duplicateLayer(aId));
    const ls = result.current.layers;
    expect(ls.length).toBe(4);
    const groups = [...new Set(ls.map((l) => l.moireGroupId))];
    expect(groups.length).toBe(2); // two distinct pairs
    const newPair = ls.filter((l) => l.moireGroupId !== origGroup);
    expect(newPair.length).toBe(2);
    expect(newPair.map((l) => l.moireRole).sort()).toEqual(['A', 'B']);
  });

  it('duplicate of a pair is blocked when fewer than 2 free slots', () => {
    const { result } = setup({ maxLayers: 3 });
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch)); // 2 layers
    const aId = result.current.layers[0].id;
    act(() => result.current.duplicateLayer(aId)); // would need 4 slots, cap 3
    expect(result.current.layers.length).toBe(2);
  });

  it('reorder keeps the pair adjacent when moving a block down past a normal layer', () => {
    const { result } = setup({ maxLayers: 6 });
    // Build: [normal, A, B] then move the pair up to the front.
    act(() => result.current.addLayer()); // [n0, n1]
    const id = result.current.layers[1].id; // make the SECOND a moiré pair
    act(() => result.current.changeLayerPattern(id, moirePatch)); // [n0, A, B]
    let ls = result.current.layers;
    expect(ls[0].moireRole).toBeUndefined();
    expect(ls[1].moireRole).toBe('A');
    expect(ls[2].moireRole).toBe('B');

    // Move the pair up (toward front): block starts at index 1 → reorder(1,0).
    act(() => result.current.reorderLayers(1, 0));
    ls = result.current.layers;
    // Pair now at the front, still adjacent + ordered A,B.
    expect(ls[0].moireRole).toBe('A');
    expect(ls[1].moireRole).toBe('B');
    expect(ls[2].moireRole).toBeUndefined();
    expect(ls[0].moireGroupId).toBe(ls[1].moireGroupId);
  });

  it('reorder keeps the pair adjacent when moving the block DOWN past a normal layer', () => {
    const { result } = setup({ maxLayers: 6 });
    // Build [A, B, normal]: make the FIRST layer a moiré pair, then add a normal.
    const id = result.current.layers[0].id;
    act(() => result.current.changeLayerPattern(id, moirePatch)); // [A, B]
    act(() => result.current.addLayer()); // [A, B, n]
    let ls = result.current.layers;
    expect(ls[0].moireRole).toBe('A');
    expect(ls[1].moireRole).toBe('B');
    expect(ls[2].moireRole).toBeUndefined();

    // Move the pair down (toward back): block ends at index 1 → reorder(1, 2).
    act(() => result.current.reorderLayers(1, 2));
    ls = result.current.layers;
    // Normal layer now on top; pair moved as a block, still adjacent + A,B.
    expect(ls[0].moireRole).toBeUndefined();
    expect(ls[1].moireRole).toBe('A');
    expect(ls[2].moireRole).toBe('B');
    expect(ls[1].moireGroupId).toBe(ls[2].moireGroupId);

    // Moving the block down again at the bottom is a no-op (stays adjacent).
    act(() => result.current.reorderLayers(2, 3));
    ls = result.current.layers;
    expect(ls[1].moireRole).toBe('A');
    expect(ls[2].moireRole).toBe('B');
  });
});
