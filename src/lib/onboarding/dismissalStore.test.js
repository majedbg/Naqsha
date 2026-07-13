// Guest onboarding — dismissal store (D3, D18). Per-tab sessionStorage so a
// fresh page load (= next shared-machine attendee) re-shows onboarding, but a
// dismiss within the same tab sticks until an explicit "New session" reset
// (P0-C). Never a cross-person store (never localStorage).
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isOnboardingDismissed,
  setOnboardingDismissed,
  resetOnboardingSession,
} from './dismissalStore';

describe('onboarding dismissal store (S1)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to not dismissed', () => {
    expect(isOnboardingDismissed()).toBe(false);
  });

  it('setOnboardingDismissed(true) then isOnboardingDismissed() reads back true', () => {
    setOnboardingDismissed(true);
    expect(isOnboardingDismissed()).toBe(true);
  });

  it('setOnboardingDismissed(false) clears it back', () => {
    setOnboardingDismissed(true);
    setOnboardingDismissed(false);
    expect(isOnboardingDismissed()).toBe(false);
  });

  it('resetOnboardingSession() clears a dismissed flag ("New session" reset, P0-C)', () => {
    setOnboardingDismissed(true);
    expect(isOnboardingDismissed()).toBe(true);
    resetOnboardingSession();
    expect(isOnboardingDismissed()).toBe(false);
  });

  it('uses sessionStorage, not localStorage (D3 — never a cross-person store)', () => {
    setOnboardingDismissed(true);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it('falls back safely when sessionStorage access throws (SSR/private-mode safe)', () => {
    const getter = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('sessionStorage unavailable');
    });

    expect(() => setOnboardingDismissed(true)).not.toThrow();
    expect(() => isOnboardingDismissed()).not.toThrow();
    expect(() => resetOnboardingSession()).not.toThrow();

    getter.mockRestore();
  });
});
