// userMotifService.test.js — P4-2
//
// The global motif library service (DECISIONS D1). Mirrors designService's
// supabase-mock idiom (mutable ref + chainable builder). Covers the pure
// mappers (glyph ⇄ row, uuid-keyed) and the offline-graceful CRUD.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const _ref = { client: null };
vi.mock('./supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  glyphToRow,
  rowToLibraryMotif,
  saveUserMotif,
  loadUserMotifs,
  deleteUserMotif,
  MOTIF_LIBRARY_LIMIT,
} from './userMotifService';

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
  _ref.client = { from: vi.fn(fromImpl) };
  return _ref.client;
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

const GLYPH = {
  id: 'glyph-local-7',
  name: 'My Flower',
  tradition: 'custom',
  paths: [{ d: 'M0,0 L1,1 Z', closed: true }],
  viewRadius: 5,
  root: { x: 0, y: 0, angle: 0 },
};

// ─── Pure mappers ────────────────────────────────────────────────────────────
describe('glyphToRow — pure', () => {
  it('carries the glyph and derives name from it', () => {
    const row = glyphToRow(GLYPH);
    expect(row.name).toBe('My Flower');
    expect(row.glyph).toEqual(GLYPH);
  });

  it('falls back to a default name when the glyph has none', () => {
    const row = glyphToRow({ ...GLYPH, name: '' });
    expect(row.name).toBe('Untitled motif');
  });
});

describe('rowToLibraryMotif — pure', () => {
  it('re-keys the glyph.id to the DB row uuid (copy-on-use key)', () => {
    const row = { id: 'db-uuid-123', name: 'My Flower', glyph: GLYPH };
    const motif = rowToLibraryMotif(row);
    expect(motif.id).toBe('db-uuid-123');
    expect(motif.name).toBe('My Flower');
    // The inner glyph is keyed by the uuid so getGlyph never shadows it with a
    // built-in and copy-on-use is idempotent (same uuid → merge).
    expect(motif.glyph.id).toBe('db-uuid-123');
    expect(motif.glyph.paths).toEqual(GLYPH.paths);
  });
});

// ─── Service CRUD ────────────────────────────────────────────────────────────
describe('saveUserMotif', () => {
  it('inserts into user_motifs scoped to the user and returns the library motif', async () => {
    const supa = mockSupabase((table) => {
      expect(table).toBe('user_motifs');
      return makeChain({ data: { id: 'db-1', name: 'My Flower', glyph: GLYPH }, error: null });
    });
    const result = await saveUserMotif('user-1', GLYPH);
    expect(supa.from).toHaveBeenCalledWith('user_motifs');
    expect(result.id).toBe('db-1');
    expect(result.glyph.id).toBe('db-1');
  });

  it('returns null when supabase is null (offline)', async () => {
    _ref.client = null;
    expect(await saveUserMotif('user-1', GLYPH)).toBeNull();
  });

  it('throws when the insert errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'insert failed' } }));
    await expect(saveUserMotif('user-1', GLYPH)).rejects.toMatchObject({ message: 'insert failed' });
  });
});

describe('loadUserMotifs', () => {
  it('returns the user library mapped to library motifs', async () => {
    const rows = [
      { id: 'a', name: 'A', glyph: { ...GLYPH, id: 'x' } },
      { id: 'b', name: 'B', glyph: { ...GLYPH, id: 'y' } },
    ];
    mockSupabase(() => makeChain({ data: rows, error: null }));
    const result = await loadUserMotifs('user-1');
    expect(result.map((m) => m.id)).toEqual(['a', 'b']);
    expect(result[0].glyph.id).toBe('a'); // re-keyed to uuid
  });

  it('returns [] when supabase is null (offline)', async () => {
    _ref.client = null;
    expect(await loadUserMotifs('user-1')).toEqual([]);
  });

  it('returns [] when userId is falsy', async () => {
    mockSupabase(() => makeChain({ data: [], error: null }));
    expect(await loadUserMotifs(null)).toEqual([]);
  });

  it('bounds the query with .limit(MOTIF_LIBRARY_LIMIT) so a huge library never floods memory', async () => {
    const limitSpy = vi.fn();
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: (...args) => {
        limitSpy(...args);
        return chain;
      },
      then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    mockSupabase(() => chain);
    await loadUserMotifs('user-1');
    expect(MOTIF_LIBRARY_LIMIT).toBeGreaterThan(0);
    expect(limitSpy).toHaveBeenCalledWith(MOTIF_LIBRARY_LIMIT);
  });

  it('throws when the query errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'load failed' } }));
    await expect(loadUserMotifs('user-1')).rejects.toMatchObject({ message: 'load failed' });
  });
});

describe('deleteUserMotif', () => {
  it('deletes the row scoped to id + user', async () => {
    const supa = mockSupabase(() => makeChain({ data: null, error: null }));
    await deleteUserMotif('db-1', 'user-1');
    expect(supa.from).toHaveBeenCalledWith('user_motifs');
  });

  it('returns early when supabase is null', async () => {
    _ref.client = null;
    await expect(deleteUserMotif('db-1', 'user-1')).resolves.toBeUndefined();
  });

  it('throws when the delete errors', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'delete failed' } }));
    await expect(deleteUserMotif('db-1', 'user-1')).rejects.toMatchObject({ message: 'delete failed' });
  });
});
