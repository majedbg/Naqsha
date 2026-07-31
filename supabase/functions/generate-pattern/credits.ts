// Server-authoritative credit pricing and mutation for generate-pattern.
//
// Extracted from index.ts so it can be unit-tested by the app's vitest suite
// (src/test/edgeCredits.test.js) — the edge runtime itself has no harness in
// this repo. Nothing in this module may import from Deno or from a URL: it is
// pure constants plus functions over an injected client.
//
// Why this exists at all (issue #216, adversarial review §B1): credit
// deduction used to happen in the browser via `deduct_ai_credits`, at a cost
// the client chose, with a refund implemented as `deduct_ai_credits(-cost)` —
// a mint primitive. The client can no longer call either RPC; the server
// prices the request and owns both the deduction and the refund.

/** Cost of generating a new pattern. Mirrors src/lib/creditModel.js. */
export const CREDIT_COST_NEW = 12;
/** Cost of revising an existing pattern. Mirrors src/lib/creditModel.js. */
export const CREDIT_COST_REVISION = 4;

/** Error code returned to the client when the balance will not cover the cost. */
export const INSUFFICIENT_CREDITS = 'insufficient_credits';

/**
 * Server-side price for a generation mode.
 *
 * The client sends 'create' | 'revise'; creditModel.js also speaks
 * 'new' | 'revision'. Anything unrecognised — including a mode the client
 * invented to get a cheaper price — falls through to the full new-pattern
 * cost, so an unknown mode is never cheaper than a known one.
 */
export function creditCostFor(mode?: string | null): number {
  return mode === 'revise' || mode === 'revision' ? CREDIT_COST_REVISION : CREDIT_COST_NEW;
}

type RpcResult = { data: unknown; error: { message?: string } | null };
/**
 * Minimal shape of the service-role supabase client this module needs.
 * `PromiseLike` rather than `Promise` so a real PostgrestFilterBuilder (a
 * thenable, not a Promise) satisfies it structurally.
 */
export interface CreditClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}

export type DeductOutcome =
  | { ok: true; remaining: number }
  | { ok: false; reason: 'insufficient_credits' }
  | { ok: false; reason: 'invalid_amount' | 'rpc_error'; message: string };

/**
 * Atomically deduct `amount` credits from `userId`, via the service-role-only
 * `deduct_ai_credits_for` RPC (migration 016). The RPC takes a row lock, so
 * two concurrent generations cannot both pass the balance check.
 *
 * `amount` must come from creditCostFor() — never from the request body.
 */
export async function deductCredits(
  admin: CreditClient,
  userId: string,
  amount: number,
): Promise<DeductOutcome> {
  if (!userId) return { ok: false, reason: 'invalid_amount', message: 'missing user id' };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, reason: 'invalid_amount', message: `amount must be a positive integer (got ${amount})` };
  }

  const { data, error } = await admin.rpc('deduct_ai_credits_for', {
    p_user_id: userId,
    p_amount: amount,
  });

  if (error) return { ok: false, reason: 'rpc_error', message: error.message || 'credit deduction failed' };
  if (data === -1) return { ok: false, reason: INSUFFICIENT_CREDITS };
  if (typeof data !== 'number') {
    return { ok: false, reason: 'rpc_error', message: 'credit deduction returned no balance' };
  }
  return { ok: true, remaining: data };
}

export type RefundOutcome =
  | { ok: true; balance: number }
  | { ok: false; message: string };

/**
 * Return `amount` credits to `userId` after a generation the user did not get.
 *
 * Touches `ai_credits` only — never `ai_credits_purchased` — so a failed
 * generation cannot record a phantom purchase. `amount` is the same
 * server-computed cost that was deducted; it is never caller-supplied.
 *
 * Never throws: a refund failure must not mask the generation error that
 * triggered it. The caller logs the returned message and reports the original
 * failure to the user.
 */
export async function refundCredits(
  admin: CreditClient,
  userId: string,
  amount: number,
): Promise<RefundOutcome> {
  if (!userId) return { ok: false, message: 'missing user id' };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, message: `amount must be a positive integer (got ${amount})` };
  }

  try {
    const { data, error } = await admin.rpc('refund_ai_credits_for', {
      p_user_id: userId,
      p_amount: amount,
    });
    if (error) return { ok: false, message: error.message || 'credit refund failed' };
    if (typeof data !== 'number') return { ok: false, message: 'credit refund returned no balance' };
    return { ok: true, balance: data };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

/**
 * Cheap structural check that the model returned something that can plausibly
 * compile to a PatternClass, so the obvious garbage case is caught (and
 * refunded) on the server rather than silently consuming credits.
 *
 * This is deliberately NOT a full compile: the browser is the only place the
 * real `new Function(...)` gate runs (src/lib/aiPatternService.js), and the
 * edge runtime should not be evaluating model-authored code. Source that
 * declares PatternClass but fails to compile in the browser still consumes
 * credits — a narrower residual than the pre-#216 behaviour refunded, and one
 * that is called out in the PR body rather than papered over.
 */
export function looksLikePatternSource(sourceCode: unknown): boolean {
  if (typeof sourceCode !== 'string' || sourceCode.trim() === '') return false;
  return /(^|[^\w.])(class|function|const|let|var)\s+PatternClass\b/.test(sourceCode);
}
