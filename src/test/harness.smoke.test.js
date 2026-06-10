import { describe, it, expect } from 'vitest';
import { unitToPx, pxToUnit, PX_PER_MM } from '../lib/units';

// Tracer test (AR-P0): proves the node test environment runs and resolves app
// modules. It pins a known unit conversion rather than asserting a tautology, so
// it doubles as the first real characterization of units.js.
describe('test harness (node)', () => {
  it('converts one inch to 96 px at 96 PPI', () => {
    expect(unitToPx(1, 'in')).toBe(96);
  });

  it('round-trips mm through px without drift', () => {
    expect(pxToUnit(unitToPx(50, 'mm'), 'mm')).toBeCloseTo(50, 10);
  });

  it('derives PX_PER_MM from the 25.4 mm-per-inch constant', () => {
    expect(PX_PER_MM).toBeCloseTo(96 / 25.4, 10);
  });
});
