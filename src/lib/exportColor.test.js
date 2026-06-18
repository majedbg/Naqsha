// Export-color resolution + legacy equivalence (issue #1, A4).
// The equivalence guarantees are asserted against the KNOWN role→color
// constants as LITERALS — Cut #FF0000, Score #0000FF, Engrave #000000 —
// NOT against any snapshot captured after the change.

import { describe, it, expect } from 'vitest';
import { resolveExportColor } from './fabrication.js';
import { seedOperations } from './operations.js';
import { migrateConfig } from './migration.js';
import bloom from '../examples/bloom.json';
import orbit from '../examples/orbit.json';
import drift from '../examples/drift.json';

describe('resolveExportColor — operation-library lookup', () => {
  it('emits the operation color for an assigned layer (laser profile)', () => {
    const ops = seedOperations();
    const cutId = ops.find((o) => o.process === 'cut').id;
    const scoreId = ops.find((o) => o.process === 'score').id;
    expect(resolveExportColor({ operationId: cutId, color: '#abc' }, { operations: ops, outputMode: 'laser' })).toBe('#FF0000');
    expect(resolveExportColor({ operationId: scoreId, color: '#abc' }, { operations: ops, outputMode: 'laser' })).toBe('#0000FF');
  });

  it('falls back safely to #000000 when operationId is missing (laser)', () => {
    const ops = seedOperations();
    expect(resolveExportColor({ color: '#abc' }, { operations: ops, outputMode: 'laser' })).toBe('#000000');
    expect(resolveExportColor({ operationId: 'gone', color: '#abc' }, { operations: ops, outputMode: 'laser' })).toBe('#000000');
  });

  it('preserves the layer color in plotter profile (no override)', () => {
    const ops = seedOperations();
    const cutId = ops.find((o) => o.process === 'cut').id;
    expect(resolveExportColor({ operationId: cutId, color: '#f7dc6f' }, { operations: ops, outputMode: 'plotter' })).toBe('#f7dc6f');
  });
});

describe('legacy equivalence — outputMode export still produces the same colors', () => {
  // Reproduces what applyOutputMode(layer, outputMode) produced before A4:
  //   laser  → role-convention color; plotter → layer.color unchanged.
  for (const [role, expected] of [['cut', '#FF0000'], ['score', '#0000FF'], ['engrave', '#000000']]) {
    it(`migrated {role:"${role}"} exports ${expected} under laser`, () => {
      const cfg = migrateConfig({ layers: [{ id: 'a', color: '#cccccc', role }], outputMode: 'laser' });
      expect(resolveExportColor(cfg.layers[0], { operations: cfg.operations, outputMode: 'laser' })).toBe(expected);
    });
  }

  it('plotter export of a migrated layer keeps its original color', () => {
    const cfg = migrateConfig({ layers: [{ id: 'a', color: '#f7dc6f', role: 'cut' }], outputMode: 'plotter' });
    expect(resolveExportColor(cfg.layers[0], { operations: cfg.operations, outputMode: 'plotter' })).toBe('#f7dc6f');
  });
});

describe('snapshot equivalence — re-exporting legacy examples yields the same colors', () => {
  // Examples export under the default 'plotter' profile today → layer.color.
  // After migration the exported color must be identical to the legacy color.
  for (const [name, ex] of [['bloom', bloom], ['orbit', orbit], ['drift', drift]]) {
    it(`${name}: plotter export color == legacy layer.color`, () => {
      const legacyColors = ex.config.layers.map((l) => l.color);
      const cfg = migrateConfig(ex.config);
      const exported = cfg.layers.map((l) =>
        resolveExportColor(l, { operations: cfg.operations, outputMode: 'plotter' })
      );
      expect(exported).toEqual(legacyColors);
    });

    it(`${name}: laser export color == legacy role-convention color`, () => {
      const roleColorMap = { cut: '#FF0000', score: '#0000FF', engrave: '#000000' };
      const legacyLaserColors = ex.config.layers.map((l) => roleColorMap[l.role ?? 'cut']);
      const cfg = migrateConfig(ex.config);
      const exported = cfg.layers.map((l) =>
        resolveExportColor(l, { operations: cfg.operations, outputMode: 'laser' })
      );
      expect(exported).toEqual(legacyLaserColors);
    });
  }
});
