import { describe, it, expect } from 'vitest';
import { deriveActiveLens } from './lensSelection.js';

// deriveActiveLens (S3, PRD D1/D2) — pure derivation of the single "active lens"
// for the canvas lens toggle from the two independent sources of truth:
// colorView.mode (operation|material) and the 3D sub-mode. Surface A
// (panel-stack) is the always-on lens PEER of Operation/Material; Surface B
// (height-surface) is NOT in the toggle (D2), so it does not claim the lens.
//
// Active lens is DERIVED, never stored — so closing 3D (sub-mode → 'off')
// restores the prior 2D lens BY CONSTRUCTION (colorView was never mutated).

describe('deriveActiveLens', () => {
  it('reflects the 2D lens when no 3D sub-mode is active', () => {
    expect(deriveActiveLens('operation', 'off')).toBe('operation');
    expect(deriveActiveLens('material', 'off')).toBe('material');
  });

  it('is "3d" exactly when Surface A (panel-stack) is active', () => {
    expect(deriveActiveLens('operation', 'panel-stack')).toBe('3d');
    expect(deriveActiveLens('material', 'panel-stack')).toBe('3d');
  });

  it('does NOT claim the lens for Surface B (height-surface) — toggle shows the 2D lens', () => {
    expect(deriveActiveLens('operation', 'height-surface')).toBe('operation');
    expect(deriveActiveLens('material', 'height-surface')).toBe('material');
  });

  it('round-trips: the 2D lens is preserved across a panel-stack enter→exit', () => {
    const prior = 'material';
    expect(deriveActiveLens(prior, 'off')).toBe('material'); // before
    expect(deriveActiveLens(prior, 'panel-stack')).toBe('3d'); // during
    expect(deriveActiveLens(prior, 'off')).toBe('material'); // after — exact restore
  });
});
