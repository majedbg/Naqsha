// Unit tests for the versioned migration shim (issue #1, A3).
// Legacy `role` → seeded operation, `outputMode` → machine profile.

import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION, migrateConfig, migrateLayer } from './migration.js';
import { resolveLayerColor, resolveLayerProcess } from './operations.js';
import bloom from '../examples/bloom.json';
import orbit from '../examples/orbit.json';
import drift from '../examples/drift.json';

describe('migrateConfig — legacy role → operation', () => {
  it('maps {role:"cut"} → seeded Cut operation (#FF0000)', () => {
    const out = migrateConfig({ layers: [{ id: 'a', color: '#123', role: 'cut' }] });
    const layer = out.layers[0];
    expect(resolveLayerProcess(layer, out.operations)).toBe('cut');
    expect(resolveLayerColor(layer, out.operations)).toBe('#FF0000');
  });

  it('maps role:"score" → Score (#0000FF)', () => {
    const out = migrateConfig({ layers: [{ id: 'a', role: 'score' }] });
    expect(resolveLayerProcess(out.layers[0], out.operations)).toBe('score');
    expect(resolveLayerColor(out.layers[0], out.operations)).toBe('#0000FF');
  });

  it('maps role:"engrave" → Engrave (#000000)', () => {
    const out = migrateConfig({ layers: [{ id: 'a', role: 'engrave' }] });
    expect(resolveLayerProcess(out.layers[0], out.operations)).toBe('engrave');
    expect(resolveLayerColor(out.layers[0], out.operations)).toBe('#000000');
  });

  it('defaults a layer with no role to Cut', () => {
    const out = migrateConfig({ layers: [{ id: 'a' }] });
    expect(resolveLayerProcess(out.layers[0], out.operations)).toBe('cut');
  });

  it('maps legacy outputMode → machine profile', () => {
    expect(migrateConfig({ layers: [], outputMode: 'laser' }).machineProfile).toBe('laser');
    expect(migrateConfig({ layers: [], outputMode: 'plotter' }).machineProfile).toBe('plotter');
    // version-less / absent outputMode defaults to plotter
    expect(migrateConfig({ layers: [] }).machineProfile).toBe('plotter');
  });
});

describe('migrateConfig — versioning', () => {
  it('stamps the current schema version on the migrated config', () => {
    const out = migrateConfig({ layers: [{ id: 'a', role: 'cut' }] });
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(Array.isArray(out.operations)).toBe(true);
    expect(out.operations).toHaveLength(3);
  });

  it('is idempotent — re-migrating an already-current config is a no-op on intent', () => {
    const once = migrateConfig({ layers: [{ id: 'a', role: 'score' }] });
    const twice = migrateConfig(once);
    expect(twice.schemaVersion).toBe(SCHEMA_VERSION);
    expect(twice.operations).toEqual(once.operations);
    expect(resolveLayerColor(twice.layers[0], twice.operations)).toBe('#0000FF');
  });

  it('treats a version-less document as legacy and migrates it', () => {
    const out = migrateConfig({ layers: [{ id: 'a', role: 'engrave' }] });
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.layers[0].operationId).toBeTruthy();
  });

  it('tolerates null/empty input without throwing', () => {
    expect(() => migrateConfig(null)).not.toThrow();
    expect(() => migrateConfig({})).not.toThrow();
    expect(migrateConfig(null).operations).toHaveLength(3);
  });
});

describe('bundled examples resolve valid operations', () => {
  for (const [name, ex] of [['bloom', bloom], ['orbit', orbit], ['drift', drift]]) {
    it(`${name}.json resolves every layer to a valid operation`, () => {
      const cfg = migrateConfig(ex.config);
      expect(cfg.operations.length).toBeGreaterThan(0);
      for (const layer of cfg.layers) {
        const proc = resolveLayerProcess(layer, cfg.operations);
        expect(['cut', 'score', 'engrave', 'pen']).toContain(proc);
        expect(typeof resolveLayerColor(layer, cfg.operations)).toBe('string');
      }
    });
  }
});

// =============================================================================
// SCHEMA_VERSION 1 → 2 — the version-gated footprint pin (PRD #197, decision 3)
// =============================================================================
//
// Saved work predates the per-glyph footprint, so a layer arriving at v ≤ 1 is
// PINNED to the root-centred reserve it was authored against. Nothing reads
// `sizing.footprint` yet — this slice is deliberately inert.

// The fixed placement tail as starterChips.js:54-58 writes it, minus the new key.
const placementTail = (sizing) => ({
  sizing,
  orientation: { policy: 'path', useNormal: true },
  flip: false,
});

const motifLayerAt = (placement) => ({
  id: 'layer-7-motif',
  name: 'Motif',
  type: 'motif',
  patternType: 'motif',
  operationId: 'op-cut',
  params: { glyphRef: 'leaf', hostLayerId: 'layer-0-host', binding: { chain: [], placement } },
});

const SIZING = { mode: 'proportional', size: 18, min: 3, margin: 0.85 };

describe('migrateConfig — the version-gated footprint pin (decision 3)', () => {
  it('SCHEMA_VERSION is 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
  });

  it('a v1 config pins its motif layer to sizing.footprint === "root"', () => {
    const out = migrateConfig({ schemaVersion: 1, layers: [motifLayerAt(placementTail(SIZING))] });
    expect(out.layers[0].params.binding.placement.sizing.footprint).toBe('root');
    // The pin is the ONLY thing that moved in the sizing block.
    expect(out.layers[0].params.binding.placement.sizing).toEqual({ ...SIZING, footprint: 'root' });
  });

  it('a version-LESS config is treated as legacy and pinned (migration.js:12-13 policy)', () => {
    const out = migrateConfig({ layers: [motifLayerAt(placementTail(SIZING))] });
    expect(out.layers[0].params.binding.placement.sizing.footprint).toBe('root');
  });

  it('a config already at v2 is NOT stamped', () => {
    const out = migrateConfig({
      schemaVersion: 2,
      operations: [{ id: 'op-cut', name: 'Cut', color: '#FF0000', process: 'cut', machineParams: {}, order: 0 }],
      layers: [motifLayerAt(placementTail(SIZING))],
    });
    expect(out.layers[0].params.binding.placement.sizing.footprint).toBeUndefined();
  });

  it('never overwrites an existing footprint — a layer already at "tight" stays "tight"', () => {
    const out = migrateConfig({
      schemaVersion: 1,
      layers: [motifLayerAt(placementTail({ ...SIZING, footprint: 'tight' }))],
    });
    expect(out.layers[0].params.binding.placement.sizing.footprint).toBe('tight');
  });

  it('is idempotent — a second pass is deep-equal, and re-pinning is reference-identical', () => {
    const once = migrateConfig({ schemaVersion: 1, layers: [motifLayerAt(placementTail(SIZING))] });
    const twice = migrateConfig(once);
    expect(twice).toEqual(once);
    // The second pass sees v2 AND an existing pin: it must not rebuild the spine.
    expect(twice.layers[0].params).toBe(once.layers[0].params);
  });

  it('is a no-op on a NON-motif layer, even one carrying the same placement tail', () => {
    const plain = {
      id: 'layer-1-grid',
      type: 'grid',
      patternType: 'grid',
      operationId: 'op-cut',
      params: { binding: { placement: placementTail(SIZING) } },
    };
    const out = migrateConfig({ schemaVersion: 1, layers: [plain] });
    expect(out.layers[0].params.binding.placement.sizing.footprint).toBeUndefined();
    expect(out.layers[0].params).toBe(plain.params);
  });

  it('NEVER creates params.binding.placement.sizing where it did not exist', () => {
    const bare = { id: 'layer-2-motif', type: 'motif', patternType: 'motif', operationId: 'op-cut', params: {} };
    const emptyPlacement = motifLayerAt({});
    const noBinding = { id: 'layer-4-motif', type: 'motif', operationId: 'op-cut', params: { glyphRef: 'dot' } };
    const out = migrateConfig({ schemaVersion: 1, layers: [bare, emptyPlacement, noBinding] });
    expect(out.layers[0].params).toEqual({});
    expect(out.layers[1].params.binding.placement).toEqual({});
    expect(out.layers[2].params).toEqual({ glyphRef: 'dot' });
    // Reference identity is the strongest statement of "did not touch it".
    expect(out.layers[0].params).toBe(bare.params);
    expect(out.layers[1].params).toBe(emptyPlacement.params);
    expect(out.layers[2].params).toBe(noBinding.params);
  });

  it('rebuilds ONLY the params→binding→placement→sizing spine (siblings keep their refs)', () => {
    const chain = [{ type: 'route', roles: ['edge'] }];
    const overrides = { exclude: [{ id: 'a1' }] };
    const orientation = { policy: 'path', useNormal: true };
    const layer = {
      id: 'layer-5-motif',
      type: 'motif',
      operationId: 'op-cut',
      params: { glyphRef: 'leaf', binding: { chain, overrides, placement: { sizing: SIZING, orientation } } },
    };
    const out = migrateConfig({ schemaVersion: 1, layers: [layer] });
    const b = out.layers[0].params.binding;
    expect(b.chain).toBe(chain);
    expect(b.overrides).toBe(overrides);
    expect(b.placement.orientation).toBe(orientation);
    expect(out.layers[0].params.glyphRef).toBe('leaf');
  });

  it('tolerates a null / non-object sizing without throwing or stamping', () => {
    const out = migrateConfig({
      schemaVersion: 1,
      layers: [motifLayerAt({ sizing: null }), motifLayerAt({ sizing: 'proportional' })],
    });
    expect(out.layers[0].params.binding.placement.sizing).toBeNull();
    expect(out.layers[1].params.binding.placement.sizing).toBe('proportional');
  });
});

describe('migrateLayer — the version argument', () => {
  it('pins when the version is absent (the three bare useLayers.js call sites)', () => {
    const out = migrateLayer(motifLayerAt(placementTail(SIZING)));
    expect(out.params.binding.placement.sizing.footprint).toBe('root');
  });

  it('pins at v1 and leaves v2 alone', () => {
    const at1 = migrateLayer(motifLayerAt(placementTail(SIZING)), undefined, 1);
    const at2 = migrateLayer(motifLayerAt(placementTail(SIZING)), undefined, 2);
    expect(at1.params.binding.placement.sizing.footprint).toBe('root');
    expect(at2.params.binding.placement.sizing.footprint).toBeUndefined();
  });

  it('still returns null untouched', () => {
    expect(migrateLayer(null, undefined, 1)).toBe(null);
  });
});

// The bump must not cost a v1 document its saved operations or machineProfile.
// `alreadyCurrent` used to mean `schemaVersion === SCHEMA_VERSION`, so raising
// SCHEMA_VERSION would silently re-seed operations and recompute machineProfile
// from the legacy `outputMode` — and NO legacy outputMode maps to 'dragCutter',
// so a drag-cutter document would come back a plotter. That is exactly the
// reset-to-default this file's header (`:12-14`) forbids.
describe('migrateConfig — the bump does not reset a v1 document to defaults', () => {
  const customOps = [
    { id: 'op-mine', name: 'My Cut', color: '#00FF00', process: 'cut', machineParams: { speed: 42 }, order: 0 },
  ];

  it('a v1 config keeps its saved machineProfile (dragCutter has no outputMode to recover it from)', () => {
    const out = migrateConfig({ schemaVersion: 1, operations: customOps, machineProfile: 'dragCutter', layers: [] });
    expect(out.machineProfile).toBe('dragCutter');
  });

  it('a v1 config keeps its saved operations list rather than being re-seeded', () => {
    const out = migrateConfig({ schemaVersion: 1, operations: customOps, machineProfile: 'plotter', layers: [] });
    expect(out.operations).toBe(customOps);
  });
});
