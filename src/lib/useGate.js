import { useCallback } from 'react';
import { useAuth } from './AuthContext';
import { checkGate, TIER_LIMITS } from './tierLimits';

export function useGate() {
  const { tier } = useAuth();

  const check = useCallback(
    (feature, value) => checkGate(tier, feature, value),
    [tier]
  );

  const limits = TIER_LIMITS[tier] || TIER_LIMITS.guest;

  return { tier, check, limits };
}
