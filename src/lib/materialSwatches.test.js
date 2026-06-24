// Contract tests for the acrylic swatch-photo catalog used by the Material lens.

import { describe, it, expect } from 'vitest';
import { MATERIAL_SWATCHES } from './materialSwatches.js';

describe('MATERIAL_SWATCHES', () => {
  it('exposes the seven acrylic swatches', () => {
    expect(MATERIAL_SWATCHES).toHaveLength(7);
  });

  it('has the expected stable ids in display order', () => {
    expect(MATERIAL_SWATCHES.map((m) => m.id)).toEqual([
      'clear',
      'green-fluorescent',
      'turquoise-opaque',
      'blue-translucent',
      'aura-iridescent',
      'gold-mirror',
      'gotham-black-pearl',
    ]);
  });

  it('each swatch has id, name, color and a resolved image url', () => {
    for (const m of MATERIAL_SWATCHES) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(m.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(m.image).toBeTruthy();
    }
  });
});
