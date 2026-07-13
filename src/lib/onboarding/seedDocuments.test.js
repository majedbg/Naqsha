// Guest onboarding S1 — curated seed documents (D5-D10, D15).
// Each starter is a REAL app layer document (built on createLayer, so its shape
// never drifts from what the rest of the app produces) with a fixed, vetted
// landing frame. See docs/guest-onboarding-DECISIONS.md D7 for the golden
// ranges and D15 for the honest engrave-only requirement.
import { describe, it, expect } from 'vitest';
import { PATTERN_PARAM_DEFS } from '../../constants';
import {
  SEED_KEYS,
  DEFAULT_SEED_KEY,
  SEED_HERO_RANGES,
  getSeedDocument,
} from './seedDocuments';

describe('onboarding seed documents (S1)', () => {
  it('exposes the three locked starters, phyllotaxis default (D5)', () => {
    expect(SEED_KEYS.sort()).toEqual(['phyllotaxis', 'recursive', 'topographic'].sort());
    expect(DEFAULT_SEED_KEY).toBe('phyllotaxis');
  });

  it.each(SEED_KEYS)('%s: getSeedDocument returns a valid non-empty single-layer array', (key) => {
    const doc = getSeedDocument(key);
    expect(Array.isArray(doc)).toBe(true);
    expect(doc.length).toBe(1);
    const layer = doc[0];
    expect(typeof layer.id).toBe('string');
    expect(layer.id.length).toBeGreaterThan(0);
    expect(layer.visible).toBe(true);
    expect(typeof layer.name).toBe('string');
  });

  it.each(SEED_KEYS)('%s: is honest engrave-only (D15) — role engrave, not cut', (key) => {
    const [layer] = getSeedDocument(key);
    expect(layer.role).toBe('engrave');
    expect(layer.operationId).toBe('op-engrave');
  });

  it('phyllotaxis seed: patternType + params within PATTERN_PARAM_DEFS bounds, angle in golden band', () => {
    const [layer] = getSeedDocument('phyllotaxis');
    expect(layer.patternType).toBe('phyllotaxis');
    assertParamsWithinDefs(layer);
    const { key, min, max } = SEED_HERO_RANGES.phyllotaxis;
    expect(key).toBe('angle');
    expect(layer.params.angle).toBeGreaterThanOrEqual(min);
    expect(layer.params.angle).toBeLessThanOrEqual(max);
  });

  it('recursive seed: pentagon, rotationPerLevel 36, depth 4, scaleFactor in golden band', () => {
    const [layer] = getSeedDocument('recursive');
    expect(layer.patternType).toBe('recursive');
    assertParamsWithinDefs(layer);
    expect(layer.params.shape).toBe('pentagon');
    expect(layer.params.rotationPerLevel).toBe(36);
    expect(layer.params.depth).toBe(4);
    const { key, min, max } = SEED_HERO_RANGES.recursive;
    expect(key).toBe('scaleFactor');
    expect(layer.params.scaleFactor).toBeGreaterThanOrEqual(min);
    expect(layer.params.scaleFactor).toBeLessThanOrEqual(max);
  });

  it('topographic seed: noiseScale in golden band', () => {
    const [layer] = getSeedDocument('topographic');
    expect(layer.patternType).toBe('topographic');
    assertParamsWithinDefs(layer);
    const { key, min, max } = SEED_HERO_RANGES.topographic;
    expect(key).toBe('noiseScale');
    expect(layer.params.noiseScale).toBeGreaterThanOrEqual(min);
    expect(layer.params.noiseScale).toBeLessThanOrEqual(max);
  });

  it('getSeedDocument returns independent clones — mutating one does not affect another call', () => {
    const a = getSeedDocument('phyllotaxis');
    const b = getSeedDocument('phyllotaxis');
    a[0].params.angle = 999;
    a[0].id = 'mutated';
    expect(b[0].params.angle).not.toBe(999);
    expect(b[0].id).not.toBe('mutated');
  });

  it('getSeedDocument returns fresh ids across calls (no id collision)', () => {
    const a = getSeedDocument('recursive');
    const b = getSeedDocument('recursive');
    expect(a[0].id).not.toBe(b[0].id);
  });

  it.each(SEED_KEYS)(
    '%s: layer.seed is a FIXED value across calls (D8 — deterministic landing frame, not just params)',
    (key) => {
      // TopographicContours seeds its noise field directly from layer.seed
      // (makeSimplex(seed)); a random seed would make the terrain shape
      // differ per guest even at the same noiseScale, breaking D8.
      const a = getSeedDocument(key);
      const b = getSeedDocument(key);
      expect(typeof a[0].seed).toBe('number');
      expect(a[0].seed).toBe(b[0].seed);
    }
  );

  it('unknown seed key throws (no silent bad state)', () => {
    expect(() => getSeedDocument('not-a-seed')).toThrow();
  });
});

// Numeric param defs get bounds-checked directly. Non-numeric defs (e.g.
// iconselect 'shape') have no min/max — validate those against `options`
// instead so the check doesn't choke on them (advisor note: bounds test must
// skip non-numeric defs).
function assertParamsWithinDefs(layer) {
  const defs = PATTERN_PARAM_DEFS[layer.patternType] || [];
  for (const def of defs) {
    const value = layer.params[def.key];
    if (value === undefined) continue;
    if (typeof def.min === 'number' && typeof def.max === 'number') {
      expect(value).toBeGreaterThanOrEqual(def.min);
      expect(value).toBeLessThanOrEqual(def.max);
    } else if (Array.isArray(def.options)) {
      const allowed = def.options.map((o) => o.value);
      expect(allowed).toContain(value);
    }
  }
}
