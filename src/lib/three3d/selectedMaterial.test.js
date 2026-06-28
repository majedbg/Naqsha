import { describe, it, expect } from 'vitest';
import { selectedMaterialForScene } from './selectedMaterial.js';

// The live-prop gate (spec §3.5): the 3D scene receives the user's selected
// material ONLY when the Material lens is active. In the Operation lens — or when
// no material is resolved — it gets null, so Sheets falls back to the substrate's
// intrinsic descriptor (today's behavior). `colorView.material` can be non-null
// while mode==='operation' (setMode is independent of materialId in useColorView),
// so the mode check is load-bearing, not redundant.
describe('selectedMaterialForScene', () => {
  const mat = { id: 'green-fluorescent', name: 'Green Fluorescent', type: 'acrylic', hex: '#E6E954' };

  it('returns the material when the Material lens is active', () => {
    expect(selectedMaterialForScene({ mode: 'material', material: mat })).toBe(mat);
  });

  it('returns null in the Operation lens even with a material resolved', () => {
    expect(selectedMaterialForScene({ mode: 'operation', material: mat })).toBeNull();
  });

  it('returns null in the Material lens when no material is resolved', () => {
    expect(selectedMaterialForScene({ mode: 'material', material: null })).toBeNull();
  });

  it('returns null for missing / malformed lens input', () => {
    expect(selectedMaterialForScene(undefined)).toBeNull();
    expect(selectedMaterialForScene(null)).toBeNull();
    expect(selectedMaterialForScene({})).toBeNull();
  });
});
