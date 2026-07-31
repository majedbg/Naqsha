// aiPatternService.test.js — AR-2C, rewritten for issue #216
//
// Credits moved server-side (adversarial review §B1): the browser no longer
// calls deduct_ai_credits / add_ai_credits — migration 016 revokes EXECUTE on
// both from PUBLIC, anon and authenticated — and the generate-pattern edge
// function owns deduction, pricing and refund. These tests hold the client to
// that contract:
//   1. It never calls a credit RPC, on any path.
//   2. It reports the balance the server sent, not one it computed.
//   3. Insufficient credits still surfaces as the exact string 'Insufficient
//      credits' (AIPatternChat renders err.message into the chat bubble).
//   4. compilePatternClass still throws a typed error.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const _ref = { client: null };

vi.mock('./supabase', () => ({
  get supabase() { return _ref.client; },
}));
vi.mock('./patternRegistry', () => ({
  registerPattern: vi.fn(),
}));
vi.mock('./patterns/symmetryUtils', () => ({
  applySymmetryDraw: vi.fn(),
  wrapSVGSymmetry: vi.fn(),
}));

import { generatePattern } from './aiPatternService';

const GOOD_SOURCE = `
  class PatternClass {
    constructor(p5, params) { this.p5 = p5; }
    draw() {}
    toSVGPaths() { return []; }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeChain(resolution) {
  const chain = {
    insert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => chain),
    then(resolve) { return Promise.resolve(resolution).then(resolve); },
  };
  return chain;
}

/**
 * A FunctionsHttpError as supabase-js actually builds it: a generic message
 * plus `context`, the untouched Response. The distinguishing code is in the
 * body, which is why the client has to read it.
 */
function httpError(status, body) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: {
      status,
      clone() { return this; },
      json: () => Promise.resolve(body),
    },
  };
}

function makeSupabase({ invokeResult = null, invokeError = null, getUserId = 'user-1' } = {}) {
  const insertChain = makeChain({ data: [], error: null });
  const supa = {
    // Present so a stray call is recorded rather than crashing — the guard
    // tests below assert it is never used.
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    functions: {
      invoke: vi.fn(() =>
        invokeError
          ? Promise.resolve({ data: null, error: invokeError })
          : Promise.resolve({ data: invokeResult, error: null })
      ),
    },
    from: vi.fn(() => insertChain),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: getUserId } } })),
    },
    _insertChain: insertChain,
  };
  _ref.client = supa;
  return supa;
}

function creditRpcCalls(supa) {
  return supa.rpc.mock.calls.filter(
    ([name]) => name === 'deduct_ai_credits' || name === 'add_ai_credits',
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── GUARD TEST 1: the client never mutates credits ──────────────────────────
describe('generatePattern — guard: no client-side credit mutation (#216)', () => {
  it('does not call any credit RPC on a successful generation', async () => {
    const supa = makeSupabase({
      invokeResult: { sourceCode: GOOD_SOURCE, name: 'Spiral', paramDefs: [], defaultParams: {}, creditsRemaining: 10 },
    });

    await generatePattern('draw a spiral', { mode: 'create' });

    expect(creditRpcCalls(supa)).toHaveLength(0);
    expect(supa.rpc).not.toHaveBeenCalled();
  });

  it('does not attempt a client-side refund when the edge function fails', async () => {
    const supa = makeSupabase({ invokeError: httpError(502, { error: 'AI generation failed' }) });

    await expect(generatePattern('draw a spiral', { mode: 'create' })).rejects.toThrow();

    // The pre-#216 refund was deduct_ai_credits({ amount: -cost }) — a mint.
    expect(creditRpcCalls(supa)).toHaveLength(0);
  });

  it('does not attempt a client-side refund when compilation fails', async () => {
    const supa = makeSupabase({
      invokeResult: { sourceCode: 'const broken = true;', name: 'Broken', paramDefs: [], defaultParams: {} },
    });

    await expect(generatePattern('test', { mode: 'create' })).rejects.toThrow();

    expect(creditRpcCalls(supa)).toHaveLength(0);
  });

  it('never sends a credit amount to the edge function — the server prices it', async () => {
    const supa = makeSupabase({
      invokeResult: { sourceCode: GOOD_SOURCE, name: 'Spiral', paramDefs: [], defaultParams: {}, creditsRemaining: 10 },
    });

    await generatePattern('draw a spiral', { mode: 'revise', existingSource: 'x' });

    const [, options] = supa.functions.invoke.mock.calls[0];
    expect(options.body).not.toHaveProperty('amount');
    expect(options.body).not.toHaveProperty('cost');
    expect(options.body).not.toHaveProperty('credits');
    expect(options.body.mode).toBe('revise');
  });

  it('throws immediately (before any network call) when supabase is null', async () => {
    _ref.client = null;
    await expect(generatePattern('test')).rejects.toThrow('Supabase not configured');
  });
});

// ─── GUARD TEST 2: insufficient credits keeps its user-facing contract ───────
describe('generatePattern — guard: insufficient credits', () => {
  it('throws "Insufficient credits" when the edge function answers 402', async () => {
    makeSupabase({
      invokeError: httpError(402, { error: 'insufficient_credits', message: 'Insufficient credits' }),
    });
    await expect(generatePattern('test')).rejects.toThrow('Insufficient credits');
  });

  it('throws "Insufficient credits" when the code arrives in a 2xx body', async () => {
    makeSupabase({ invokeResult: { error: 'insufficient_credits' } });
    await expect(generatePattern('test')).rejects.toThrow('Insufficient credits');
  });

  it('reports a generic failure for an error with no readable body', async () => {
    // Relay / network errors carry no `context`. Reading the code must not
    // throw a TypeError of its own.
    makeSupabase({ invokeError: { message: 'Edge timeout' } });
    await expect(generatePattern('test')).rejects.toThrow('Generation failed: Edge timeout');
  });

  it('reports a generic failure when the error body is unparseable', async () => {
    makeSupabase({
      invokeError: {
        message: 'Edge Function returned a non-2xx status code',
        context: { clone() { return this; }, json: () => Promise.reject(new Error('not json')) },
      },
    });
    await expect(generatePattern('test')).rejects.toThrow('Generation failed:');
  });

  it('reports a generic failure for a non-credit edge error', async () => {
    makeSupabase({ invokeError: httpError(502, { error: 'AI generation failed' }) });
    const err = await generatePattern('test').catch((e) => e);
    expect(err.message).toMatch(/^Generation failed:/);
  });

  it('throws "Invalid response from AI" when the response carries no sourceCode', async () => {
    makeSupabase({ invokeResult: { sourceCode: null } });
    await expect(generatePattern('test')).rejects.toThrow('Invalid response from AI');
  });
});

// ─── GUARD TEST 3: compilePatternClass throws typed error ────────────────────
describe('generatePattern — guard: typed error for invalid compiled pattern', () => {
  it('throws PatternCompileError when source omits PatternClass', async () => {
    makeSupabase({
      invokeResult: { sourceCode: '// No PatternClass here\nconst x = 42;', name: 'Broken', paramDefs: [], defaultParams: {} },
    });

    const err = await generatePattern('test broken', { mode: 'create' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const isTyped = err.code === 'PATTERN_COMPILE_ERROR' || /compile|PatternClass|invalid/i.test(err.message);
    expect(isTyped).toBe(true);
  });

  it('throws when source declares PatternClass as undefined (null return)', async () => {
    makeSupabase({
      invokeResult: { sourceCode: 'var PatternClass = undefined;', name: 'Null Pattern', paramDefs: [], defaultParams: {} },
    });

    const err = await generatePattern('test null pattern', { mode: 'create' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const isTyped = err.code === 'PATTERN_COMPILE_ERROR' || /compile|PatternClass|invalid/i.test(err.message);
    expect(isTyped).toBe(true);
  });
});

// ─── Characterization: the balance and cost come from the server ─────────────
describe('generatePattern — characterization: credits come from the response', () => {
  it('returns the server-reported remaining balance', async () => {
    makeSupabase({
      invokeResult: { sourceCode: GOOD_SOURCE, name: 'Spiral', paramDefs: [], defaultParams: {}, creditsRemaining: 7 },
    });

    const result = await generatePattern('draw a spiral', { mode: 'create' });
    expect(result.creditsRemaining).toBe(7);
  });

  it('records the server-reported cost on the ai_patterns row', async () => {
    const supa = makeSupabase({
      invokeResult: { sourceCode: GOOD_SOURCE, name: 'Revised', paramDefs: [], defaultParams: {}, creditsRemaining: 8, creditsUsed: 4 },
    });

    await generatePattern('revise the spiral', { mode: 'revise' });

    expect(supa._insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ credits_used: 4 }),
    );
  });

  it('falls back to the local price when the server omits creditsUsed', async () => {
    const supa = makeSupabase({
      invokeResult: { sourceCode: GOOD_SOURCE, name: 'New', paramDefs: [], defaultParams: {}, creditsRemaining: 12 },
    });

    await generatePattern('new pattern', { mode: 'create' });

    expect(supa._insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ credits_used: 12 }),
    );
  });
});
