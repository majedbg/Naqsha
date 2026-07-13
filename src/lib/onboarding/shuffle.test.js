// Guest onboarding S4 — "Surprise me" / Shuffle logic tests (D11).
import { describe, it, expect } from 'vitest';
import { shuffleSeedParams } from './shuffle';
import { SEED_HERO_RANGES, SEED_KEYS, getSeedDocument } from './seedDocuments';
import { PATTERN_PARAM_DEFS, RANDOMIZE_EXCLUDED_KEYS, DEFAULT_PARAMS } from '../../constants';

const ITERATIONS = 200;

// Every real key a def covers, plus the [lo, hi] range it must land in —
// mirrors randomPatchForDef's own branching (axes / keys / single key) so
// this test independently re-derives the expected bounds rather than just
// re-asserting the implementation's own logic back at itself.
// Enumerated defs (select / iconselect) randomize over `options`, not a
// numeric min/max — verified separately (membership, not bounds).
function expectedRangesFor(def) {
  if (def.options) return [];
  if (def.axes) {
    return def.axes.map((ax) => ({ key: ax.key, lo: ax.min, hi: ax.max }));
  }
  if (def.keys) {
    return def.keys.map((k) => ({ key: k, lo: def.min, hi: def.max }));
  }
  return [{ key: def.key, lo: def.min, hi: def.max }];
}

describe('shuffleSeedParams (S4)', () => {
  it.each(SEED_KEYS)('keeps the %s hero param inside its curated golden band across many rerolls', (seedKey) => {
    const [seedLayer] = getSeedDocument(seedKey);
    const { key, min, max } = SEED_HERO_RANGES[seedKey];
    for (let i = 0; i < ITERATIONS; i++) {
      const result = shuffleSeedParams(seedKey, seedLayer.params);
      expect(result[key]).toBeGreaterThanOrEqual(min);
      expect(result[key]).toBeLessThanOrEqual(max);
    }
  });

  it.each(SEED_KEYS)('never mutates a RANDOMIZE_EXCLUDED_KEYS key for %s', (seedKey) => {
    const [seedLayer] = getSeedDocument(seedKey);
    const excludedInParams = Object.keys(seedLayer.params).filter((k) =>
      RANDOMIZE_EXCLUDED_KEYS.includes(k)
    );
    // Sanity: the seed document actually carries at least one excluded key
    // (offsetX/offsetY/strokeWeight/symmetry/startAngle are universal), so
    // this test isn't vacuously true.
    expect(excludedInParams.length).toBeGreaterThan(0);

    for (let i = 0; i < ITERATIONS; i++) {
      const result = shuffleSeedParams(seedKey, seedLayer.params);
      for (const k of excludedInParams) {
        expect(result[k]).toBe(seedLayer.params[k]);
      }
    }
  });

  it.each(SEED_KEYS)('never touches patternType or introduces a patternType key for %s', (seedKey) => {
    const [seedLayer] = getSeedDocument(seedKey);
    const result = shuffleSeedParams(seedKey, seedLayer.params);
    expect(result.patternType).toBeUndefined();
  });

  it.each(SEED_KEYS)('keeps every produced param within its PATTERN_PARAM_DEFS min/max for %s', (seedKey) => {
    const [seedLayer] = getSeedDocument(seedKey);
    const defs = PATTERN_PARAM_DEFS[seedKey];
    for (let i = 0; i < ITERATIONS; i++) {
      const result = shuffleSeedParams(seedKey, seedLayer.params);
      for (const def of defs) {
        for (const { key, lo, hi } of expectedRangesFor(def)) {
          if (result[key] === undefined) continue; // not every def maps to a value in params (n/a here)
          expect(result[key]).toBeGreaterThanOrEqual(lo);
          expect(result[key]).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  // Only phyllotaxis/recursive carry enumerated (select/iconselect) params
  // among the three seeds — topographic's defs are all numeric.
  it.each(['phyllotaxis', 'recursive'])('keeps every enumerated (select/iconselect) param within its declared options for %s', (seedKey) => {
    const [seedLayer] = getSeedDocument(seedKey);
    const defs = PATTERN_PARAM_DEFS[seedKey];
    const enumeratedDefs = defs.filter((d) => d.options);
    expect(enumeratedDefs.length).toBeGreaterThan(0); // sanity: not vacuous
    for (let i = 0; i < ITERATIONS; i++) {
      const result = shuffleSeedParams(seedKey, seedLayer.params);
      for (const def of enumeratedDefs) {
        const valid = (def.randomOptions || def.options).map((o) => o.value);
        expect(valid).toContain(result[def.key]);
      }
    }
  });

  it('does not mutate the input params object (returns a new object)', () => {
    const [seedLayer] = getSeedDocument('phyllotaxis');
    const before = { ...seedLayer.params };
    const result = shuffleSeedParams('phyllotaxis', seedLayer.params);
    expect(seedLayer.params).toEqual(before); // original untouched
    expect(result).not.toBe(seedLayer.params); // new reference
  });

  it('produces variety across rerolls (not a no-op)', () => {
    const [seedLayer] = getSeedDocument('recursive');
    const results = new Set();
    for (let i = 0; i < 20; i++) {
      results.add(JSON.stringify(shuffleSeedParams('recursive', seedLayer.params)));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it('is defensive for an unknown pattern type — returns a shallow copy, never throws', () => {
    const params = { ...DEFAULT_PARAMS.spirograph };
    expect(() => shuffleSeedParams('not-a-real-pattern-type', params)).not.toThrow();
    const result = shuffleSeedParams('not-a-real-pattern-type', params);
    expect(result).toEqual(params);
    expect(result).not.toBe(params);
  });
});
