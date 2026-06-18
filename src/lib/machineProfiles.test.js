// Unit tests for the document-level machine-profile model (issue #3, A2).
//
// Three profiles — Laser / Pen Plotter / Drag Cutter — each declaring its
// process set, per-process machineParams schema, and a default bed size.
// Switching a document's profile re-maps the operation library to that
// machine's process/param vocabulary without losing operation names/order.

import { describe, it, expect } from 'vitest';
import {
  MACHINE_PROFILES,
  PROFILE_IDS,
  getProfile,
  profileProcesses,
  paramSchemaFor,
  defaultMachineParams,
  defaultBedSize,
  remapOperationsToProfile,
} from './machineProfiles.js';
import { createOperation } from './operations.js';

describe('profile catalogue', () => {
  it('exposes exactly three profiles keyed by lowercase ids', () => {
    expect(PROFILE_IDS).toEqual(['laser', 'plotter', 'dragCutter']);
    for (const id of PROFILE_IDS) {
      expect(MACHINE_PROFILES[id]).toBeTruthy();
      expect(MACHINE_PROFILES[id].id).toBe(id);
    }
  });

  it('keeps migration ids (laser/plotter) so migrateConfig.machineProfile resolves', () => {
    // migration.js emits 'laser' / 'plotter' — those must be real profile ids.
    expect(getProfile('laser')).toBeTruthy();
    expect(getProfile('plotter')).toBeTruthy();
  });

  it('gives each profile a human label', () => {
    expect(getProfile('laser').label).toBe('Laser');
    expect(getProfile('plotter').label).toBe('Pen Plotter');
    expect(getProfile('dragCutter').label).toBe('Drag Cutter');
  });

  it('falls back to the laser profile default for unknown ids', () => {
    expect(getProfile('nope')).toBe(MACHINE_PROFILES.laser);
    expect(getProfile()).toBe(MACHINE_PROFILES.laser);
  });
});

describe('process sets per profile', () => {
  it('laser → cut / score / engrave', () => {
    expect(profileProcesses('laser')).toEqual(['cut', 'score', 'engrave']);
  });

  it('plotter → pen only', () => {
    expect(profileProcesses('plotter')).toEqual(['pen']);
  });

  it('drag cutter → cut (blade) only', () => {
    expect(profileProcesses('dragCutter')).toEqual(['cut']);
  });
});

describe('machineParams schema per process', () => {
  it('laser cut/score/engrave expose power / speed / passes', () => {
    for (const proc of ['cut', 'score', 'engrave']) {
      const fields = paramSchemaFor('laser', proc).map((f) => f.key);
      expect(fields).toEqual(['power', 'speed', 'passes']);
    }
  });

  it('plotter pen exposes penSlot / pressure', () => {
    const fields = paramSchemaFor('plotter', 'pen').map((f) => f.key);
    expect(fields).toEqual(['penSlot', 'pressure']);
  });

  it('drag cutter cut exposes force / blade / passes', () => {
    const fields = paramSchemaFor('dragCutter', 'cut').map((f) => f.key);
    expect(fields).toEqual(['force', 'blade', 'passes']);
  });

  it('defaultMachineParams builds an object from the schema defaults', () => {
    const p = defaultMachineParams('laser', 'cut');
    expect(Object.keys(p)).toEqual(['power', 'speed', 'passes']);
    for (const v of Object.values(p)) expect(typeof v).toBe('number');
  });

  it('returns an empty schema for a process the profile does not support', () => {
    expect(paramSchemaFor('plotter', 'cut')).toEqual([]);
    expect(defaultMachineParams('plotter', 'cut')).toEqual({});
  });
});

describe('default bed size per profile', () => {
  it('each profile supplies a positive width/height bed (mm)', () => {
    for (const id of PROFILE_IDS) {
      const bed = defaultBedSize(id);
      expect(bed.width).toBeGreaterThan(0);
      expect(bed.height).toBeGreaterThan(0);
      expect(bed.unit).toBe('mm');
    }
  });

  it('switching profile yields a different default bed (laser vs plotter)', () => {
    const laser = defaultBedSize('laser');
    const plotter = defaultBedSize('plotter');
    expect(laser).not.toEqual(plotter);
  });
});

describe('color lock policy', () => {
  it('laser colors are locked to convention', () => {
    expect(getProfile('laser').colorsLocked).toBe(true);
  });

  it('plotter & drag-cutter colors are editable', () => {
    expect(getProfile('plotter').colorsLocked).toBe(false);
    expect(getProfile('dragCutter').colorsLocked).toBe(false);
  });
});

describe('remapOperationsToProfile — switching re-maps the library', () => {
  const laserOps = [
    createOperation({ id: 'a', name: 'Outline', color: '#FF0000', process: 'cut', order: 0 }),
    createOperation({ id: 'b', name: 'Fold', color: '#0000FF', process: 'score', order: 1 }),
    createOperation({ id: 'c', name: 'Label', color: '#000000', process: 'engrave', order: 2 }),
  ];

  it('preserves operation names and order when switching laser → plotter', () => {
    const out = remapOperationsToProfile(laserOps, 'plotter');
    expect(out.map((o) => o.name)).toEqual(['Outline', 'Fold', 'Label']);
    expect(out.map((o) => o.order)).toEqual([0, 1, 2]);
  });

  it('remaps every process to the target profile vocabulary', () => {
    const out = remapOperationsToProfile(laserOps, 'plotter');
    for (const op of out) expect(op.process).toBe('pen');
  });

  it('remaps params to the target schema (laser power/speed/passes → plotter penSlot/pressure)', () => {
    const out = remapOperationsToProfile(laserOps, 'plotter');
    expect(Object.keys(out[0].machineParams)).toEqual(['penSlot', 'pressure']);
  });

  it('keeps a compatible process unchanged (drag cutter cut stays cut)', () => {
    const out = remapOperationsToProfile(laserOps, 'dragCutter');
    // 'cut' is supported by dragCutter → op a keeps process 'cut'.
    expect(out[0].process).toBe('cut');
    // score/engrave are not supported → fall back to the profile's first process.
    expect(out[1].process).toBe('cut');
    expect(out[2].process).toBe('cut');
    expect(Object.keys(out[0].machineParams)).toEqual(['force', 'blade', 'passes']);
  });

  it('locks laser colors to convention when switching to laser', () => {
    const plotterOps = [
      createOperation({ id: 'a', name: 'Outline', color: '#00ff00', process: 'pen', order: 0 }),
    ];
    const out = remapOperationsToProfile(plotterOps, 'laser');
    // pen has no laser equivalent → first laser process = cut → locked red.
    expect(out[0].process).toBe('cut');
    expect(out[0].color).toBe('#FF0000');
  });

  it('leaves plotter/drag colors editable (does not force a convention color)', () => {
    const plotterOps = [
      createOperation({ id: 'a', name: 'Pen', color: '#123456', process: 'pen', order: 0 }),
    ];
    const out = remapOperationsToProfile(plotterOps, 'dragCutter');
    expect(out[0].color).toBe('#123456');
  });

  it('tolerates an empty / null operation list', () => {
    expect(remapOperationsToProfile([], 'plotter')).toEqual([]);
    expect(remapOperationsToProfile(null, 'plotter')).toEqual([]);
  });
});
