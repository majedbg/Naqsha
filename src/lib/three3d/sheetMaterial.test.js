import { describe, it, expect } from 'vitest';
import { resolveSheetMaterial } from './sheetMaterial.js';
import { getArchetypeDefaults, substrateOptics } from './materialArchetypes.js';
import { resolveAppearance } from './resolveAppearance.js';

// A resolved appearance for a given archetype, tinted (mimics resolveAppearance:
// registry defaults + a real sheet hex). edgeGain is intentionally left in so the
// test proves S4 IGNORES it (it's the edge-face concern, not the face material).
const appearanceFor = (archetype, tintHex = '#abcdef') => ({
  ...getArchetypeDefaults(archetype),
  tintHex,
});

describe('resolveSheetMaterial — no-material fallback (appearance === null)', () => {
  // ADR 0003: the descriptor supplies IDENTITY (type/kind/color); the OPTICS come
  // from the archetypes' substrate fallback — asserted against that same source so
  // an archetype retune can never silently diverge from the fallback path.
  it('transmissive acrylic descriptor → transmission mode with clear-PMMA archetype optics', () => {
    const descriptor = { type: 'transmissive', kind: 'acrylic', color: '#112233' };
    const optics = substrateOptics('acrylic');
    expect(resolveSheetMaterial({ appearance: null, descriptor })).toEqual({
      mode: 'transmission',
      color: '#112233',
      transmission: optics.transmission,
      roughness: optics.roughness,
      metalness: 0,
      ior: optics.ior,
      clearcoat: 0,
    });
  });

  it('a kind-less transmissive descriptor still reads as acrylic (never opaque optics)', () => {
    const out = resolveSheetMaterial({ appearance: null, descriptor: { type: 'transmissive', color: '#fff' } });
    expect(out.mode).toBe('transmission');
    expect(out.ior).toBeCloseTo(1.49, 2);
    expect(out.transmission).toBe(substrateOptics('acrylic').transmission);
    expect(out.transmission).toBeGreaterThan(0.9);
  });

  it('standard descriptor → standard mode, descriptor color, per-kind archetype roughness', () => {
    const descriptor = { type: 'standard', kind: 'mdf', color: '#445566' };
    expect(resolveSheetMaterial({ appearance: null, descriptor })).toEqual({
      mode: 'standard',
      color: '#445566',
      transmission: 0,
      roughness: substrateOptics('mdf').roughness,
      metalness: 0,
      ior: substrateOptics('mdf').ior,
      clearcoat: 0,
    });
  });

  it('an unknown/kind-less standard descriptor gets the neutral fallback roughness', () => {
    const out = resolveSheetMaterial({ appearance: null, descriptor: { type: 'standard', color: '#000' } });
    expect(out.mode).toBe('standard');
    expect(out.roughness).toBe(substrateOptics(undefined).roughness);
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

  it('ignores edgeGain (the edge-face concern, not a face-material channel)', () => {
    const out = resolveSheetMaterial({ appearance: appearanceFor('fluorescent-acrylic'), descriptor: {} });
    expect(out).not.toHaveProperty('edgeGain');
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
