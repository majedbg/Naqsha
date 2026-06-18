// Unit tests for the versioned migration shim (issue #1, A3).
// Legacy `role` → seeded operation, `outputMode` → machine profile.

import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION, migrateConfig } from './migration.js';
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
