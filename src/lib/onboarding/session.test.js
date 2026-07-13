// Guest onboarding — P0-C "New session / hand to next person" reset (D18).
// `resetAllOnboarding` composes every per-tab onboarding store's own reset,
// so a single call clears the full first-run flag set.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { resetAllOnboarding } from './session';
import { isOnboardingDismissed, setOnboardingDismissed } from './dismissalStore';
import { isHeroCueSeen, markHeroCueSeen } from './heroCueStore';
import { isLensTipSeen, markLensTipSeen } from './lensTipStore';
import { isModulationNudgeSeen, markModulationNudgeSeen } from './modulationNudgeStore';

describe('resetAllOnboarding (P0-C)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('clears every onboarding store flag in one call', () => {
    // Arrange: set every flag this store composes.
    setOnboardingDismissed(true);
    markHeroCueSeen('phyllotaxis');
    markHeroCueSeen('recursive');
    markHeroCueSeen('topographic');
    markLensTipSeen();
    markModulationNudgeSeen();

    expect(isOnboardingDismissed()).toBe(true);
    expect(isHeroCueSeen('phyllotaxis')).toBe(true);
    expect(isHeroCueSeen('recursive')).toBe(true);
    expect(isHeroCueSeen('topographic')).toBe(true);
    expect(isLensTipSeen()).toBe(true);
    expect(isModulationNudgeSeen()).toBe(true);

    resetAllOnboarding();

    expect(isOnboardingDismissed()).toBe(false);
    expect(isHeroCueSeen('phyllotaxis')).toBe(false);
    expect(isHeroCueSeen('recursive')).toBe(false);
    expect(isHeroCueSeen('topographic')).toBe(false);
    expect(isLensTipSeen()).toBe(false);
    expect(isModulationNudgeSeen()).toBe(false);
  });

  it('leaves nothing behind in sessionStorage after a reset (no orphaned keys)', () => {
    setOnboardingDismissed(true);
    markHeroCueSeen('phyllotaxis');
    markHeroCueSeen('recursive');
    markLensTipSeen();
    markModulationNudgeSeen();

    resetAllOnboarding();

    expect(sessionStorage.length).toBe(0);
  });

  it('is a no-op-safe call when nothing was ever set', () => {
    expect(() => resetAllOnboarding()).not.toThrow();
    expect(isOnboardingDismissed()).toBe(false);
    expect(isHeroCueSeen('phyllotaxis')).toBe(false);
    expect(isLensTipSeen()).toBe(false);
    expect(isModulationNudgeSeen()).toBe(false);
  });

  it('never writes to localStorage (per-tab only — never a cross-person store, D18)', () => {
    setOnboardingDismissed(true);
    markHeroCueSeen('phyllotaxis');
    markLensTipSeen();
    markModulationNudgeSeen();

    resetAllOnboarding();

    expect(localStorage.length).toBe(0);
  });
});
