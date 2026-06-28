import { describe, it, expect } from 'vitest';
import {
  ARCHETYPE_NAMES,
  ARCHETYPE_DEFAULTS,
  DEFAULT_ARCHETYPE,
  isArchetype,
  getArchetypeDefaults,
  appearanceToUniforms,
} from './materialArchetypes.js';

const REQUIRED_PARAM_KEYS = [
  'archetype',
  'tintHex',
  'transmission',
  'roughness',
  'metalness',
  'ior',
  'edgeGain',
  'rimGain',
  'texturePath',
];

describe('materialArchetypes — registry shape', () => {
  it('exposes exactly the eight v1 archetypes (§3.2)', () => {
    expect(new Set(ARCHETYPE_NAMES)).toEqual(
      new Set([
        'fluorescent-acrylic',
        'clear-acrylic',
        'translucent-acrylic',
        'opaque-acrylic',
        'pearlescent-acrylic',
        'mirror-acrylic',
        'wood',
        'opaque-tinted',
      ]),
    );
  });

  it('has a defaults entry for every archetype name and vice versa', () => {
    expect(Object.keys(ARCHETYPE_DEFAULTS).sort()).toEqual([...ARCHETYPE_NAMES].sort());
  });

  it('every archetype default carries the full AppearanceParams contract (§3.1)', () => {
    for (const name of ARCHETYPE_NAMES) {
      const d = ARCHETYPE_DEFAULTS[name];
      for (const key of REQUIRED_PARAM_KEYS) {
        expect(d, `${name} missing ${key}`).toHaveProperty(key);
      }
      expect(d.archetype).toBe(name);
    }
  });

  it('keeps every numeric param within its documented range (§3.1)', () => {
    for (const name of ARCHETYPE_NAMES) {
      const d = ARCHETYPE_DEFAULTS[name];
      expect(d.transmission).toBeGreaterThanOrEqual(0);
      expect(d.transmission).toBeLessThanOrEqual(1);
      expect(d.roughness).toBeGreaterThanOrEqual(0);
      expect(d.roughness).toBeLessThanOrEqual(1);
      expect(d.metalness).toBeGreaterThanOrEqual(0);
      expect(d.metalness).toBeLessThanOrEqual(1);
      expect(d.edgeGain).toBeGreaterThanOrEqual(0);
      expect(d.edgeGain).toBeLessThanOrEqual(8);
      expect(d.rimGain).toBeGreaterThanOrEqual(0);
      expect(d.rimGain).toBeLessThanOrEqual(2);
      expect(d.tintHex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('DEFAULT_ARCHETYPE is opaque-tinted (the safe fallback, §3.2)', () => {
    expect(DEFAULT_ARCHETYPE).toBe('opaque-tinted');
  });
});

describe('materialArchetypes — per-archetype look invariants (§3.2)', () => {
  it('fluorescent-acrylic glows hard: high edgeGain, low roughness, some transmission', () => {
    const d = ARCHETYPE_DEFAULTS['fluorescent-acrylic'];
    expect(d.edgeGain).toBeGreaterThanOrEqual(4);
    expect(d.roughness).toBeLessThanOrEqual(0.2);
    expect(d.transmission).toBeGreaterThan(0);
    expect(d.transmission).toBeLessThan(1);
  });

  it('clear-acrylic is highly transmissive with only a hint of edge glow', () => {
    const d = ARCHETYPE_DEFAULTS['clear-acrylic'];
    expect(d.transmission).toBeGreaterThanOrEqual(0.9);
    expect(d.edgeGain).toBeLessThanOrEqual(0.5);
    expect(d.ior).toBeCloseTo(1.49, 2);
  });

  it('translucent-acrylic is mid-transmission with a small edge gain', () => {
    const d = ARCHETYPE_DEFAULTS['translucent-acrylic'];
    expect(d.transmission).toBeGreaterThan(0.3);
    expect(d.transmission).toBeLessThan(0.9);
    expect(d.edgeGain).toBeGreaterThan(0);
    expect(d.edgeGain).toBeLessThanOrEqual(2);
  });

  it('opaque-acrylic is solid and glossy with no edge glow', () => {
    const d = ARCHETYPE_DEFAULTS['opaque-acrylic'];
    expect(d.transmission).toBe(0);
    expect(d.edgeGain).toBe(0);
    expect(d.metalness).toBe(0);
    expect(d.roughness).toBeLessThanOrEqual(0.4);
  });

  it('pearlescent-acrylic is opaque, glossy, slightly metallic with a sheen and no edge glow', () => {
    const d = ARCHETYPE_DEFAULTS['pearlescent-acrylic'];
    expect(d.transmission).toBe(0);
    expect(d.edgeGain).toBe(0);
    expect(d.metalness).toBeGreaterThan(0);
    expect(d.metalness).toBeLessThan(1);
    // pearl reserves a clearcoat term for S4's nacre approximation
    expect(d.clearcoat).toBeGreaterThan(0);
  });

  it('mirror-acrylic is fully metallic, near-mirror-smooth, opaque, no edge glow', () => {
    const d = ARCHETYPE_DEFAULTS['mirror-acrylic'];
    expect(d.transmission).toBe(0);
    expect(d.metalness).toBe(1);
    expect(d.roughness).toBeLessThanOrEqual(0.1);
    expect(d.edgeGain).toBe(0);
  });

  it('wood is opaque, matte-ish, non-metallic, no edge glow, with texturePath reserved (§L6)', () => {
    const d = ARCHETYPE_DEFAULTS['wood'];
    expect(d.transmission).toBe(0);
    expect(d.metalness).toBe(0);
    expect(d.roughness).toBeGreaterThanOrEqual(0.5);
    expect(d.edgeGain).toBe(0);
    expect(d).toHaveProperty('texturePath');
    expect(d.texturePath).toBeNull();
  });

  it('opaque-tinted (default) is solid, inert: no transmission, no glow, no metal', () => {
    const d = ARCHETYPE_DEFAULTS['opaque-tinted'];
    expect(d.transmission).toBe(0);
    expect(d.edgeGain).toBe(0);
    expect(d.metalness).toBe(0);
  });

  it('only acrylic archetypes have any edge glow; wood + opaque variants do not', () => {
    expect(ARCHETYPE_DEFAULTS['wood'].edgeGain).toBe(0);
    expect(ARCHETYPE_DEFAULTS['opaque-acrylic'].edgeGain).toBe(0);
    expect(ARCHETYPE_DEFAULTS['pearlescent-acrylic'].edgeGain).toBe(0);
    expect(ARCHETYPE_DEFAULTS['mirror-acrylic'].edgeGain).toBe(0);
    expect(ARCHETYPE_DEFAULTS['opaque-tinted'].edgeGain).toBe(0);
  });
});

describe('isArchetype', () => {
  it('accepts every known archetype name', () => {
    for (const name of ARCHETYPE_NAMES) expect(isArchetype(name)).toBe(true);
  });

  it('rejects unknown / malformed names', () => {
    expect(isArchetype('glass')).toBe(false);
    expect(isArchetype('')).toBe(false);
    expect(isArchetype(undefined)).toBe(false);
    expect(isArchetype(null)).toBe(false);
    expect(isArchetype(42)).toBe(false);
  });
});

describe('getArchetypeDefaults', () => {
  it('returns the defaults for a known archetype', () => {
    const d = getArchetypeDefaults('mirror-acrylic');
    expect(d.archetype).toBe('mirror-acrylic');
    expect(d.metalness).toBe(1);
  });

  it('falls back to opaque-tinted for an unknown archetype (§3.2 safe default)', () => {
    const d = getArchetypeDefaults('nope-not-real');
    expect(d.archetype).toBe('opaque-tinted');
  });

  it('falls back to opaque-tinted for nullish input', () => {
    expect(getArchetypeDefaults().archetype).toBe('opaque-tinted');
    expect(getArchetypeDefaults(null).archetype).toBe('opaque-tinted');
  });

  it('returns a fresh copy each call — mutating one must not poison the registry', () => {
    const a = getArchetypeDefaults('wood');
    a.roughness = 0.01;
    a.tintHex = '#000000';
    const b = getArchetypeDefaults('wood');
    expect(b.roughness).not.toBe(0.01);
    expect(b.tintHex).not.toBe('#000000');
    // and the registry source object is untouched
    expect(ARCHETYPE_DEFAULTS['wood'].roughness).not.toBe(0.01);
  });
});

describe('appearanceToUniforms — registry→shader mapping helper (§3.2)', () => {
  it('maps an AppearanceParams object to a flat uniform-friendly bag', () => {
    const params = getArchetypeDefaults('fluorescent-acrylic');
    const u = appearanceToUniforms(params);
    expect(u.uTransmission).toBe(params.transmission);
    expect(u.uRoughness).toBe(params.roughness);
    expect(u.uMetalness).toBe(params.metalness);
    expect(u.uIor).toBe(params.ior);
    expect(u.uEdgeGain).toBe(params.edgeGain);
    expect(u.uRimGain).toBe(params.rimGain);
    expect(u.uTint).toBe(params.tintHex);
  });

  it('bridges the pearlescent clearcoat sheen so S4 can wire it', () => {
    const u = appearanceToUniforms(getArchetypeDefaults('pearlescent-acrylic'));
    expect(u.uClearcoat).toBeGreaterThan(0);
  });

  it('imports no three — uniform values stay primitive (string/number), not THREE objects', () => {
    const u = appearanceToUniforms(getArchetypeDefaults('clear-acrylic'));
    expect(typeof u.uTint).toBe('string');
    expect(typeof u.uTransmission).toBe('number');
    expect(typeof u.uEdgeGain).toBe('number');
  });
});
