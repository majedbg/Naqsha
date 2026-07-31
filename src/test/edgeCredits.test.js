// edgeCredits.test.js — issue #216 / adversarial review §B1
//
// Unit tests for the generate-pattern edge function's credit module. The edge
// runtime has no test harness in this repo, so the deduct / refund / pricing
// logic is extracted into a Deno-free module and exercised here. The module
// imports nothing from Deno and takes its supabase client by injection, which
// is what makes this cross-boundary import work under vitest.

import { describe, it, expect, vi } from 'vitest';
import {
  CREDIT_COST_NEW,
  CREDIT_COST_REVISION,
  INSUFFICIENT_CREDITS,
  creditCostFor,
  deductCredits,
  refundCredits,
  looksLikePatternSource,
} from '../../supabase/functions/generate-pattern/credits.ts';
import { CREDIT_COST_NEW as CLIENT_COST_NEW, CREDIT_COST_REVISION as CLIENT_COST_REVISION } from '../lib/creditModel';

/** Minimal service-role client stub: one rpc() that records its calls. */
function makeAdmin(result = { data: 10, error: null }) {
  return { rpc: vi.fn(() => Promise.resolve(result)) };
}

// ─── Pricing ────────────────────────────────────────────────────────────────
describe('creditCostFor — the server prices the request', () => {
  it('mirrors the client credit model so the UI quotes what the server charges', () => {
    expect(CREDIT_COST_NEW).toBe(CLIENT_COST_NEW);
    expect(CREDIT_COST_REVISION).toBe(CLIENT_COST_REVISION);
  });

  it('charges the revision price for revise/revision', () => {
    expect(creditCostFor('revise')).toBe(CREDIT_COST_REVISION);
    expect(creditCostFor('revision')).toBe(CREDIT_COST_REVISION);
  });

  it('charges the new-pattern price for create', () => {
    expect(creditCostFor('create')).toBe(CREDIT_COST_NEW);
  });

  it('never gets cheaper for an unknown or missing mode', () => {
    for (const mode of [undefined, null, '', 'free', 'REVISE', 'revise ', 0, {}]) {
      expect(creditCostFor(mode)).toBe(CREDIT_COST_NEW);
    }
  });
});

// ─── Deduction ──────────────────────────────────────────────────────────────
describe('deductCredits', () => {
  it('deducts via the service-role RPC and reports the new balance', async () => {
    const admin = makeAdmin({ data: 8, error: null });
    const out = await deductCredits(admin, 'user-1', 4);

    expect(out).toEqual({ ok: true, remaining: 8 });
    expect(admin.rpc).toHaveBeenCalledWith('deduct_ai_credits_for', {
      p_user_id: 'user-1',
      p_amount: 4,
    });
  });

  it('never calls the client-callable deduct_ai_credits RPC', async () => {
    const admin = makeAdmin({ data: 8, error: null });
    await deductCredits(admin, 'user-1', 12);
    const names = admin.rpc.mock.calls.map(([name]) => name);
    expect(names).not.toContain('deduct_ai_credits');
    expect(names).not.toContain('add_ai_credits');
  });

  it('maps the -1 sentinel to an insufficient-credits outcome', async () => {
    const out = await deductCredits(makeAdmin({ data: -1, error: null }), 'user-1', 12);
    expect(out).toEqual({ ok: false, reason: INSUFFICIENT_CREDITS });
  });

  // GUARD: a negative amount is the mint primitive #216 removed. It must not
  // even reach the database (the RPC rejects it too — belt and braces).
  it('refuses non-positive and non-integer amounts without touching the database', async () => {
    for (const amount of [0, -1, -12, 1.5, NaN, undefined, null]) {
      const admin = makeAdmin();
      const out = await deductCredits(admin, 'user-1', amount);
      expect(out.ok).toBe(false);
      expect(out.reason).toBe('invalid_amount');
      expect(admin.rpc).not.toHaveBeenCalled();
    }
  });

  it('refuses a missing user id without touching the database', async () => {
    const admin = makeAdmin();
    const out = await deductCredits(admin, '', 12);
    expect(out.ok).toBe(false);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('reports an rpc error rather than pretending the deduction happened', async () => {
    const out = await deductCredits(
      makeAdmin({ data: null, error: { message: 'permission denied' } }),
      'user-1',
      12,
    );
    expect(out).toMatchObject({ ok: false, reason: 'rpc_error' });
  });

  it('treats a non-numeric balance as a failure', async () => {
    const out = await deductCredits(makeAdmin({ data: null, error: null }), 'user-1', 12);
    expect(out).toMatchObject({ ok: false, reason: 'rpc_error' });
  });
});

// ─── Refund ─────────────────────────────────────────────────────────────────
describe('refundCredits', () => {
  it('refunds through the dedicated RPC — not a negative deduction', async () => {
    const admin = makeAdmin({ data: 20, error: null });
    const out = await refundCredits(admin, 'user-1', 12);

    expect(out).toEqual({ ok: true, balance: 20 });
    expect(admin.rpc).toHaveBeenCalledWith('refund_ai_credits_for', {
      p_user_id: 'user-1',
      p_amount: 12,
    });
    // The pre-#216 refund was deduct_ai_credits({ amount: -cost }).
    const names = admin.rpc.mock.calls.map(([name]) => name);
    expect(names).not.toContain('deduct_ai_credits');
    expect(names).not.toContain('add_ai_credits');
    for (const [, args] of admin.rpc.mock.calls) {
      expect(args.p_amount).toBeGreaterThan(0);
    }
  });

  it('refuses non-positive amounts', async () => {
    for (const amount of [0, -12, 1.5, undefined]) {
      const admin = makeAdmin();
      const out = await refundCredits(admin, 'user-1', amount);
      expect(out.ok).toBe(false);
      expect(admin.rpc).not.toHaveBeenCalled();
    }
  });

  // A refund failure must not mask the generation error that triggered it.
  it('never throws when the rpc rejects', async () => {
    const admin = { rpc: vi.fn(() => Promise.reject(new Error('network down'))) };
    const out = await refundCredits(admin, 'user-1', 12);
    expect(out).toMatchObject({ ok: false });
    expect(out.message).toMatch(/network down/);
  });

  it('never throws when the rpc returns an error', async () => {
    const out = await refundCredits(makeAdmin({ data: null, error: { message: 'nope' } }), 'u', 12);
    expect(out).toMatchObject({ ok: false, message: 'nope' });
  });
});

// ─── Response validation (what triggers a server-side refund) ───────────────
describe('looksLikePatternSource', () => {
  it('accepts source that declares PatternClass', () => {
    expect(looksLikePatternSource('class PatternClass { generate() {} }')).toBe(true);
    expect(looksLikePatternSource('const PatternClass = class {};')).toBe(true);
    expect(looksLikePatternSource('  function PatternClass() {}  ')).toBe(true);
  });

  it('rejects empty, missing, and non-string sources', () => {
    for (const src of ['', '   ', null, undefined, 42, {}]) {
      expect(looksLikePatternSource(src)).toBe(false);
    }
  });

  it('rejects source with no PatternClass declaration', () => {
    expect(looksLikePatternSource('const x = 42;')).toBe(false);
    expect(looksLikePatternSource('class OtherClass {}')).toBe(false);
    // A bare mention is not a declaration.
    expect(looksLikePatternSource('// returns a PatternClass eventually')).toBe(false);
  });
});
