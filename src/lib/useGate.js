import { useCallback } from 'react';
import { useAuth } from './AuthContext';
import { checkGate, TIER_LIMITS } from './tierLimits';

export function useGate() {
  const { tier, loading, user } = useAuth();

  const check = useCallback(
    (feature, value) => checkGate(tier, feature, value),
    [tier]
  );

  const limits = TIER_LIMITS[tier] || TIER_LIMITS.guest;

  // `loading`/`user` are passed through (not just `tier`) so a consumer that
  // needs the STRICT "resolved guest" check — `!loading && !user && tier ===
  // 'guest'` (guest onboarding S1/S2/S3: getEffectiveTier in AuthContext.jsx
  // returns 'guest' for a signed-in user whose profile hasn't hydrated yet)
  // — can build it from this one hook, instead of reaching past useGate into
  // useAuth directly. Existing consumers that only destructure
  // `{ tier, check, limits }` are unaffected.
  return { tier, check, limits, loading, user };
}
