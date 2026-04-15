// Single source of truth for all tier restrictions.
// Every feature gate in the app reads from this object.

export const TIER_LIMITS = {
  guest: {
    patterns: ['spirograph', 'flowfield', 'phyllotaxis', 'recursive'],
    maxLayers: 1,
    presetIndices: [0, 1, 2],       // 6x12, 12x12, 12x18
    allowCustomSize: false,
    maxParamsPerPattern: 3,          // first 3 non-universal params shown
    lockedParamKeys: [],             // (guest uses maxParamsPerPattern instead)
    seedVisible: false,
    seedEditable: false,
    svgMetadata: true,               // <!-- generativearts.studio -->
    maxCloudSaves: 0,
    canShare: false,
    canFork: false,
    localStorage: false,
    collections: false,
    historySnapshots: 0,
    aiCredits: false,             // no AI access
  },
  // Free tier = full creative product. The only scarce resource is the AI
  // credit balance (enforced by the deduct_ai_credits RPC). Pro / Studio
  // remain in this file as the landing pad for any future paid upgrade.
  free: {
    patterns: null,                  // null = all patterns
    maxLayers: 6,
    presetIndices: null,
    allowCustomSize: true,
    maxParamsPerPattern: Infinity,
    lockedParamKeys: [],
    seedVisible: true,
    seedEditable: true,
    svgMetadata: false,
    maxCloudSaves: 100,
    canShare: true,
    canFork: true,
    localStorage: true,
    collections: true,
    historySnapshots: 50,
    aiCredits: true,              // capped at 24 credits per account (see migration 003)
  },
  pro: {
    patterns: null,                  // null = all patterns
    maxLayers: 6,
    presetIndices: null,
    allowCustomSize: true,
    maxParamsPerPattern: Infinity,
    lockedParamKeys: [],
    seedVisible: true,
    seedEditable: true,
    svgMetadata: false,
    maxCloudSaves: 100,
    canShare: true,
    canFork: true,
    localStorage: true,
    collections: true,
    historySnapshots: 50,
    aiCredits: true,              // credit-based AI (36 on signup, purchasable)
  },
  studio: {
    patterns: null,
    maxLayers: 6,
    presetIndices: null,
    allowCustomSize: true,
    maxParamsPerPattern: Infinity,
    lockedParamKeys: [],
    seedVisible: true,
    seedEditable: true,
    svgMetadata: false,
    maxCloudSaves: 100,
    canShare: true,
    canFork: true,
    localStorage: true,
    collections: true,
    historySnapshots: 50,
    aiCredits: true,              // credit-based AI (36 on signup, purchasable)
  },
};

// Universal param keys that are always hidden for guests
// (they appear at the end of every pattern's param defs)
export const UNIVERSAL_PARAM_KEYS = ['symmetry', 'startAngle', 'offsetX', 'offsetY'];

/**
 * Check whether a feature is allowed for the given tier.
 * Returns { allowed, reason, upgradeTarget }.
 */
export function checkGate(tier, feature, value) {
  const limits = TIER_LIMITS[tier] || TIER_LIMITS.guest;

  switch (feature) {
    case 'pattern': {
      if (limits.patterns === null) return { allowed: true };
      const allowed = limits.patterns.includes(value);
      return {
        allowed,
        reason: allowed ? null : (tier === 'guest' ? 'Sign in to unlock this pattern' : 'Upgrade to Pro'),
        upgradeTarget: tier === 'guest' ? 'free' : 'pro',
      };
    }

    case 'layers': {
      const count = value || 1;
      const allowed = count <= limits.maxLayers;
      // Post-flatten only guests can trip this; signed-in users have 6 layers.
      return {
        allowed,
        reason: allowed
          ? null
          : tier === 'guest'
            ? `Sign in for up to 6 layers`
            : `Up to ${limits.maxLayers} layer${limits.maxLayers === 1 ? '' : 's'} on your plan`,
        upgradeTarget: tier === 'guest' ? 'free' : 'pro',
      };
    }

    case 'preset': {
      if (limits.presetIndices === null) return { allowed: true };
      const allowed = limits.presetIndices.includes(value);
      return {
        allowed,
        reason: allowed ? null : 'Sign in to unlock all sizes',
        upgradeTarget: 'free',
      };
    }

    case 'customSize':
      return {
        allowed: limits.allowCustomSize,
        reason: limits.allowCustomSize ? null : 'Sign in to use custom sizes',
        upgradeTarget: 'free',
      };

    case 'param': {
      // value = { paramKey, paramIndex, isUniversal }
      if (!value) return { allowed: true };
      // Universal params hidden for guests
      if (tier === 'guest' && value.isUniversal) {
        return { allowed: false, reason: 'Sign in to unlock', upgradeTarget: 'free' };
      }
      // Guest: first N non-universal params only
      if (tier === 'guest' && value.paramIndex >= limits.maxParamsPerPattern) {
        return { allowed: false, reason: 'Sign in to unlock all parameters', upgradeTarget: 'free' };
      }
      // Free/Pro: check locked param keys
      if (limits.lockedParamKeys.includes(value.paramKey)) {
        return { allowed: false, reason: 'Pro feature', upgradeTarget: 'pro' };
      }
      return { allowed: true };
    }

    case 'seed':
      return {
        allowed: limits.seedVisible,
        reason: limits.seedVisible ? null : 'Sign in to control seeds',
        upgradeTarget: 'free',
      };

    case 'cloudSave': {
      const count = value || 0;
      if (limits.maxCloudSaves === 0) {
        return { allowed: false, reason: 'Sign in to save designs', upgradeTarget: 'free' };
      }
      const allowed = count < limits.maxCloudSaves;
      return {
        allowed,
        reason: allowed ? null : `You've used all ${limits.maxCloudSaves} save slots`,
        upgradeTarget: 'pro',
      };
    }

    case 'share':
      return {
        allowed: limits.canShare,
        reason: limits.canShare ? null : 'Sign in to share designs',
        upgradeTarget: 'free',
      };

    // Post-flatten, these only block guests (signed-in users have them all).
    // Point upgradeTarget at 'free' for guests so the UpgradePrompt renders
    // a sign-in CTA instead of a dead-end "Upgrade to Pro" button.
    case 'fork':
      return {
        allowed: limits.canFork,
        reason: limits.canFork ? null : 'Sign in to fork designs',
        upgradeTarget: tier === 'guest' ? 'free' : 'pro',
      };

    case 'collections':
      return {
        allowed: limits.collections,
        reason: limits.collections ? null : 'Sign in to use collections',
        upgradeTarget: tier === 'guest' ? 'free' : 'pro',
      };

    case 'history':
      return {
        allowed: limits.historySnapshots > 0,
        reason: limits.historySnapshots > 0 ? null : 'Sign in for design history',
        upgradeTarget: tier === 'guest' ? 'free' : 'pro',
      };

    case 'aiCredits':
      return {
        allowed: !!limits.aiCredits,
        reason: limits.aiCredits ? null : 'Sign in to generate AI patterns',
        upgradeTarget: tier === 'guest' ? 'free' : 'pro',
      };

    default:
      return { allowed: true };
  }
}
