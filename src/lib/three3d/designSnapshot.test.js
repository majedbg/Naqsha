import { describe, it, expect } from 'vitest';
import { buildDesignSnapshot } from './designSnapshot.js';

// buildDesignSnapshot (S3, PRD D14) — pure capture of the CURRENT design into a
// frozen, detached snapshot the 3D scene reads from. The scene is NOT
// live-reactive (D14): it only ever rebuilds from a snapshot, never from live
// edits. These are the primary unit gate for the snapshot half of S3.

const DESIGN = () => ({
  layers: [
    { id: 'l1', operationId: 'op-cut', panelId: 'p1', params: { x: 1, y: 2 } },
    { id: 'l2', operationId: 'op-engrave', panelId: 'p1', params: { x: 3 } },
  ],
  panels: [{ id: 'p1', order: 0, substrate: { kind: 'acrylic', thickness: 3 } }],
  operations: [{ id: 'op-cut', process: 'cut' }],
  machineProfile: 'laser',
});

describe('buildDesignSnapshot', () => {
  it('captures the listed design inputs', () => {
    const snap = buildDesignSnapshot(DESIGN());
    expect(snap.layers).toHaveLength(2);
    expect(snap.panels).toHaveLength(1);
    expect(snap.operations).toEqual([{ id: 'op-cut', process: 'cut' }]);
    expect(snap.machineProfile).toBe('laser');
  });

  it('deep-clones — mutating the SOURCE after capture never touches the snapshot', () => {
    const source = DESIGN();
    const snap = buildDesignSnapshot(source);
    source.layers[0].params.x = 999;
    source.layers.push({ id: 'l3' });
    source.panels[0].substrate.thickness = 99;
    expect(snap.layers[0].params.x).toBe(1);
    expect(snap.layers).toHaveLength(2);
    expect(snap.panels[0].substrate.thickness).toBe(3);
  });

  it('deep-freezes the snapshot (nested mutation throws in strict mode)', () => {
    const snap = buildDesignSnapshot(DESIGN());
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.layers)).toBe(true);
    expect(Object.isFrozen(snap.layers[0])).toBe(true);
    expect(Object.isFrozen(snap.layers[0].params)).toBe(true);
    expect(() => {
      snap.layers[0].params.x = 5;
    }).toThrow();
    expect(() => {
      snap.layers.push({ id: 'x' });
    }).toThrow();
  });

  it('defaults missing inputs to empty collections / null profile', () => {
    const snap = buildDesignSnapshot();
    expect(snap.layers).toEqual([]);
    expect(snap.panels).toEqual([]);
    expect(snap.operations).toEqual([]);
    expect(snap.machineProfile).toBe(null);
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('is pure — repeated calls on equal input produce structurally equal snapshots', () => {
    expect(buildDesignSnapshot(DESIGN())).toEqual(buildDesignSnapshot(DESIGN()));
  });
});
