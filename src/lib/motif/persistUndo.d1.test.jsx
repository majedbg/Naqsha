// @vitest-environment jsdom
//
// D1 — chain PERSISTENCE + UNDO verification (issue #79, Phase D).
//
// Three deliverables live here (the export golden is export.d1.test.js):
//
//  #2 Chain persistence round-trip. A chain-form binding is plain JSON in
//     `layer.params.binding`. It must survive the localStorage save→load path
//     (STORAGE_KEY 'sonoform-layers', JSON.stringify/parse) intact. The test
//     that BITES is the LOAD path: `migrateLayer` must NOT touch `params.binding`
//     — no eager migration, no lossy transform — so a chain-form doc loads
//     byte-identical to what was saved. Proven both as a direct `migrateLayer`
//     ref-identity bite AND through the real hook (seed localStorage → mount →
//     read back; mutate → save → read the serialized file).
//
//  #3 Legacy-doc-unchanged + upgrade-on-edit round-trip (D9, end-to-end). A
//     LEGACY-selection doc loads with NO eager migration (chain undefined,
//     selection intact — the render byte-identity itself rides on A3/B3's
//     compile goldens BY COMPOSITION; D1 proves only the no-eager-migration
//     precondition). The FIRST block edit upgrades it to chain-form as ONE undo
//     entry (ensureChainForm → deepMergeBinding → one updateLayer, `selection`
//     DROPPED — never coexisting with `chain`), ⌘Z restores the legacy binding
//     byte-identical, and the upgraded chain-form binding then PERSISTS intact.
//     The edit path is a RECONSTRUCTION of Inspector's `editChain` composition
//     (the live component wiring is C2/C3/C4); this integration uses the real
//     useLayers/updateLayer + useHistory undo engine.
//
//  #4 Chain edits ride updateLayer/undo (mostly proven in C2/C3/C4). A
//     representative chain edit — block reorder, a slot edit, a pickedPath
//     toggle — is exactly one undo entry and ⌘Z restores the prior binding.
//
// Harness mirrors src/lib/history/recordSites.integration.test.jsx: useLayers +
// useHistory wired exactly as Studio does (record-injection + restore guard),
// exercising the REAL async setState/undo path.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCallback, useEffect, useRef } from 'react';
import useLayers from '../useLayers';
import useHistory from '../history/useHistory';
import { migrateLayer } from '../migration.js';
import {
  createMotifParams,
  ensureChainForm,
  deepMergeBinding,
} from './motifLayer.js';
import {
  reorderChain,
  addBlock,
  makeBlock,
  setSlot,
  togglePickedPath,
} from './chainEditor.js';

const STORAGE_KEY = 'sonoform-layers';

// A rich chain-form binding exercising every branch the round-trip must preserve:
// a route block with pickedPaths, a cycling everyN, a sequence with mixed slots
// (glyph / rest / glyph+modifiers), top-level overrides, and placement.
const RICH_CHAIN_BINDING = {
  chain: [
    { type: 'route', roles: ['edge'], pathScope: 'picked', pickedPaths: [0, 3, 7] },
    { type: 'everyN', n: 2, offset: 1, continuous: true, seed: 4 },
    {
      type: 'sequence',
      mode: 'cycle',
      slots: [
        { glyphRef: 'leaf' },
        { rest: true },
        { glyphRef: 'dot', sizeScale: 1.5, rotationRandom: { range: 30, spread: 'bell' } },
      ],
    },
  ],
  overrides: { exclude: [{ id: 'a1' }], include: [{ id: 'a2' }] },
  placement: { sizing: { size: 20 } },
};

// A LEGACY selection binding (no chain) — the pre-migration document shape.
const LEGACY_BINDING = {
  selection: { roles: ['crossing'], skip: [false, true] },
  placement: { sizing: { size: 18 } },
};

function motifLayerObj(id, hostId, binding) {
  return {
    id,
    name: 'Motif',
    type: 'motif',
    patternType: 'motif',
    visible: true,
    color: '#000000',
    opacity: 100,
    params: createMotifParams({ hostLayerId: hostId, glyphRef: 'leaf', binding, anchorMode: 'edge' }),
    randomizeKeys: [],
    paramsCache: {},
  };
}

function hostLayerObj(id) {
  return { id, name: 'Grid', type: 'grid', patternType: 'grid', visible: true, params: {}, randomizeKeys: [], paramsCache: {} };
}

// Seed host + motif WITHOUT a history entry (loadLayerSet setLayers directly, no
// recordStructural) so a subsequent chain edit is the FIRST and ONLY undo entry —
// letting "canUndo===false after one ⌘Z" pin EXACTLY one entry (the addMotifLayer
// path would otherwise leave a structural add entry underneath and contaminate it).
function seedMotif(result, binding) {
  const host = hostLayerObj('layer-0-host');
  const motif = motifLayerObj('layer-9-motif', 'layer-0-host', binding);
  act(() => result.current.layersApi.loadLayerSet([host, motif]));
  return result.current.layersApi.layers.find((l) => l.type === 'motif');
}

// ── the Studio-mirroring harness (record injection + restore guard) ──────────
function useWired() {
  const historyRef = useRef(null);
  const restoringRef = useRef(false);
  const editKeyRef = useRef(null);

  const flushEdit = useCallback(() => {
    if (editKeyRef.current !== null) {
      editKeyRef.current = null;
      historyRef.current?.endCoalesce();
    }
  }, []);
  const recordEdit = useCallback((signature) => {
    if (restoringRef.current) return;
    const api = historyRef.current;
    if (!api) return;
    if (editKeyRef.current !== null && editKeyRef.current !== signature) api.endCoalesce();
    editKeyRef.current = signature;
    api.beginCoalesce({ idleMs: 400 });
  }, []);
  const recordStructural = useCallback(() => {
    if (restoringRef.current) return;
    flushEdit();
    historyRef.current?.record();
  }, [flushEdit]);

  const layersApi = useLayers({ persistToLocal: false, recordEdit, recordStructural });

  const layersRef = useRef(layersApi.layers);
  useEffect(() => {
    layersRef.current = layersApi.layers;
  });

  const capture = useCallback(() => ({ layers: structuredClone(layersRef.current) }), []);
  const restore = useCallback(
    (s) => {
      restoringRef.current = true;
      try {
        layersApi.loadLayerSet(s.layers);
      } finally {
        restoringRef.current = false;
      }
    },
    [layersApi]
  );

  const history = useHistory({ capture, restore });
  useEffect(() => {
    historyRef.current = history;
  });

  return { layersApi, history };
}

// Reconstruction of Inspector.jsx `editChain` (the C1 first-edit-as-one-undo
// composition). Returns whether a write happened (false = no-op, no churn).
function editChain(layersApi, layer, mutate) {
  const base = ensureChainForm(layer.params?.binding);
  const nextChain = mutate(base.chain);
  if (nextChain === base.chain) return false;
  layersApi.updateLayer(layer.id, {
    params: { ...layer.params, binding: deepMergeBinding(base, { chain: nextChain }) },
  });
  return true;
}

const motifOf = (result, id) => result.current.layersApi.layers.find((l) => l.id === id);

// =============================================================================
// #2 — chain persistence round-trip
// =============================================================================
describe('D1 #2 — chain persistence round-trip (localStorage save↔load)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('LOAD-path bite: migrateLayer does NOT touch params / params.binding (ref-identity preserved)', () => {
    const layer = motifLayerObj('layer-5-abc', 'layer-0-host', RICH_CHAIN_BINDING);
    const migrated = migrateLayer(layer);
    // migrateLayer adds nameIsCustom/locked/operationId but must carry `params`
    // through untouched — the strongest possible bite is REFERENCE identity.
    expect(migrated.params).toBe(layer.params);
    expect(migrated.params.binding).toBe(layer.params.binding);
    // The migration still did its job (added the defaults) — proving this isn't
    // a vacuous "returned the input" path.
    expect(migrated.operationId).toBeTruthy();
    expect(migrated).not.toBe(layer);
  });

  it('LOAD via the real hook: a chain-form doc seeded into localStorage loads byte-identical', () => {
    const host = { id: 'layer-0-host', name: 'Grid', type: 'grid', patternType: 'grid', visible: true, params: {} };
    const motif = motifLayerObj('layer-5-abc', 'layer-0-host', RICH_CHAIN_BINDING);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([host, motif]));

    const { result } = renderHook(() => useLayers({ persistToLocal: true }));
    const loaded = result.current.layers.find((l) => l.id === 'layer-5-abc');
    expect(loaded).toBeTruthy();
    // The whole binding — chain array, sequence slots, pickedPaths, overrides,
    // placement — survives the JSON.parse + migrateLayer load path intact.
    expect(loaded.params.binding).toEqual(RICH_CHAIN_BINDING);
    expect(loaded.params.binding.chain[0].pickedPaths).toEqual([0, 3, 7]);
    expect(loaded.params.binding.chain[2].slots).toEqual(RICH_CHAIN_BINDING.chain[2].slots);
    expect(loaded.params.binding.overrides).toEqual(RICH_CHAIN_BINDING.overrides);
  });

  it('SAVE path: a chain binding written into a layer serializes into localStorage intact', () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useLayers({ persistToLocal: true }));
      const id = result.current.layers[0].id;
      // Write a chain-form binding onto an existing layer's params.
      act(() =>
        result.current.updateLayer(id, {
          type: 'motif',
          patternType: 'motif',
          params: createMotifParams({ glyphRef: 'leaf', binding: RICH_CHAIN_BINDING }),
        })
      );
      // Debounced save fires at 3000ms.
      act(() => vi.advanceTimersByTime(3000));
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw);
      const saved = parsed.find((l) => l.id === id);
      expect(saved.params.binding.chain).toEqual(RICH_CHAIN_BINDING.chain);
      expect(saved.params.binding.overrides).toEqual(RICH_CHAIN_BINDING.overrides);
    } finally {
      vi.useRealTimers();
    }
  });
});

// =============================================================================
// #3 — legacy → edit (upgrade) → undo → persist, end-to-end
// =============================================================================
describe('D1 #3 — legacy unchanged, upgrade-on-edit as ONE undo entry, then persist', () => {
  const addLegacyMotif = (result) => seedMotif(result, LEGACY_BINDING);

  it('a legacy doc loads with NO eager migration (chain undefined, selection intact)', () => {
    const { result } = renderHook(() => useWired());
    const motif = addLegacyMotif(result);
    // The no-eager-migration precondition: the stored binding is still legacy.
    expect(motif.params.binding.chain).toBeUndefined();
    expect(motif.params.binding.selection).toEqual(LEGACY_BINDING.selection);
  });

  it('first block edit upgrades legacy→chain as ONE undo entry; ⌘Z restores the legacy binding byte-identical', () => {
    const { result } = renderHook(() => useWired());
    const motif = addLegacyMotif(result);
    const motifId = motif.id;
    const legacyBindingBefore = structuredClone(motif.params.binding);

    // FIRST block edit — add an everyN block. editChain does ensureChainForm
    // (compile + DROP selection) → deepMergeBinding → ONE updateLayer.
    act(() => {
      editChain(result.current.layersApi, motifOf(result, motifId), (c) =>
        addBlock(c, makeBlock('everyN'))
      );
    });

    const upgraded = motifOf(result, motifId).params.binding;
    // Upgraded to chain-form, and `selection` is DROPPED — the two shapes NEVER
    // coexist (the presence check that defines chain-form stays trustworthy).
    expect(Array.isArray(upgraded.chain)).toBe(true);
    expect(upgraded.selection).toBeUndefined();
    expect(upgraded.chain.some((b) => b.type === 'everyN')).toBe(true);
    // The edit's coalesce window is still OPEN (commits on the undo-flush), so
    // canUndo is not yet true; canRedo is false (nothing undone yet).
    expect(result.current.history.canRedo).toBe(false);

    // ONE ⌘Z restores the ORIGINAL legacy binding byte-identical…
    act(() => result.current.history.undo());
    const reverted = motifOf(result, motifId).params.binding;
    expect(reverted).toEqual(legacyBindingBefore);
    expect(reverted.chain).toBeUndefined();
    expect(reverted.selection).toEqual(LEGACY_BINDING.selection);
    // …and it was EXACTLY one entry (upgrade did not split into >1).
    expect(result.current.history.canUndo).toBe(false);

    // Redo re-applies the upgrade.
    act(() => result.current.history.redo());
    expect(motifOf(result, motifId).params.binding.chain).toBeDefined();
  });

  it('the upgraded chain-form binding persists (serialize→parse→migrateLayer) intact', () => {
    const { result } = renderHook(() => useWired());
    const motif = addLegacyMotif(result);
    const motifId = motif.id;
    act(() => {
      editChain(result.current.layersApi, motifOf(result, motifId), (c) =>
        addBlock(c, makeBlock('everyN'))
      );
    });
    const upgraded = motifOf(result, motifId).params.binding;

    // Simulate the exact save→load transform: JSON round-trip THEN migrateLayer
    // (what loadLayers does). The chain-form binding is byte-identical after.
    const roundTripped = migrateLayer(JSON.parse(JSON.stringify(motifOf(result, motifId))));
    expect(roundTripped.params.binding).toEqual(upgraded);
    expect(roundTripped.params.binding.selection).toBeUndefined();
    expect(roundTripped.params.binding.chain).toEqual(upgraded.chain);
  });
});

// =============================================================================
// #4 — chain edits ride updateLayer/undo (one entry, ⌘Z restores prior binding)
// =============================================================================
describe('D1 #4 — chain edits are one undo entry and ⌘Z restores the prior binding', () => {
  // Build an ALREADY chain-form motif so each edit is a pure chain edit (not the
  // legacy→chain upgrade covered by #3). Fresh renderHook per case so the
  // per-layer `${id}:params` coalesce window never merges two edits (advisor
  // note 3) — each assertion pins EXACTLY one entry.
  const CHAIN_BINDING = {
    chain: [
      { type: 'route', roles: ['edge'], pathScope: 'all' },
      { type: 'everyN', n: 3, offset: 0 },
      { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'leaf' }, { glyphRef: 'dot' }] },
    ],
    placement: { sizing: { size: 20 } },
  };

  const addChainMotif = (result) => seedMotif(result, structuredClone(CHAIN_BINDING));

  it('block REORDER: one entry, ⌘Z restores the prior chain order', () => {
    const { result } = renderHook(() => useWired());
    const motif = addChainMotif(result);
    const id = motif.id;
    const before = structuredClone(motif.params.binding);
    // Swap route(0) and everyN(1) — legal (sequence stays last).
    act(() => {
      editChain(result.current.layersApi, motifOf(result, id), (c) => reorderChain(c, 0, 1));
    });
    const after = motifOf(result, id).params.binding;
    expect(after.chain[0].type).toBe('everyN');
    expect(after.chain[1].type).toBe('route');
    // The edit's coalesce window is still OPEN (commits on the undo-flush), so
    // canUndo is not yet true; canRedo is false (nothing undone yet).
    expect(result.current.history.canRedo).toBe(false);

    act(() => result.current.history.undo());
    expect(motifOf(result, id).params.binding).toEqual(before);
    expect(result.current.history.canUndo).toBe(false); // exactly one entry

    act(() => result.current.history.redo());
    expect(motifOf(result, id).params.binding.chain[0].type).toBe('everyN');
  });

  it('SLOT edit: one entry, ⌘Z restores the prior slots', () => {
    const { result } = renderHook(() => useWired());
    const motif = addChainMotif(result);
    const id = motif.id;
    const before = structuredClone(motif.params.binding);
    // Change slot 1 glyphRef leaf→dot… actually give slot 0 a sizeScale modifier.
    act(() => {
      editChain(result.current.layersApi, motifOf(result, id), (c) =>
        setSlot(c, 2, 0, { sizeScale: 2 })
      );
    });
    const seq = motifOf(result, id).params.binding.chain.find((b) => b.type === 'sequence');
    expect(seq.slots[0].sizeScale).toBe(2);
    // The edit's coalesce window is still OPEN (commits on the undo-flush), so
    // canUndo is not yet true; canRedo is false (nothing undone yet).
    expect(result.current.history.canRedo).toBe(false);

    act(() => result.current.history.undo());
    expect(motifOf(result, id).params.binding).toEqual(before);
    expect(result.current.history.canUndo).toBe(false);
  });

  it('pickedPath TOGGLE: one entry, ⌘Z restores the prior route block', () => {
    const { result } = renderHook(() => useWired());
    const motif = addChainMotif(result);
    const id = motif.id;
    const before = structuredClone(motif.params.binding);
    // Toggle pathIndex 5 into the route block (index 0)'s pickedPaths.
    act(() => {
      editChain(result.current.layersApi, motifOf(result, id), (c) => togglePickedPath(c, 0, 5));
    });
    const route = motifOf(result, id).params.binding.chain[0];
    expect(route.pickedPaths).toContain(5);
    // The edit's coalesce window is still OPEN (commits on the undo-flush), so
    // canUndo is not yet true; canRedo is false (nothing undone yet).
    expect(result.current.history.canRedo).toBe(false);

    act(() => result.current.history.undo());
    expect(motifOf(result, id).params.binding).toEqual(before);
    expect(result.current.history.canUndo).toBe(false);
  });
});
