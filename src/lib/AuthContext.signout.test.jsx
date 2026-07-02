// @vitest-environment jsdom
//
// S1 review follow-up (issue #50): signing out must clear the previous
// account's extracted patterns from BOTH library surfaces (module-global
// libraryStore + dynamic registry) so a second user on a shared browser never
// sees the first user's entries. AI/builtin dynamic patterns follow their own
// (pre-existing) lifecycle and must NOT be touched.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

const authState = vi.hoisted(() => ({ callbacks: [] }));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb) => {
        authState.callbacks.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

vi.mock('./org/claimOnLogin', () => ({ maybeClaimOnLogin: vi.fn() }));

import { AuthProvider } from './AuthContext';
import { makeExtractedPattern } from './extraction/extractedPattern';
import { registerExtractedPattern } from './patterns/ExtractedPatternGenerator';
import {
  registerPattern,
  getDynamicPatternClass,
  unregisterPattern,
} from './patternRegistry';
import { getLibraryEntries, clearLibraryEntries } from './libraryStore';

const entity = (patternId) =>
  makeExtractedPattern({
    patternId,
    title: 'User A tile',
    tile: {
      width: 20,
      height: 20,
      fills: [{ d: 'M2 2 L18 2 L18 18 L2 18 Z', role: 'engrave' }],
      strokes: [],
    },
  });

class FakeDynamic {}

beforeEach(() => {
  authState.callbacks.length = 0;
  clearLibraryEntries();
});

afterEach(() => {
  clearLibraryEntries();
  ['extracted-signout-a', 'ai-signout-keep'].forEach(unregisterPattern);
});

describe('AuthContext — SIGNED_OUT clears the extracted library (both surfaces)', () => {
  it('drops extracted patterns from store + registry on SIGNED_OUT, keeping AI ones', async () => {
    render(<AuthProvider>x</AuthProvider>);
    expect(authState.callbacks.length).toBeGreaterThan(0);

    registerExtractedPattern(entity('extracted-signout-a'));
    registerPattern('ai-signout-keep', FakeDynamic, 'AI Keep', {}, []);
    expect(getLibraryEntries()).toHaveLength(1);

    await act(async () => {
      await authState.callbacks[0]('SIGNED_OUT', null);
    });

    expect(getLibraryEntries()).toEqual([]);
    expect(getDynamicPatternClass('extracted-signout-a')).toBeNull();
    expect(getDynamicPatternClass('ai-signout-keep')).toBeTruthy();
  });

  it('does NOT clear a guest session on non-signout null-session events (INITIAL_SESSION)', async () => {
    render(<AuthProvider>x</AuthProvider>);
    registerExtractedPattern(entity('extracted-signout-a'));

    await act(async () => {
      await authState.callbacks[0]('INITIAL_SESSION', null);
    });

    // A guest's session-only extraction survives the initial (no-session)
    // auth event — only a real sign-out clears it (never a dead end).
    expect(getLibraryEntries()).toHaveLength(1);
    expect(getDynamicPatternClass('extracted-signout-a')).toBeTruthy();
  });
});
