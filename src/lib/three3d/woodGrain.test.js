import { describe, it, expect } from 'vitest';
import {
  WOOD_GRAIN_DEFAULTS,
  hash2,
  valueNoise2,
  fbm2,
  woodGrainAt,
  shadeWoodHex,
  resolveWoodGrainParams,
  hasWoodTexture,
} from './woodGrain.js';
import { getArchetypeDefaults } from './materialArchetypes.js';

// A representative scatter of normalized surface coords (slab x/width, y/height).
const SAMPLES = [];
for (let i = 0; i <= 8; i++) {
  for (let j = 0; j <= 8; j++) {
    SAMPLES.push([(i / 8) - 0.5, (j / 8) - 0.5]);
  }
}

describe('woodGrain — module is pure & three-free', () => {
  it('exports plain defaults with the reserved texturePath null (L6)', () => {
    expect(WOOD_GRAIN_DEFAULTS.texturePath).toBeNull();
    // The grain knobs the shader uniforms read.
    expect(WOOD_GRAIN_DEFAULTS.ringFrequency).toBeGreaterThan(0);
    expect(WOOD_GRAIN_DEFAULTS.turbulence).toBeGreaterThanOrEqual(0);
    expect(WOOD_GRAIN_DEFAULTS.grainContrast).toBeGreaterThan(0);
    expect(WOOD_GRAIN_DEFAULTS.grainContrast).toBeLessThanOrEqual(1);
  });
});

describe('hash2 / valueNoise2 / fbm2 — GLSL-mirrorable noise', () => {
  it('hash2 is deterministic and in [0, 1)', () => {
    for (let x = -5; x <= 5; x++) {
      for (let y = -5; y <= 5; y++) {
        const a = hash2(x, y);
        const b = hash2(x, y);
        expect(a).toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(1);
      }
    }
  });

  it('valueNoise2 stays within [0, 1] across the sample grid', () => {
    for (const [u, v] of SAMPLES) {
      const n = valueNoise2(u * 4, v * 4);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      expect(Number.isFinite(n)).toBe(true);
    }
  });

  it('valueNoise2 is continuous at integer lattice points (equals the corner hash)', () => {
    // At an exact lattice point the bilinear blend collapses to that corner.
    expect(valueNoise2(3, 4)).toBeCloseTo(hash2(3, 4), 12);
    expect(valueNoise2(-2, 1)).toBeCloseTo(hash2(-2, 1), 12);
  });

  it('fbm2 stays in [0, 1] and is deterministic', () => {
    for (const [u, v] of SAMPLES) {
      const a = fbm2(u * 3, v * 3, 3);
      const b = fbm2(u * 3, v * 3, 3);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

describe('woodGrainAt — grain field', () => {
  it('is ALWAYS in [0, 1] across the slab (the shader multiplies it into diffuse)', () => {
    for (const [u, v] of SAMPLES) {
      const g = woodGrainAt(u, v);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(Number.isFinite(g)).toBe(true);
    }
  });

  it('is deterministic — same coord + params → same grain', () => {
    for (const [u, v] of SAMPLES) {
      expect(woodGrainAt(u, v)).toBe(woodGrainAt(u, v));
    }
  });

  it('turbulence 0 → perfectly concentric rings (depends only on distance to centre)', () => {
    const p = { turbulence: 0 };
    const { centerU, centerV } = WOOD_GRAIN_DEFAULTS;
    // Two points at the SAME radius from the ring centre must give equal grain.
    const r = 0.7;
    const aU = centerU + r;
    const aV = centerV;
    const bU = centerU;
    const bV = centerV + r;
    expect(woodGrainAt(aU, aV, p)).toBeCloseTo(woodGrainAt(bU, bV, p), 12);
    // …and a different radius generally differs (rings actually vary).
    expect(woodGrainAt(centerU + 0.123, centerV, p)).not.toBe(
      woodGrainAt(centerU + 0.456, centerV, p),
    );
  });

  it('ringFrequency changes the field — denser rings produce different grain', () => {
    let differing = 0;
    for (const [u, v] of SAMPLES) {
      const lo = woodGrainAt(u, v, { ringFrequency: 4, turbulence: 0 });
      const hi = woodGrainAt(u, v, { ringFrequency: 16, turbulence: 0 });
      if (Math.abs(lo - hi) > 1e-9) differing += 1;
    }
    // The vast majority of samples must respond to ring frequency.
    expect(differing).toBeGreaterThan(SAMPLES.length / 2);
  });

  it('turbulence warps the rings away from the pure concentric field', () => {
    let differing = 0;
    for (const [u, v] of SAMPLES) {
      const clean = woodGrainAt(u, v, { turbulence: 0 });
      const warped = woodGrainAt(u, v, { turbulence: 0.6 });
      if (Math.abs(clean - warped) > 1e-9) differing += 1;
    }
    expect(differing).toBeGreaterThan(SAMPLES.length / 2);
  });
});

describe('shadeWoodHex — grain → colour', () => {
  const base = getArchetypeDefaults('wood').tintHex; // '#d8b988'

  it('grain 0 (earlywood) returns the base tint unchanged', () => {
    expect(shadeWoodHex(base, 0)).toBe(base.toLowerCase());
  });

  it('grain 1 (latewood) darkens every channel by grainContrast', () => {
    const factor = 1 - WOOD_GRAIN_DEFAULTS.grainContrast;
    // base #d8b988 → each channel * factor, rounded.
    const r = Math.round(0xd8 * factor);
    const g = Math.round(0xb9 * factor);
    const b = Math.round(0x88 * factor);
    const expected = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    expect(shadeWoodHex(base, 1)).toBe(expected);
  });

  it('is monotonically non-increasing in grain (latewood never lighter than earlywood)', () => {
    const lum = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    let prev = lum(shadeWoodHex(base, 0));
    for (let g = 0.1; g <= 1.0001; g += 0.1) {
      const cur = lum(shadeWoodHex(base, g));
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it('clamps out-of-range grain instead of producing invalid channels', () => {
    expect(shadeWoodHex(base, -1)).toBe(shadeWoodHex(base, 0));
    expect(shadeWoodHex(base, 2)).toBe(shadeWoodHex(base, 1));
  });

  it('throws on a malformed base hex (fails loud, no silent garbage)', () => {
    expect(() => shadeWoodHex('not-a-hex', 0.5)).toThrow();
  });
});

describe('resolveWoodGrainParams / hasWoodTexture — texturePath RESERVED (L6)', () => {
  it('defaults texturePath to null and carries the grain knobs', () => {
    const p = resolveWoodGrainParams(getArchetypeDefaults('wood'));
    expect(p.texturePath).toBeNull();
    expect(p.ringFrequency).toBe(WOOD_GRAIN_DEFAULTS.ringFrequency);
    expect(p.grainContrast).toBe(WOOD_GRAIN_DEFAULTS.grainContrast);
  });

  it('passes a reserved texturePath through when a material sets it (future use)', () => {
    const p = resolveWoodGrainParams({ texturePath: '/textures/walnut.png' });
    expect(p.texturePath).toBe('/textures/walnut.png');
    expect(hasWoodTexture(p)).toBe(true);
  });

  it('hasWoodTexture is false for the v1 default (procedural always used)', () => {
    expect(hasWoodTexture(resolveWoodGrainParams())).toBe(false);
    expect(hasWoodTexture({})).toBe(false);
    expect(hasWoodTexture({ texturePath: null })).toBe(false);
  });

  it('tolerates a nullish appearance argument', () => {
    expect(resolveWoodGrainParams().texturePath).toBeNull();
    expect(resolveWoodGrainParams(null).texturePath).toBeNull();
  });
});
