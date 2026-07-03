// S12 (issue #61): the parameterization payload on the unified entity —
// construction validation + serialize/deserialize round-trip through the
// existing user_patterns param columns (source_code/param_defs/default_params,
// nullable since migration 009 — NO new migration).

import { describe, it, expect } from 'vitest';
import {
  makeExtractedPattern,
  serializeExtractedPattern,
  deserializeExtractedPattern,
  normalizeParameterization,
} from './extractedPattern';
import { kaplanStarFamily } from './families/kaplanStar';

const tile = {
  width: 100,
  height: 100,
  fills: [],
  strokes: [{ d: 'M50 5 L60 50 L50 95 L40 50 Z', role: 'score' }],
};
const lattice = { t1: [100, 0], t2: [0, 100], cell: { width: 100, height: 100 }, type: 'square', confidence: 0.9 };

const paramEntity = (over = {}) =>
  makeExtractedPattern({
    patternId: 'extracted-param-1',
    title: 'Star',
    tile,
    lattice,
    family: 'kaplan-star',
    paramDefs: kaplanStarFamily.paramDefs,
    defaultParams: { n: 8, contactAngle: 45, scale: 0.9 },
    ...over,
  });

describe('normalizeParameterization (validate-and-null, all-or-nothing)', () => {
  it('keeps a whitelisted family with coherent defs + defaults', () => {
    const p = normalizeParameterization({
      family: 'kaplan-star',
      paramDefs: kaplanStarFamily.paramDefs,
      defaultParams: { n: 8, contactAngle: 45 },
    });
    expect(p.family).toBe('kaplan-star');
    expect(p.paramDefs.length).toBeGreaterThan(0);
    expect(p.defaultParams).toEqual({ n: 8, contactAngle: 45 });
  });

  it('drops an unknown family (all-or-nothing → fixed tile)', () => {
    const p = normalizeParameterization({
      family: 'evil-family',
      paramDefs: kaplanStarFamily.paramDefs,
      defaultParams: { n: 8 },
    });
    expect(p).toEqual({ family: null, paramDefs: null, defaultParams: null });
  });

  it('rejects a crafted param key / non-finite value', () => {
    expect(
      normalizeParameterization({
        family: 'kaplan-star',
        paramDefs: [{ key: 'n', min: 3, max: 12, step: 1 }],
        defaultParams: { 'n; DROP TABLE': 8 },
      }).defaultParams
    ).toBeNull();
    expect(
      normalizeParameterization({
        family: 'kaplan-star',
        paramDefs: [{ key: 'n', min: 3, max: 12, step: 1 }],
        defaultParams: { n: Infinity },
      }).defaultParams
    ).toBeNull();
  });

  it('rejects malformed defs (max ≤ min)', () => {
    expect(
      normalizeParameterization({
        family: 'kaplan-star',
        paramDefs: [{ key: 'n', min: 12, max: 3, step: 1 }],
        defaultParams: { n: 8 },
      }).paramDefs
    ).toBeNull();
  });
});

describe('entity parameterization round-trip', () => {
  it('makeExtractedPattern carries the parameterization payload', () => {
    const e = paramEntity();
    expect(e.family).toBe('kaplan-star');
    expect(e.defaultParams).toMatchObject({ n: 8, contactAngle: 45 });
    expect(e.paramDefs.map((d) => d.key)).toContain('contactAngle');
  });

  it('serialize → deserialize preserves family + defs + defaults (via existing columns)', () => {
    const row = serializeExtractedPattern(paramEntity());
    // The row uses the pre-existing param columns; __family rides in default_params.
    expect(row.param_defs).toBeTruthy();
    expect(row.default_params.__family).toBe('kaplan-star');
    const back = deserializeExtractedPattern(row);
    expect(back.family).toBe('kaplan-star');
    expect(back.defaultParams).toMatchObject({ n: 8, contactAngle: 45, scale: 0.9 });
    expect(back.paramDefs.map((d) => d.key)).toContain('n');
    // __family sentinel does NOT leak back into the params.
    expect(back.defaultParams.__family).toBeUndefined();
  });

  it('a fixed-tile extracted entity leaves parameterization null (unchanged S0 shape)', () => {
    const e = makeExtractedPattern({ patternId: 'extracted-fixed-1', title: 'Fixed', tile, lattice });
    expect(e.family).toBeNull();
    expect(e.paramDefs).toBeNull();
    expect(e.defaultParams).toBeNull();
    const back = deserializeExtractedPattern(serializeExtractedPattern(e));
    expect(back.family).toBeNull();
  });
});
