// Guest onboarding S6 — modulation nudge "seen" store (D17a/D22). Per-tab
// sessionStorage flag so the nudge fires at most once per session.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isModulationNudgeSeen,
  markModulationNudgeSeen,
  resetModulationNudgeSession,
} from './modulationNudgeStore';

describe('modulationNudgeStore (S6)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to not seen', () => {
    expect(isModulationNudgeSeen()).toBe(false);
  });

  it('markModulationNudgeSeen then isModulationNudgeSeen reads back true', () => {
    markModulationNudgeSeen();
    expect(isModulationNudgeSeen()).toBe(true);
  });

  it('uses sessionStorage, not localStorage (never a cross-person store)', () => {
    markModulationNudgeSeen();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it('falls back safely when sessionStorage access throws (SSR/private-mode safe)', () => {
    const getter = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('sessionStorage unavailable');
    });

    expect(() => markModulationNudgeSeen()).not.toThrow();
    expect(() => isModulationNudgeSeen()).not.toThrow();
    expect(isModulationNudgeSeen()).toBe(true); // memory fallback still recorded the mark

    getter.mockRestore();
  });

  it('resetModulationNudgeSession() clears a seen flag ("New session" reset, P0-C)', () => {
    markModulationNudgeSeen();
    expect(isModulationNudgeSeen()).toBe(true);
    resetModulationNudgeSession();
    expect(isModulationNudgeSeen()).toBe(false);
  });

  it('resetModulationNudgeSession() does not throw when sessionStorage access throws, and clears the memory fallback', () => {
    const getter = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('sessionStorage unavailable');
    });

    expect(() => markModulationNudgeSeen()).not.toThrow();
    expect(isModulationNudgeSeen()).toBe(true);

    expect(() => resetModulationNudgeSession()).not.toThrow();
    expect(isModulationNudgeSeen()).toBe(false);

    getter.mockRestore();
  });
});
