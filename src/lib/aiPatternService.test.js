// aiPatternService.test.js — AR-2C
// Characterization + guard tests for aiPatternService:
//   1. Failed edge generation refunds the deducted credits
//   2. compilePatternClass throws a typed error when source omits PatternClass

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

function makeSupabase({ deductResult = 10, invokeResult = null, invokeError = null, getUserId = 'user-1' } = {}) {
  const supa = {
    rpc: vi.fn((name) => {
      if (name === 'deduct_ai_credits') return Promise.resolve({ data: deductResult, error: null });
      if (name === 'add_ai_credits') return Promise.resolve({ data: deductResult, error: null });
      return Promise.resolve({ data: null, error: null });
    }),
    functions: {
      invoke: vi.fn(() =>
        invokeError
          ? Promise.resolve({ data: null, error: invokeError })
          : Promise.resolve({ data: invokeResult, error: null })
      ),
    },
    from: vi.fn(() => makeChain({ data: [], error: null })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: getUserId } } })),
    },
  };
  _ref.client = supa;
  return supa;
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// Refund mechanism: deduct_ai_credits with a negative amount (not add_ai_credits,
// which has the side effect of incrementing ai_credits_purchased in migration 002).
function getRefundCalls(supa) {
  return supa.rpc.mock.calls.filter(
    ([name, args]) => name === 'deduct_ai_credits' && args?.amount < 0
  );
}

// ─── GUARD TEST 1: Failed edge generation refunds credits ────────────────────
describe('generatePattern — guard: refund on edge failure', () => {
  it('refunds credits (deduct with negative amount) after edge function error', async () => {
    const supa = makeSupabase({
      deductResult: 10,
      invokeError: { message: 'Edge timeout' },
    });

    await expect(generatePattern('draw a spiral', { mode: 'create' })).rejects.toThrow();

    const refundCalls = getRefundCalls(supa);
    expect(refundCalls.length).toBeGreaterThan(0);
    // Refund amount is -cost (-12 for create)
    expect(refundCalls[0][1]).toMatchObject({ amount: -12 });
  });

  it('refunds credits when edge returns no sourceCode', async () => {
    const supa = makeSupabase({
      deductResult: 10,
      invokeResult: { sourceCode: null },
    });

    await expect(generatePattern('draw a spiral', { mode: 'create' })).rejects.toThrow();

    const refundCalls = getRefundCalls(supa);
    expect(refundCalls.length).toBeGreaterThan(0);
  });

  it('does NOT refund when generation succeeds', async () => {
    const goodSource = `
      class PatternClass {
        constructor(p5, params) { this.p5 = p5; }
        draw() {}
        toSVGPaths() { return []; }
      }
    `;
    const supa = makeSupabase({
      deductResult: 10,
      invokeResult: {
        sourceCode: goodSource,
        name: 'Spiral',
        paramDefs: [],
        defaultParams: {},
      },
    });

    await generatePattern('draw a spiral', { mode: 'create' });

    const refundCalls = getRefundCalls(supa);
    expect(refundCalls.length).toBe(0);
  });

  it('throws immediately (before deduct) when supabase is null', async () => {
    _ref.client = null;
    await expect(generatePattern('test')).rejects.toThrow('Supabase not configured');
  });

  it('throws when auth check shows insufficient credits (deduct returns -1)', async () => {
    makeSupabase({ deductResult: -1 });
    await expect(generatePattern('test')).rejects.toThrow('Insufficient credits');
  });
});

// ─── GUARD TEST 2: compilePatternClass throws typed error ────────────────────
describe('generatePattern — guard: typed error for invalid compiled pattern', () => {
  it('throws PatternCompileError when source omits PatternClass', async () => {
    const badSource = `
      // No PatternClass defined here
      const x = 42;
    `;
    makeSupabase({
      deductResult: 10,
      invokeResult: {
        sourceCode: badSource,
        name: 'Broken Pattern',
        paramDefs: [],
        defaultParams: {},
      },
    });

    const err = await generatePattern('test broken', { mode: 'create' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const isTyped = err.code === 'PATTERN_COMPILE_ERROR' || /compile|PatternClass|invalid/i.test(err.message);
    expect(isTyped).toBe(true);
  });

  it('refunds credits when compile fails', async () => {
    const badSource = `const broken = true;`;
    const supa = makeSupabase({
      deductResult: 10,
      invokeResult: {
        sourceCode: badSource,
        name: 'Broken',
        paramDefs: [],
        defaultParams: {},
      },
    });

    await expect(generatePattern('test', { mode: 'create' })).rejects.toThrow();

    const refundCalls = getRefundCalls(supa);
    expect(refundCalls.length).toBeGreaterThan(0);
  });

  it('throws when source declares PatternClass as undefined (null return)', async () => {
    const badSource = `
      var PatternClass = undefined;
    `;
    makeSupabase({
      deductResult: 10,
      invokeResult: {
        sourceCode: badSource,
        name: 'Null Pattern',
        paramDefs: [],
        defaultParams: {},
      },
    });

    const err = await generatePattern('test null pattern', { mode: 'create' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const isTyped = err.code === 'PATTERN_COMPILE_ERROR' || /compile|PatternClass|invalid/i.test(err.message);
    expect(isTyped).toBe(true);
  });
});

// ─── Characterization: revision credit cost ──────────────────────────────────
describe('generatePattern — characterization: credit costs', () => {
  it('deducts 4 credits for a revision', async () => {
    const goodSource = `
      class PatternClass {
        constructor(p5, params) { this.p5 = p5; }
        draw() {}
        toSVGPaths() { return []; }
      }
    `;
    const supa = makeSupabase({
      deductResult: 8,
      invokeResult: { sourceCode: goodSource, name: 'Revised', paramDefs: [], defaultParams: {} },
    });

    await generatePattern('revise the spiral', { mode: 'revise' });

    const deductCall = supa.rpc.mock.calls.find(([name]) => name === 'deduct_ai_credits');
    expect(deductCall[1]).toMatchObject({ amount: 4 });
  });

  it('deducts 12 credits for a new pattern', async () => {
    const goodSource = `
      class PatternClass {
        constructor(p5, params) { this.p5 = p5; }
        draw() {}
        toSVGPaths() { return []; }
      }
    `;
    const supa = makeSupabase({
      deductResult: 12,
      invokeResult: { sourceCode: goodSource, name: 'New', paramDefs: [], defaultParams: {} },
    });

    await generatePattern('new pattern', { mode: 'create' });

    const deductCall = supa.rpc.mock.calls.find(([name]) => name === 'deduct_ai_credits');
    expect(deductCall[1]).toMatchObject({ amount: 12 });
  });
});
