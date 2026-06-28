import { describe, it, expect } from 'vitest';
import { resolveSheetMaterial } from './sheetMaterial.js';
import { getArchetypeDefaults } from './materialArchetypes.js';
import { resolveAppearance } from './resolveAppearance.js';

// A resolved appearance for a given archetype, tinted (mimics resolveAppearance:
// registry defaults + a real sheet hex). edgeGain/rimGain are intentionally left in
// so the test proves S4 IGNORES them (they're S5's glow concern, not material).
const appearanceFor = (archetype, tintHex = '#abcdef') => ({
  ...getArchetypeDefaults(archetype),
  tintHex,
});

describe('resolveSheetMaterial — no-material fallback (appearance === null)', () => {
  // The single riskiest review item: material override must NOT change the
  // no-material path. These assert it stays byte-identical to pre-S4 Sheets.
  it('transmissive descriptor → transmission mode, descriptor color, transmission 1', () => {
    const descriptor = { type: 'transmissive', color: '#112233', ior: 1.49, roughness: 0.15 };
    expect(resolveSheetMaterial({ appearance: null, descriptor })).toEqual({
      mode: 'transmission',
      color: '#112233',
      transmission: 1,
      roughness: 0.15,
      metalness: 0,
      ior: 1.49,
      clearcoat: 0,
    });
  });

  it('transmissive descriptor falls back to ior 1.49 / roughness 0.15 when omitted', () => {
    const out = resolveSheetMaterial({ appearance: null, descriptor: { type: 'transmissive', color: '#fff' } });
    expect(out.mode).toBe('transmission');
    expect(out.ior).toBe(1.49);
    expect(out.roughness).toBe(0.15);
    expect(out.transmission).toBe(1);
  });

  it('standard descriptor → standard mode, descriptor color + roughness, metalness 0', () => {
    const descriptor = { type: 'standard', color: '#445566', roughness: 0.9 };
    expect(resolveSheetMaterial({ appearance: null, descriptor })).toEqual({
      mode: 'standard',
      color: '#445566',
      transmission: 0,
      roughness: 0.9,
      metalness: 0,
      ior: 1.49,
      clearcoat: 0,
    });
  });

  it('standard descriptor falls back to roughness 0.8 when omitted', () => {
    const out = resolveSheetMaterial({ appearance: null, descriptor: { type: 'standard', color: '#000' } });
    expect(out.mode).toBe('standard');
    expect(out.roughness).toBe(0.8);
    expect(out.metalness).toBe(0);
  });

  it('defaults to standard fallback for an empty/degenerate argument', () => {
    expect(resolveSheetMaterial().mode).toBe('standard');
    expect(resolveSheetMaterial({}).mode).toBe('standard');
  });
});

describe('resolveSheetMaterial — appearance drives the material (lens active)', () => {
  it('uses the appearance tintHex as the slab color, NOT the descriptor color', () => {
    const out = resolveSheetMaterial({
      appearance: appearanceFor('opaque-acrylic', '#ff0000'),
      descriptor: { type: 'transmissive', color: '#00ff00' },
    });
    expect(out.color).toBe('#ff0000');
  });

  it('see-through acrylic archetypes → transmission mode with the archetype transmission', () => {
    for (const archetype of ['clear-acrylic', 'translucent-acrylic', 'fluorescent-acrylic']) {
      const params = getArchetypeDefaults(archetype);
      const out = resolveSheetMaterial({ appearance: appearanceFor(archetype), descriptor: {} });
      expect(out.mode).toBe('transmission');
      expect(out.transmission).toBe(params.transmission);
      expect(out.transmission).toBeGreaterThan(0);
      expect(out.roughness).toBe(params.roughness);
      expect(out.ior).toBe(params.ior);
    }
  });

  it('opaque-acrylic → standard mode, transmission 0, no metalness/clearcoat', () => {
    const out = resolveSheetMaterial({ appearance: appearanceFor('opaque-acrylic'), descriptor: {} });
    expect(out.mode).toBe('standard');
    expect(out.transmission).toBe(0);
    expect(out.metalness).toBe(0);
    expect(out.clearcoat).toBe(0);
  });

  it('mirror-acrylic → standard mode, full metalness, very low roughness, transmission 0', () => {
    const params = getArchetypeDefaults('mirror-acrylic');
    const out = resolveSheetMaterial({ appearance: appearanceFor('mirror-acrylic'), descriptor: {} });
    expect(out.mode).toBe('standard');
    expect(out.metalness).toBe(params.metalness);
    expect(out.metalness).toBe(1);
    expect(out.roughness).toBe(params.roughness);
    expect(out.transmission).toBe(0);
  });

  it('pearlescent-acrylic (opaque + clearcoat) → physical mode carrying the clearcoat', () => {
    const params = getArchetypeDefaults('pearlescent-acrylic');
    expect(params.clearcoat).toBeGreaterThan(0); // guards the archetype contract
    const out = resolveSheetMaterial({ appearance: appearanceFor('pearlescent-acrylic'), descriptor: {} });
    expect(out.mode).toBe('physical');
    expect(out.clearcoat).toBe(params.clearcoat);
    expect(out.metalness).toBe(params.metalness);
    expect(out.transmission).toBe(0);
  });

  it('wood → plain standard in v1 (procedural grain is S6, no transmission/metalness)', () => {
    const params = getArchetypeDefaults('wood');
    const out = resolveSheetMaterial({ appearance: appearanceFor('wood'), descriptor: {} });
    expect(out.mode).toBe('standard');
    expect(out.transmission).toBe(0);
    expect(out.metalness).toBe(0);
    expect(out.roughness).toBe(params.roughness);
  });

  it('opaque-tinted safe default → standard mode', () => {
    const out = resolveSheetMaterial({ appearance: appearanceFor('opaque-tinted'), descriptor: {} });
    expect(out.mode).toBe('standard');
    expect(out.transmission).toBe(0);
  });

  it('ignores edgeGain/rimGain (S5 glow concern, not a material channel)', () => {
    const out = resolveSheetMaterial({ appearance: appearanceFor('fluorescent-acrylic'), descriptor: {} });
    expect(out).not.toHaveProperty('edgeGain');
    expect(out).not.toHaveProperty('rimGain');
  });

  it('end-to-end via resolveAppearance: an opaque-named material renders opaque even on an acrylic slab', () => {
    // "Black Opaque" is an acrylic in the corpus, but the resolved opaque-acrylic
    // appearance must win over the transmissive substrate descriptor.
    const appearance = resolveAppearance({ name: 'Black Opaque', type: 'acrylic' });
    const out = resolveSheetMaterial({
      appearance,
      descriptor: { type: 'transmissive', color: '#cccccc' },
    });
    expect(out.mode).toBe('standard');
    expect(out.transmission).toBe(0);
    expect(out.color).toBe(appearance.tintHex);
  });
});
