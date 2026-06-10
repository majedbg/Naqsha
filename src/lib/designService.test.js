// designService.test.js — AR-2C
// Characterization + guard tests.
// Uses vi.mock with a mutable ref so we can swap the supabase instance per test.

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mutable ref pattern ─────────────────────────────────────────────────────
// The factory captures a `ref` object. Tests mutate `ref.client` which the
// exported `supabase` getter reads, staying inside the module binding without
// triggering no-import-assign.

const _ref = { client: null };

vi.mock('./supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  saveHistorySnapshot,
  loadDesignHistory,
  loadHistorySnapshot,
  loadUserDesigns,
} from './designService';

// ─── Chainable Supabase mock builder ─────────────────────────────────────────
function makeChain(resolution) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    upsert: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => chain,
    then(resolve, reject) {
      return Promise.resolve(resolution).then(resolve, reject);
    },
  };
  return chain;
}

function mockSupabase(fromImpl) {
  _ref.client = {
    from: vi.fn(fromImpl),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
    functions: { invoke: vi.fn() },
  };
  return _ref.client;
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── Guard test: loadDesignHistory lives in designService ────────────────────
describe('designService.loadDesignHistory — guard test', () => {
  it('is exported from designService', () => {
    expect(typeof loadDesignHistory).toBe('function');
  });

  it('returns history items for a design', async () => {
    const fakeHistory = [
      { id: 'h1', thumbnail: 'thumb1.png', created_at: '2026-01-01T00:00:00Z' },
      { id: 'h2', thumbnail: null, created_at: '2026-01-02T00:00:00Z' },
    ];
    mockSupabase(() => makeChain({ data: fakeHistory, error: null }));

    const result = await loadDesignHistory('design-123');
    expect(result).toEqual(fakeHistory);
  });

  it('queries design_history table scoped to designId', async () => {
    const supa = mockSupabase((tableName) => {
      expect(tableName).toBe('design_history');
      return makeChain({ data: [], error: null });
    });

    await loadDesignHistory('design-abc');
    expect(supa.from).toHaveBeenCalledWith('design_history');
  });

  it('returns empty array when supabase is null', async () => {
    _ref.client = null;
    const result = await loadDesignHistory('design-123');
    expect(result).toEqual([]);
  });

  it('throws when query errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'DB error' } }));
    await expect(loadDesignHistory('design-123')).rejects.toMatchObject({ message: 'DB error' });
  });
});

describe('designService.loadHistorySnapshot — guard test', () => {
  it('is exported from designService', () => {
    expect(typeof loadHistorySnapshot).toBe('function');
  });

  it('returns config for a snapshot id', async () => {
    const fakeConfig = { pattern: 'spiral', params: { turns: 5 } };
    mockSupabase(() => makeChain({ data: { config: fakeConfig }, error: null }));

    const result = await loadHistorySnapshot('snap-1');
    expect(result).toEqual(fakeConfig);
  });

  it('returns null when supabase is null', async () => {
    _ref.client = null;
    const result = await loadHistorySnapshot('snap-1');
    expect(result).toBeNull();
  });

  it('throws when query errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'Snap error' } }));
    await expect(loadHistorySnapshot('snap-1')).rejects.toMatchObject({ message: 'Snap error' });
  });
});

// ─── Characterization: existing designService functions ─────────────────────
describe('designService.saveHistorySnapshot — characterization', () => {
  it('inserts a snapshot row into design_history', async () => {
    const insertMock = vi.fn(() => makeChain({ data: null, error: null }));
    _ref.client = {
      from: vi.fn(() => {
        const chain = makeChain({ data: [], error: null });
        chain.insert = insertMock;
        return chain;
      }),
    };

    await saveHistorySnapshot('d1', 'u1', { pattern: 'spiral' }, 'thumb.png');
    expect(_ref.client.from).toHaveBeenCalledWith('design_history');
    expect(insertMock).toHaveBeenCalled();
  });

  it('returns early when supabase is null', async () => {
    _ref.client = null;
    await expect(saveHistorySnapshot('d1', 'u1', {}, null)).resolves.toBeUndefined();
  });
});

describe('designService.loadUserDesigns — characterization', () => {
  it('returns list of designs for a user', async () => {
    const designs = [
      { id: 'd1', name: 'My Design', thumbnail: null, share_token: null, share_mode: 'none', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ];
    mockSupabase(() => makeChain({ data: designs, error: null }));

    const result = await loadUserDesigns('user-1');
    expect(result).toEqual(designs);
  });

  it('returns empty array when supabase is null', async () => {
    _ref.client = null;
    const result = await loadUserDesigns('user-1');
    expect(result).toEqual([]);
  });
});
