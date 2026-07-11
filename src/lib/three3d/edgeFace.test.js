import { describe, it, expect } from 'vitest';
import { resolveEdgeFace, EDGE_GREEN } from './edgeFace.js';
import { getArchetypeDefaults } from './materialArchetypes.js';
import { luminance } from '../materialReaction.js';

// Channel readers for hue assertions.
const R = (hex) => parseInt(hex.replace(/^#/, '').slice(0, 2), 16);
const G = (hex) => parseInt(hex.replace(/^#/, '').slice(2, 4), 16);
const B = (hex) => parseInt(hex.replace(/^#/, '').slice(4, 6), 16);

const appearanceFor = (archetype, tintHex) => ({
  ...getArchetypeDefaults(archetype),
  ...(tintHex ? { tintHex } : {}),
});

describe('resolveEdgeFace — which slabs get a distinct edge material', () => {
  it('is distinct for the transmissive acrylic family (clear/translucent/fluorescent)', () => {
    for (const a of ['clear-acrylic', 'translucent-acrylic', 'fluorescent-acrylic']) {
      expect(resolveEdgeFace({ appearance: appearanceFor(a) }).distinct).toBe(true);
    }
  });

  it('is NOT distinct for opaque archetypes — their sides share the face material', () => {
    for (const a of ['opaque-acrylic', 'mirror-acrylic', 'pearlescent-acrylic', 'wood', 'opaque-tinted']) {
      expect(resolveEdgeFace({ appearance: appearanceFor(a) }).distinct).toBe(false);
    }
  });

  it('follows the descriptor type on the no-material-lens path', () => {
    expect(resolveEdgeFace({ descriptor: { type: 'transmissive', kind: 'acrylic', color: '#cccccc' } }).distinct).toBe(true);
    expect(resolveEdgeFace({ descriptor: { type: 'standard', kind: 'plywood', color: '#6b4a2b' } }).distinct).toBe(false);
    expect(resolveEdgeFace().distinct).toBe(false);
  });
});

describe('resolveEdgeFace — edge tint (ADR 0003 #6)', () => {
  it('colorless PMMA edges are brighter than a mid tint and carry the faint GREEN cast', () => {
    const edge = resolveEdgeFace({ appearance: appearanceFor('clear-acrylic') });
    // green channel dominates both red and blue — the classic acrylic edge
    expect(G(edge.color)).toBeGreaterThan(R(edge.color));
    expect(G(edge.color)).toBeGreaterThan(B(edge.color));
    // …but only as a CAST: nowhere near the full EDGE_GREEN saturation
    expect(G(edge.color) - R(edge.color)).toBeLessThan(G(EDGE_GREEN) - R(EDGE_GREEN));
  });

  it('colored acrylic edges concentrate their OWN hue, lifted brighter — no green cast', () => {
    const blue = '#0082cd';
    const edge = resolveEdgeFace({ appearance: appearanceFor('translucent-acrylic', blue) });
    expect(luminance(edge.color)).toBeGreaterThan(luminance(blue)); // brighter than the face
    expect(B(edge.color)).toBeGreaterThan(R(edge.color)); // still blue
    expect(B(edge.color)).toBeGreaterThan(G(edge.color)); // not green-cast
  });

  it('is lit and physical: satin roughness, non-metallic', () => {
    const edge = resolveEdgeFace({ appearance: appearanceFor('clear-acrylic') });
    expect(edge.roughness).toBeGreaterThan(0.02); // rougher than the cast face
    expect(edge.roughness).toBeLessThan(0.6); // but still a polished cut
    expect(edge.metalness).toBe(0);
  });
});

describe('resolveEdgeFace — fluorescent exception (real fluorescence)', () => {
  it('fluorescent-acrylic alone gets a modest genuine emissive from its edgeGain', () => {
    const a = appearanceFor('fluorescent-acrylic');
    const edge = resolveEdgeFace({ appearance: a });
    expect(edge.emissive).toBe(a.tintHex);
    expect(edge.emissiveIntensity).toBe(a.edgeGain);
    expect(edge.emissiveIntensity).toBeGreaterThan(0);
  });

  it('every other archetype — and the descriptor path — is strictly non-emissive', () => {
    for (const a of ['clear-acrylic', 'translucent-acrylic', 'opaque-acrylic', 'wood']) {
      const edge = resolveEdgeFace({ appearance: appearanceFor(a) });
      expect(edge.emissive, a).toBeNull();
      expect(edge.emissiveIntensity, a).toBe(0);
    }
    const desc = resolveEdgeFace({ descriptor: { type: 'transmissive', kind: 'acrylic', color: '#e6e954' } });
    expect(desc.emissive).toBeNull();
    expect(desc.emissiveIntensity).toBe(0);
  });
});

describe('resolveEdgeFace — Stokes-shifted emission override (emissiveHex)', () => {
  const FLUOR_BASE = {
    archetype: 'fluorescent-acrylic',
    tintHex: '#ff5fa2',
    transmission: 0.9,
    edgeGain: 2.0,
  };

  it('a fluorescent appearance with emissiveHex emits THAT hue, not the face tint', () => {
    const edge = resolveEdgeFace({ appearance: { ...FLUOR_BASE, emissiveHex: '#ff2d78' } });
    expect(edge.emissive).toBe('#ff2d78');
    expect(edge.emissiveIntensity).toBe(2.0);
  });

  it('without emissiveHex the face tint stands in (green-calibrated behavior)', () => {
    const edge = resolveEdgeFace({ appearance: FLUOR_BASE });
    expect(edge.emissive).toBe('#ff5fa2');
  });

  it('emissiveHex on a NON-fluorescent archetype never lights the edges', () => {
    const edge = resolveEdgeFace({
      appearance: {
        archetype: 'clear-acrylic', tintHex: '#e7e7e7', transmission: 0.95,
        emissiveHex: '#ff2d78',
      },
    });
    expect(edge.emissive).toBeNull();
    expect(edge.emissiveIntensity).toBe(0);
  });
});
