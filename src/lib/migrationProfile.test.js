// Issue #3 (A2/A3) migration assertions: the migrated config's `machineProfile`
// is backed by a real machine-profile model, and raw `outputMode` is dropped
// from the new-path model. (Complements migration.test.js from #1, which is
// left untouched.)

import { describe, it, expect } from 'vitest';
import { migrateConfig } from './migration.js';
import { getProfile, MACHINE_PROFILES } from './machineProfiles.js';

describe('migrateConfig — machineProfile is a real profile id', () => {
  it("maps legacy outputMode 'laser' → the Laser profile", () => {
    const out = migrateConfig({ layers: [], outputMode: 'laser' });
    expect(out.machineProfile).toBe('laser');
    expect(getProfile(out.machineProfile)).toBe(MACHINE_PROFILES.laser);
    expect(getProfile(out.machineProfile).label).toBe('Laser');
  });

  it("maps legacy outputMode 'plotter' → the Pen Plotter profile", () => {
    const out = migrateConfig({ layers: [], outputMode: 'plotter' });
    expect(out.machineProfile).toBe('plotter');
    expect(getProfile(out.machineProfile).label).toBe('Pen Plotter');
  });

  it('preserves an already-current dragCutter profile', () => {
    const out = migrateConfig({
      schemaVersion: 1,
      operations: [{ id: 'x', name: 'Cut', color: '#000', process: 'cut', machineParams: {}, order: 0 }],
      machineProfile: 'dragCutter',
      layers: [],
    });
    expect(out.machineProfile).toBe('dragCutter');
  });

  it('drops raw outputMode from the migrated (new-path) model', () => {
    const out = migrateConfig({ layers: [], outputMode: 'laser' });
    expect(out.outputMode).toBeUndefined();
  });
});
