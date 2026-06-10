// collectionService.test.js — AR-2C
// Characterization + guard tests for userId-scoped mutations.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const _ref = { client: null };

vi.mock('./supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  deleteCollection,
  renameCollection,
  loadCollections,
  createCollection,
} from './collectionService';

// ─── Chainable mock ──────────────────────────────────────────────────────────
function makeChain(resolution) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    single: () => chain,
    then(resolve, reject) {
      return Promise.resolve(resolution).then(resolve, reject);
    },
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── Guard tests: userId-scoped mutations ────────────────────────────────────
describe('collectionService.deleteCollection — guard: userId scoping', () => {
  it('accepts userId as second parameter', () => {
    expect(deleteCollection.length).toBe(2);
  });

  it('applies user_id filter when userId is provided', async () => {
    const eqCalls = [];
    const chain = {
      delete: vi.fn(function () { return this; }),
      eq: vi.fn(function (col, val) {
        eqCalls.push({ col, val });
        return this;
      }),
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
    };
    _ref.client = { from: vi.fn(() => chain) };

    await deleteCollection('col-1', 'user-abc');

    const cols = eqCalls.map((c) => c.col);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    const userFilter = eqCalls.find((c) => c.col === 'user_id');
    expect(userFilter.val).toBe('user-abc');
  });

  it('still works without userId (backward compat — id-only filter)', async () => {
    const eqCalls = [];
    const chain = {
      delete: vi.fn(function () { return this; }),
      eq: vi.fn(function (col, val) {
        eqCalls.push({ col, val });
        return this;
      }),
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
    };
    _ref.client = { from: vi.fn(() => chain) };

    await deleteCollection('col-1');

    const cols = eqCalls.map((c) => c.col);
    expect(cols).toContain('id');
    expect(cols).not.toContain('user_id');
  });
});

describe('collectionService.renameCollection — guard: userId scoping', () => {
  it('accepts userId as third parameter', () => {
    expect(renameCollection.length).toBe(3);
  });

  it('applies user_id filter when userId is provided', async () => {
    const eqCalls = [];
    const chain = {
      update: vi.fn(function () { return this; }),
      eq: vi.fn(function (col, val) {
        eqCalls.push({ col, val });
        return this;
      }),
      then(resolve) { return Promise.resolve({ error: null }).then(resolve); },
    };
    _ref.client = { from: vi.fn(() => chain) };

    await renameCollection('col-1', 'New Name', 'user-abc');

    const cols = eqCalls.map((c) => c.col);
    expect(cols).toContain('id');
    expect(cols).toContain('user_id');
    const userFilter = eqCalls.find((c) => c.col === 'user_id');
    expect(userFilter.val).toBe('user-abc');
  });
});

// ─── Characterization tests ──────────────────────────────────────────────────
describe('collectionService.loadCollections — characterization', () => {
  it('returns collections for a user', async () => {
    const cols = [
      { id: 'c1', name: 'My Art', description: '', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ];
    _ref.client = { from: vi.fn(() => makeChain({ data: cols, error: null })) };

    const result = await loadCollections('user-1');
    expect(result).toEqual(cols);
  });

  it('returns empty array when supabase is null', async () => {
    _ref.client = null;
    const result = await loadCollections('user-1');
    expect(result).toEqual([]);
  });
});

describe('collectionService.createCollection — characterization', () => {
  it('inserts and returns collection', async () => {
    const newCol = { id: 'c2', name: 'Wave Art', description: '', user_id: 'u1', created_at: '2026-01-01', updated_at: '2026-01-01' };
    _ref.client = { from: vi.fn(() => makeChain({ data: newCol, error: null })) };

    const result = await createCollection('u1', 'Wave Art');
    expect(result).toEqual(newCol);
  });

  it('returns null when supabase is null', async () => {
    _ref.client = null;
    const result = await createCollection('u1', 'Test');
    expect(result).toBeNull();
  });
});
