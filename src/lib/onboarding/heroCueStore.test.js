// Guest onboarding — "hero cue seen" store (D6/D21, S3). Per-tab, per-pattern
// -type sessionStorage flag so the drag-me cue never re-pulses once the aha
// has landed for a given starter, but a different (unseen) starter still
// cues normally.
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { isHeroCueSeen, markHeroCueSeen } from './heroCueStore';

describe('heroCueStore (S3)', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to not seen for an untouched pattern type', () => {
    expect(isHeroCueSeen('phyllotaxis')).toBe(false);
  });

  it('markHeroCueSeen then isHeroCueSeen reads back true for that pattern type', () => {
    markHeroCueSeen('phyllotaxis');
    expect(isHeroCueSeen('phyllotaxis')).toBe(true);
  });

  it('is keyed per pattern type — marking one does not mark another', () => {
    markHeroCueSeen('phyllotaxis');
    expect(isHeroCueSeen('recursive')).toBe(false);
    expect(isHeroCueSeen('topographic')).toBe(false);
  });

  it('uses sessionStorage, not localStorage (never a cross-person store)', () => {
    markHeroCueSeen('phyllotaxis');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it('falls back safely when sessionStorage access throws (SSR/private-mode safe)', () => {
    const getter = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('sessionStorage unavailable');
    });

    expect(() => markHeroCueSeen('phyllotaxis')).not.toThrow();
    expect(() => isHeroCueSeen('phyllotaxis')).not.toThrow();

    getter.mockRestore();
  });

  it('handles a nullish pattern type without throwing', () => {
    expect(isHeroCueSeen(undefined)).toBe(false);
    expect(() => markHeroCueSeen(undefined)).not.toThrow();
  });
});
