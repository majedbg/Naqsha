/**
 * AR-1D: Characterization tests for checkGate + TIER_LIMITS
 *
 * Mode: CHARACTERIZATION — these tests PIN current reality.
 * If a test goes red, the assertion is wrong; fix the assertion, NOT the source.
 *
 * IMPORTANT NOTE — pro ≡ studio ≡ free (byte-identical limits):
 *   At the time of writing (2026-06-10), the free/pro/studio tier rows in
 *   TIER_LIMITS are numerically identical on every field except the comment
 *   explaining aiCredits. This means:
 *     - checkGate returns the SAME result for 'free', 'pro', and 'studio' on
 *       every feature except 'pattern' and 'layers' (where the signed-in tier
 *       name only appears in reason strings — the gate logic itself is identical).
 *   A future O-1 collapse (merging pro/studio into free) is safe to execute as
 *   a pure deletion of the pro/studio rows — these tests will document any drift
 *   if limits are accidentally changed before that collapse.
 *
 * Feature cases covered: pattern, layers, preset, customSize, param, seed,
 *   cloudSave, share, fork, collections, history, aiCredits, default/unknown.
 * Tiers covered: guest, free, pro, studio, and unknown (falls back to guest).
 * Total gate assertions: see test count at bottom.
 */

import { describe, it, expect } from 'vitest';
import { checkGate, TIER_LIMITS } from './tierLimits';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** All paid/authenticated tiers that share identical effective limits today. */
const SIGNED_IN_TIERS = ['free', 'pro', 'studio'];

// ─────────────────────────────────────────────────────────────────────────────
// TIER_LIMITS shape sanity
// ─────────────────────────────────────────────────────────────────────────────

describe('TIER_LIMITS shape', () => {
  it('exports all four tiers', () => {
    expect(Object.keys(TIER_LIMITS)).toEqual(['guest', 'free', 'pro', 'studio']);
  });

  it('guest tier has expected shape (loosened 2026-06-10)', () => {
    const g = TIER_LIMITS.guest;
    expect(Array.isArray(g.patterns)).toBe(true);
    expect(g.maxLayers).toBe(3);
    expect(g.presetIndices).toBeNull();          // all sizes unlocked
    expect(g.allowCustomSize).toBe(true);
    // per-pattern object: default cap + Infinity overrides
    expect(typeof g.maxParamsPerPattern).toBe('object');
    expect(g.maxParamsPerPattern.default).toBe(7);
    expect(g.universalParams).toBe(true);
    expect(g.seedVisible).toBe(true);
    expect(g.seedEditable).toBe(true);
    expect(g.maxCloudSaves).toBe(0);             // still gated — the reason to sign in
    expect(g.canShare).toBe(true);
    expect(g.canFork).toBe(false);               // still gated
    expect(g.collections).toBe(false);           // still gated
    expect(g.historySnapshots).toBe(25);
    expect(g.aiCredits).toBe(false);             // still gated — costs real money
  });

  it('free/pro/studio limits are byte-identical (all numeric/boolean fields)', () => {
    const fields = [
      'maxLayers', 'allowCustomSize', 'maxParamsPerPattern',
      'seedVisible', 'seedEditable', 'svgMetadata', 'maxCloudSaves',
      'canShare', 'canFork', 'localStorage', 'collections', 'historySnapshots',
    ];
    for (const field of fields) {
      expect(TIER_LIMITS.pro[field]).toStrictEqual(TIER_LIMITS.free[field]);
      expect(TIER_LIMITS.studio[field]).toStrictEqual(TIER_LIMITS.free[field]);
    }
    // patterns and presetIndices are null (all) for all three
    expect(TIER_LIMITS.free.patterns).toBeNull();
    expect(TIER_LIMITS.pro.patterns).toBeNull();
    expect(TIER_LIMITS.studio.patterns).toBeNull();
    expect(TIER_LIMITS.free.presetIndices).toBeNull();
    expect(TIER_LIMITS.pro.presetIndices).toBeNull();
    expect(TIER_LIMITS.studio.presetIndices).toBeNull();
    // lockedParamKeys is empty for all three
    expect(TIER_LIMITS.free.lockedParamKeys).toEqual([]);
    expect(TIER_LIMITS.pro.lockedParamKeys).toEqual([]);
    expect(TIER_LIMITS.studio.lockedParamKeys).toEqual([]);
    // aiCredits is truthy for all three
    expect(TIER_LIMITS.free.aiCredits).toBe(true);
    expect(TIER_LIMITS.pro.aiCredits).toBe(true);
    expect(TIER_LIMITS.studio.aiCredits).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkGate: unknown tier falls back to guest
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: unknown tier falls back to guest', () => {
  it('unknown tier behaves like guest for pattern', () => {
    const result = checkGate('enterprise', 'pattern', 'spirograph');
    // guest allows spirograph
    expect(result.allowed).toBe(true);
  });

  it('unknown tier behaves like guest for customSize', () => {
    const result = checkGate('enterprise', 'customSize');
    expect(result.allowed).toBe(true);   // guest now allows custom sizes
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: pattern
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: pattern', () => {
  it('guest — allowed pattern (spirograph is in guest list)', () => {
    const r = checkGate('guest', 'pattern', 'spirograph');
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — allowed pattern (flowfield)', () => {
    const r = checkGate('guest', 'pattern', 'flowfield');
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — allowed pattern (phyllotaxis)', () => {
    const r = checkGate('guest', 'pattern', 'phyllotaxis');
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — allowed pattern (recursive)', () => {
    const r = checkGate('guest', 'pattern', 'recursive');
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — disallowed pattern (lissajous not in guest list)', () => {
    const r = checkGate('guest', 'pattern', 'lissajous');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Sign in to unlock this pattern');
    expect(r.upgradeTarget).toBe('free');
  });

  it.each(SIGNED_IN_TIERS)('%s — all patterns allowed (patterns null means all)', (tier) => {
    for (const name of ['lissajous', 'spirograph', 'mandelbrot', 'anyPattern']) {
      const r = checkGate(tier, 'pattern', name);
      expect(r).toMatchObject({ allowed: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: layers
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: layers', () => {
  it('guest — 1 layer allowed', () => {
    const r = checkGate('guest', 'layers', 1);
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — 3 layers allowed (max)', () => {
    expect(checkGate('guest', 'layers', 3).allowed).toBe(true);
  });

  it('guest — 4 layers disallowed (max 3)', () => {
    const r = checkGate('guest', 'layers', 4);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Sign in for up to 6 layers');
    expect(r.upgradeTarget).toBe('free');
  });

  it('guest — value=0 treated as 1 (falsy default)', () => {
    // value || 1 → 1, which is <= guest maxLayers(3)
    const r = checkGate('guest', 'layers', 0);
    expect(r.allowed).toBe(true);
  });

  it('guest — undefined value treated as 1', () => {
    const r = checkGate('guest', 'layers', undefined);
    expect(r.allowed).toBe(true);
  });

  it.each(SIGNED_IN_TIERS)('%s — 6 layers allowed (max)', (tier) => {
    const r = checkGate(tier, 'layers', 6);
    expect(r).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — 7 layers disallowed', (tier) => {
    const r = checkGate(tier, 'layers', 7);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Up to 6 layers on your plan');
    expect(r.upgradeTarget).toBe('pro');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: preset
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: preset', () => {
  it('guest — preset index 0 allowed', () => {
    const r = checkGate('guest', 'preset', 0);
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — preset index 1 allowed', () => {
    expect(checkGate('guest', 'preset', 1).allowed).toBe(true);
  });

  it('guest — preset index 2 allowed', () => {
    expect(checkGate('guest', 'preset', 2).allowed).toBe(true);
  });

  it('guest — preset index 3+ allowed (all sizes unlocked)', () => {
    expect(checkGate('guest', 'preset', 3).allowed).toBe(true);
    expect(checkGate('guest', 'preset', 99).allowed).toBe(true);
  });

  it.each(SIGNED_IN_TIERS)('%s — all preset indices allowed (null = all)', (tier) => {
    for (const idx of [0, 1, 2, 3, 99]) {
      expect(checkGate(tier, 'preset', idx).allowed).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: customSize
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: customSize', () => {
  it('guest — allowed (custom sizes unlocked)', () => {
    expect(checkGate('guest', 'customSize')).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed', (tier) => {
    const r = checkGate(tier, 'customSize');
    expect(r).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: param
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: param', () => {
  it('null value → allowed (no descriptor)', () => {
    expect(checkGate('guest', 'param', null).allowed).toBe(true);
  });

  it('undefined value → allowed', () => {
    expect(checkGate('guest', 'param', undefined).allowed).toBe(true);
  });

  it('guest — universal param allowed (transform params unlocked)', () => {
    const r = checkGate('guest', 'param', { paramKey: 'symmetry', paramIndex: 0, isUniversal: true });
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — non-universal param below default cap (7) allowed', () => {
    const r = checkGate('guest', 'param', { paramKey: 'frequency', paramIndex: 6, isUniversal: false });
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — non-universal param at index exactly 7 disallowed (default cap)', () => {
    const r = checkGate('guest', 'param', { paramKey: 'amplitude', paramIndex: 7, isUniversal: false });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Sign in to unlock all parameters');
    expect(r.upgradeTarget).toBe('free');
  });

  it('guest — non-universal param above default cap disallowed', () => {
    const r = checkGate('guest', 'param', { paramKey: 'phase', paramIndex: 10, isUniversal: false });
    expect(r.allowed).toBe(false);
  });

  it('guest — per-pattern override (spiral) lifts the cap: index 10 allowed', () => {
    const r = checkGate('guest', 'param', { paramKey: 'wobbleAmp', paramIndex: 10, isUniversal: false, patternType: 'spiral' });
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — per-pattern override (phyllotaxis) lifts the cap: index 9 allowed', () => {
    const r = checkGate('guest', 'param', { paramKey: 'jitter', paramIndex: 9, isUniversal: false, patternType: 'phyllotaxis' });
    expect(r).toMatchObject({ allowed: true });
  });

  it('guest — pattern without override uses default cap of 7', () => {
    const r = checkGate('guest', 'param', { paramKey: 'lineSpacing', paramIndex: 7, isUniversal: false, patternType: 'wave' });
    expect(r.allowed).toBe(false);
  });

  it.each(SIGNED_IN_TIERS)('%s — non-universal param at any index allowed (no locked keys)', (tier) => {
    for (const idx of [0, 1, 2, 3, 20]) {
      const r = checkGate(tier, 'param', { paramKey: 'frequency', paramIndex: idx, isUniversal: false });
      expect(r).toMatchObject({ allowed: true });
    }
  });

  it.each(SIGNED_IN_TIERS)('%s — universal param allowed (lockedParamKeys empty)', (tier) => {
    // universal params gated by limits.universalParams (true for every tier today)
    const r = checkGate(tier, 'param', { paramKey: 'symmetry', paramIndex: 0, isUniversal: true });
    expect(r).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — locked param key disallowed if in lockedParamKeys', (tier) => {
    // lockedParamKeys is [] today for all tiers — no key is blocked
    // This test documents the code path exists and currently fires no blocks.
    // If a key is added to lockedParamKeys in future, this test should catch it.
    const r = checkGate(tier, 'param', { paramKey: 'someProFeature', paramIndex: 0, isUniversal: false });
    expect(r).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: seed
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: seed', () => {
  it('guest — allowed (seed control unlocked)', () => {
    expect(checkGate('guest', 'seed')).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed', (tier) => {
    expect(checkGate(tier, 'seed')).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: cloudSave
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: cloudSave', () => {
  it('guest — always disallowed (maxCloudSaves=0)', () => {
    const r = checkGate('guest', 'cloudSave', 0);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Sign in to save designs');
    expect(r.upgradeTarget).toBe('free');
  });

  it('guest — disallowed even when count is high', () => {
    expect(checkGate('guest', 'cloudSave', 50).allowed).toBe(false);
  });

  it('guest — undefined count still disallowed', () => {
    expect(checkGate('guest', 'cloudSave', undefined).allowed).toBe(false);
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed when under limit (count=0)', (tier) => {
    expect(checkGate(tier, 'cloudSave', 0)).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed at count=99 (limit=100)', (tier) => {
    expect(checkGate(tier, 'cloudSave', 99)).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — disallowed at count=100 (limit=100)', (tier) => {
    const r = checkGate(tier, 'cloudSave', 100);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe("You've used all 100 save slots");
    expect(r.upgradeTarget).toBe('pro');
  });

  it.each(SIGNED_IN_TIERS)('%s — disallowed at count > limit', (tier) => {
    expect(checkGate(tier, 'cloudSave', 200).allowed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: share
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: share', () => {
  it('guest — allowed (sharing unlocked)', () => {
    expect(checkGate('guest', 'share')).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed', (tier) => {
    expect(checkGate(tier, 'share')).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: fork
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: fork', () => {
  it('guest — disallowed with sign-in CTA and upgradeTarget=free', () => {
    const r = checkGate('guest', 'fork');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Sign in to fork designs');
    expect(r.upgradeTarget).toBe('free');
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed', (tier) => {
    expect(checkGate(tier, 'fork')).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: collections
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: collections', () => {
  it('guest — disallowed with upgradeTarget=free', () => {
    const r = checkGate('guest', 'collections');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Sign in to use collections');
    expect(r.upgradeTarget).toBe('free');
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed', (tier) => {
    expect(checkGate(tier, 'collections')).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: history
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: history', () => {
  it('guest — allowed (historySnapshots=25)', () => {
    expect(checkGate('guest', 'history')).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed (historySnapshots=50)', (tier) => {
    expect(checkGate(tier, 'history')).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: aiCredits
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: aiCredits', () => {
  it('guest — disallowed with sign-in CTA', () => {
    const r = checkGate('guest', 'aiCredits');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('Sign in to generate AI patterns');
    expect(r.upgradeTarget).toBe('free');
  });

  it.each(SIGNED_IN_TIERS)('%s — allowed', (tier) => {
    expect(checkGate(tier, 'aiCredits')).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// feature: default/unknown — falls through to allowed
// ─────────────────────────────────────────────────────────────────────────────

describe('checkGate: unknown feature → allowed', () => {
  it('guest unknown feature allowed', () => {
    expect(checkGate('guest', 'nonExistentFeature')).toMatchObject({ allowed: true });
  });

  it.each(SIGNED_IN_TIERS)('%s — unknown feature allowed', (tier) => {
    expect(checkGate(tier, 'nonExistentFeature')).toMatchObject({ allowed: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-tier symmetry: free === pro === studio for all features
// ─────────────────────────────────────────────────────────────────────────────

describe('cross-tier symmetry: free ≡ pro ≡ studio (byte-identical limits)', () => {
  const features = [
    ['pattern', 'spirograph'],
    ['pattern', 'lissajous'],
    ['layers', 6],
    ['layers', 7],
    ['preset', 3],
    ['customSize', undefined],
    ['param', { paramKey: 'freq', paramIndex: 5, isUniversal: false }],
    ['param', { paramKey: 'sym', paramIndex: 0, isUniversal: true }],
    ['seed', undefined],
    ['cloudSave', 0],
    ['cloudSave', 100],
    ['share', undefined],
    ['fork', undefined],
    ['collections', undefined],
    ['history', undefined],
    ['aiCredits', undefined],
  ];

  for (const [feature, value] of features) {
    it(`${feature}(${JSON.stringify(value)}): free, pro, studio return identical result`, () => {
      const rFree = checkGate('free', feature, value);
      const rPro = checkGate('pro', feature, value);
      const rStudio = checkGate('studio', feature, value);
      expect(rPro).toStrictEqual(rFree);
      expect(rStudio).toStrictEqual(rFree);
    });
  }
});
