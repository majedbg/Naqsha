// claimOnLogin.test.js — Phase 3 login-wiring layer (TDD).
// Unit-tests the client-side verified-email gate + once-per-session claim guard.
// membershipService is mocked; module is re-imported per test so the module-level
// dedupe Set does not bleed across `it()` blocks.

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./membershipService', () => ({
  claimOnLogin: vi.fn(),
}));

import { claimOnLogin } from './membershipService';

let maybeClaimOnLogin;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  // Re-import so the module-level "claimed" Set is fresh each test.
  ({ maybeClaimOnLogin } = await import('./claimOnLogin'));
});

const verifiedSession = (id = 'user-1') => ({
  user: { id, email: 'a@b.com', email_confirmed_at: '2026-06-19T00:00:00Z' },
});

// ─── Behavior 1 (TRACER) ─────────────────────────────────────────────────────
describe('maybeClaimOnLogin — tracer', () => {
  it('a verified-email session triggers claimOnLogin() exactly once', async () => {
    claimOnLogin.mockResolvedValueOnce(undefined);
    await maybeClaimOnLogin(verifiedSession());
    expect(claimOnLogin).toHaveBeenCalledTimes(1);
  });
});

// ─── Behavior 2 ──────────────────────────────────────────────────────────────
describe('maybeClaimOnLogin — unverified gate', () => {
  it('an unverified-email session does NOT call claim', async () => {
    const session = { user: { id: 'user-2', email: 'a@b.com', email_confirmed_at: null } };
    const result = await maybeClaimOnLogin(session);
    expect(claimOnLogin).not.toHaveBeenCalled();
    expect(result.claimed).toBe(false);
  });
});

// ─── Behavior 3 ──────────────────────────────────────────────────────────────
describe('maybeClaimOnLogin — no session', () => {
  it('a null session does not call claim', async () => {
    const result = await maybeClaimOnLogin(null);
    expect(claimOnLogin).not.toHaveBeenCalled();
    expect(result.claimed).toBe(false);
  });
});

// ─── Behavior 4 ──────────────────────────────────────────────────────────────
describe('maybeClaimOnLogin — idempotent', () => {
  it('does not re-trigger claim for the same session', async () => {
    claimOnLogin.mockResolvedValue(undefined);
    const session = verifiedSession('user-4');
    const first = await maybeClaimOnLogin(session);
    const second = await maybeClaimOnLogin(session);
    expect(claimOnLogin).toHaveBeenCalledTimes(1);
    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    expect(second.alreadyClaimed).toBe(true);
  });
});

// ─── Behavior 5 ──────────────────────────────────────────────────────────────
describe('maybeClaimOnLogin — error handling', () => {
  it('returns the error instead of throwing, and allows a retry', async () => {
    const boom = new Error('rpc failed');
    claimOnLogin.mockRejectedValueOnce(boom).mockResolvedValueOnce(undefined);
    const session = verifiedSession('user-5');

    const failed = await maybeClaimOnLogin(session);
    expect(failed.claimed).toBe(false);
    expect(failed.error).toBe(boom);

    // un-marked on error → next auth event retries and succeeds
    const retry = await maybeClaimOnLogin(session);
    expect(retry.claimed).toBe(true);
    expect(claimOnLogin).toHaveBeenCalledTimes(2);
  });
});
