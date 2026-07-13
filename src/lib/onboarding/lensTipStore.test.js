// Guest onboarding S5 — Operation lens discoverability tip "seen" store
// (D13/D17). Per-tab sessionStorage flag so the lens tip never re-shows once
// a guest has engaged the lens switch or manually dismissed the tip.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { isLensTipSeen, markLensTipSeen } from './lensTipStore';

describe('lensTipStore (S5)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to not seen', () => {
    expect(isLensTipSeen()).toBe(false);
  });

  it('markLensTipSeen then isLensTipSeen reads back true', () => {
    markLensTipSeen();
    expect(isLensTipSeen()).toBe(true);
  });

  it('uses sessionStorage, not localStorage (never a cross-person store)', () => {
    markLensTipSeen();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it('falls back safely when sessionStorage access throws (SSR/private-mode safe)', () => {
    const getter = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('sessionStorage unavailable');
    });

    expect(() => markLensTipSeen()).not.toThrow();
    expect(() => isLensTipSeen()).not.toThrow();
    expect(isLensTipSeen()).toBe(true); // memory fallback still recorded the mark

    getter.mockRestore();
  });
});
