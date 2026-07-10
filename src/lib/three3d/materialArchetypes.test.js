import { describe, it, expect } from 'vitest';
import {
  ARCHETYPE_NAMES,
  ARCHETYPE_DEFAULTS,
  DEFAULT_ARCHETYPE,
  isArchetype,
  getArchetypeDefaults,
  appearanceToUniforms,
  substrateOptics,
} from './materialArchetypes.js';

// rimGain was removed with the additive Fresnel shell (ADR 0003) — the contract
// deliberately has no shell term left.
const REQUIRED_PARAM_KEYS = [
  'archetype',
  'tintHex',
  'transmission',
  'roughness',
  'metalness',
  'ior',
  'edgeGain',
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
      expect(d).not.toHaveProperty('rimGain'); // the shell term is gone (ADR 0003)
      expect(d.tintHex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('DEFAULT_ARCHETYPE is opaque-tinted (the safe fallback, §3.2)', () => {
    expect(DEFAULT_ARCHETYPE).toBe('opaque-tinted');
  });
});

describe('materialArchetypes — per-archetype look invariants (§3.2)', () => {
  it('fluorescent-acrylic is the ONLY archetype with emissive edges (real fluorescence — ADR 0003 exception)', () => {
    const d = ARCHETYPE_DEFAULTS['fluorescent-acrylic'];
    expect(d.edgeGain).toBeGreaterThan(0);
    for (const a of Object.values(ARCHETYPE_DEFAULTS)) {
      if (a.archetype !== 'fluorescent-acrylic') {
        expect(a.edgeGain, `${a.archetype} must not emit`).toBe(0);
      }
    }
    expect(d.roughness).toBeLessThanOrEqual(0.2);
    // LSC model (Wilson 2009): the fluorescent HOST is as transparent as clear
    // cast — a tinted-glass look, not opaque paint.
    expect(d.transmission).toBeGreaterThanOrEqual(0.85);
    expect(d.transmission).toBeLessThan(1);
  });

  it('fluorescent-acrylic is the ONLY archetype with body re-emission (faceGlow), and it stays FAINT', () => {
    const d = ARCHETYPE_DEFAULTS['fluorescent-acrylic'];
    expect(d.faceGlow).toBeGreaterThan(0);
    expect(d.faceGlow).toBeLessThanOrEqual(0.5);
    for (const a of Object.values(ARCHETYPE_DEFAULTS)) {
      if (a.archetype !== 'fluorescent-acrylic') {
        expect(a.faceGlow, `${a.archetype} must not body-glow`).toBe(0);
      }
    }
  });

  it('clear-acrylic matches measured cast PMMA: transmission 0.92–0.95, roughness ≈0.02, IOR 1.49 (ADR 0003)', () => {
    const d = ARCHETYPE_DEFAULTS['clear-acrylic'];
    expect(d.transmission).toBeGreaterThanOrEqual(0.92);
    expect(d.transmission).toBeLessThanOrEqual(0.95);
    expect(d.roughness).toBeCloseTo(0.02, 2);
    expect(d.edgeGain).toBe(0); // edge brightness is the edge-face material, not emissive
    expect(d.ior).toBeCloseTo(1.49, 2);
  });

  it('translucent-acrylic is mid-transmission, non-emissive', () => {
    const d = ARCHETYPE_DEFAULTS['translucent-acrylic'];
    expect(d.transmission).toBeGreaterThan(0.3);
    expect(d.transmission).toBeLessThan(0.9);
    expect(d.edgeGain).toBe(0);
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

});

describe('substrateOptics — no-material-lens fallback optics (ADR 0003)', () => {
  it('acrylic reads as clear cast PMMA (the archetype IS the optics source)', () => {
    const o = substrateOptics('acrylic');
    expect(o.archetype).toBe('clear-acrylic');
    expect(o.transmission).toBe(ARCHETYPE_DEFAULTS['clear-acrylic'].transmission);
    expect(o.roughness).toBe(ARCHETYPE_DEFAULTS['clear-acrylic'].roughness);
    expect(o.ior).toBeCloseTo(1.49, 2);
  });

  it('folds the per-kind matte roughness into the wood archetype (D7: ply .8 / mdf .9 / cardstock 1.0)', () => {
    expect(substrateOptics('plywood')).toMatchObject({ archetype: 'wood', roughness: 0.8 });
    expect(substrateOptics('mdf')).toMatchObject({ archetype: 'wood', roughness: 0.9 });
    expect(substrateOptics('cardstock')).toMatchObject({ archetype: 'wood', roughness: 1.0 });
    for (const kind of ['plywood', 'mdf', 'cardstock']) {
      expect(substrateOptics(kind).transmission).toBe(0);
      expect(substrateOptics(kind).metalness).toBe(0);
    }
  });

  it('unknown / missing kind falls back to inert opaque-tinted optics at the neutral 0.7', () => {
    for (const kind of ['other', 'titanium', undefined, null]) {
      const o = substrateOptics(kind);
      expect(o.archetype).toBe(DEFAULT_ARCHETYPE);
      expect(o.roughness).toBeCloseTo(0.7, 5);
      expect(o.transmission).toBe(0);
    }
  });

  it('returns optics only — never a color/tint (identity stays on the descriptor)', () => {
    expect(substrateOptics('acrylic')).not.toHaveProperty('tintHex');
    expect(substrateOptics('acrylic')).not.toHaveProperty('color');
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
    expect(u.uFaceGlow).toBe(params.faceGlow);
    expect(u).not.toHaveProperty('uRimGain'); // shell term removed (ADR 0003)
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
