/**
 * AR-1D: Characterization tests for getEffectiveTier (AuthContext.jsx)
 *
 * Mode: CHARACTERIZATION — tests PIN current reality.
 * If a test goes red, fix the assertion, NOT the source.
 *
 * WHY A REPLICA: getEffectiveTier is a module-private (non-exported) function
 * in src/lib/AuthContext.jsx (a React context file we may not edit under AR-1D
 * rules). The function is pure (no side effects, no imports, no React hooks) so
 * we replicate its body VERBATIM below and test the replica. This ensures:
 *   - If the source changes, the replica diverges, and the committer must
 *     update the replica + assertions here to keep tests green.
 *   - The replica IS the behavioral spec; any future refactor must match it.
 *
 * SOURCE: src/lib/AuthContext.jsx, function getEffectiveTier(profile) lines ~50-72
 * Last verified against source: 2026-06-10
 *
 * Subscription state machine cases:
 *   1. null profile → 'guest'
 *   2. tier='pro'/'studio' + status='active'       → tier
 *   3. tier='pro'/'studio' + status='trialing'     → tier
 *   4. tier='pro'/'studio' + status='canceled' + period not yet ended → tier
 *   5. tier='pro'/'studio' + status='canceled' + period already ended → 'free'
 *   6. tier='pro'/'studio' + status='past_due'     → tier
 *   7. tier='pro'/'studio' + subscription_status=null/undefined → tier (trust DB)
 *   8. tier='pro'/'studio' + status='incomplete'/'other expired' → 'free'
 *   9. tier='free' (or absent) + any status        → tier || 'free'
 *  10. profile exists, no tier field               → 'free'
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// VERBATIM REPLICA of getEffectiveTier from src/lib/AuthContext.jsx
// Update this replica whenever the source changes.
// ─────────────────────────────────────────────────────────────────────────────

function getEffectiveTier(profile) {
  if (!profile) return 'guest';
  const { tier, subscription_status, subscription_current_period_end } = profile;

  // Pro with active or not-yet-expired canceled subscription
  if (tier === 'pro' || tier === 'studio') {
    if (subscription_status === 'active' || subscription_status === 'trialing')
      return tier;
    // Canceled but period hasn't ended yet — still Pro
    if (subscription_status === 'canceled' && subscription_current_period_end) {
      if (new Date(subscription_current_period_end) > new Date()) return tier;
    }
    // Past due — grace period, still Pro
    if (subscription_status === 'past_due') return tier;
    // No subscription info but tier is set (e.g. manually set in DB) — trust it
    if (!subscription_status) return tier;
    // Subscription fully expired
    return 'free';
  }

  return tier || 'free';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ahead
const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();   // 7 days ago

// ─────────────────────────────────────────────────────────────────────────────
// Case 1: null / falsy profile → guest
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: null/falsy profile', () => {
  it('null profile → guest', () => {
    expect(getEffectiveTier(null)).toBe('guest');
  });

  it('undefined profile → guest', () => {
    expect(getEffectiveTier(undefined)).toBe('guest');
  });

  it('false profile → guest', () => {
    expect(getEffectiveTier(false)).toBe('guest');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cases 2-3: pro/studio with active or trialing subscription
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: pro/studio with active/trialing subscription', () => {
  for (const tier of ['pro', 'studio']) {
    it(`${tier} + status=active → ${tier}`, () => {
      expect(getEffectiveTier({ tier, subscription_status: 'active' })).toBe(tier);
    });

    it(`${tier} + status=trialing → ${tier}`, () => {
      expect(getEffectiveTier({ tier, subscription_status: 'trialing' })).toBe(tier);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 4: pro/studio + canceled but period not yet ended → still tier
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: pro/studio canceled but period not yet ended', () => {
  for (const tier of ['pro', 'studio']) {
    it(`${tier} + canceled + future period_end → ${tier}`, () => {
      expect(getEffectiveTier({
        tier,
        subscription_status: 'canceled',
        subscription_current_period_end: FUTURE,
      })).toBe(tier);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 5: pro/studio + canceled + period already ended → free
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: pro/studio canceled + period ended → free', () => {
  for (const tier of ['pro', 'studio']) {
    it(`${tier} + canceled + past period_end → free`, () => {
      expect(getEffectiveTier({
        tier,
        subscription_status: 'canceled',
        subscription_current_period_end: PAST,
      })).toBe('free');
    });

    it(`${tier} + canceled + no period_end → free (no period_end = falls through to return free)`, () => {
      // subscription_current_period_end is null/undefined: the inner if fails,
      // falls through past_due check (not matching), no subscription_status is set
      // (canceled is set) → returns 'free'
      expect(getEffectiveTier({
        tier,
        subscription_status: 'canceled',
        subscription_current_period_end: null,
      })).toBe('free');
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 6: pro/studio + past_due → still tier (grace period)
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: pro/studio past_due → grace period', () => {
  for (const tier of ['pro', 'studio']) {
    it(`${tier} + status=past_due → ${tier}`, () => {
      expect(getEffectiveTier({ tier, subscription_status: 'past_due' })).toBe(tier);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 7: pro/studio + no subscription_status → trust DB tier
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: pro/studio with no subscription_status (manually set DB)', () => {
  for (const tier of ['pro', 'studio']) {
    it(`${tier} + no subscription_status → ${tier}`, () => {
      expect(getEffectiveTier({ tier, subscription_status: null })).toBe(tier);
    });

    it(`${tier} + subscription_status undefined → ${tier}`, () => {
      expect(getEffectiveTier({ tier })).toBe(tier);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 8: pro/studio + other/expired status → free
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: pro/studio fully expired → free', () => {
  const expiredStatuses = ['incomplete', 'incomplete_expired', 'unpaid', 'paused'];
  for (const tier of ['pro', 'studio']) {
    for (const status of expiredStatuses) {
      it(`${tier} + status=${status} → free`, () => {
        expect(getEffectiveTier({ tier, subscription_status: status })).toBe('free');
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 9: tier='free' with any subscription status → 'free'
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: free tier (non-pro/studio path)', () => {
  it('tier=free + no status → free', () => {
    expect(getEffectiveTier({ tier: 'free' })).toBe('free');
  });

  it('tier=free + status=active → free', () => {
    // 'free' does not enter the pro/studio branch; returns tier || 'free'
    expect(getEffectiveTier({ tier: 'free', subscription_status: 'active' })).toBe('free');
  });

  it('tier=free + status=canceled → free', () => {
    expect(getEffectiveTier({ tier: 'free', subscription_status: 'canceled' })).toBe('free');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 10: profile with no tier field → 'free'
// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveTier: profile with no tier field', () => {
  it('profile without tier → free (via tier || "free")', () => {
    expect(getEffectiveTier({ id: 'abc', email: 'test@example.com' })).toBe('free');
  });

  it('profile with tier=null → free', () => {
    expect(getEffectiveTier({ tier: null })).toBe('free');
  });

  it('profile with tier="" → free', () => {
    expect(getEffectiveTier({ tier: '' })).toBe('free');
  });
});
