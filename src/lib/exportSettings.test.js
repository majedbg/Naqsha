// @vitest-environment jsdom
//
// exportSettings.test.js — the `export` namespace of profiles.settings, which
// backs the Run Plan's Export Receipt (the "cropped to the Sheet?" preference,
// `cropToSheet`). This lane is the "future SECOND writer" that settingsService's
// IMPORTANT block warns about, so the load-bearing test here is the
// READ-BEFORE-WRITE round trip proving an export write does NOT clobber the
// patternPicker namespace written by another tab/writer.
//
// Mock pattern mirrors settingsService.test.js: a `_ref.client` getter so each
// case swaps the (mocked) supabase client, plus a chainable thenable resolving
// to { data, error }. jsdom env is opted-in for the guest localStorage path.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const _ref = { client: null };

vi.mock('./supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  getExportSettings,
  mergeExport,
  writeExportSettings,
  getGuestExportSettings,
} from './exportSettings';

// Chainable resolution mock — every builder method returns the chain; the chain
// is thenable and resolves to the provided { data, error }.
function makeChain(resolution) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
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
  };
  return _ref.client;
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
  // jsdom persists localStorage across tests in a file — clear so guest
  // round-trips (naqsha-export-settings) are order-independent.
  localStorage.clear();
});

// ─── getExportSettings (pure read) ───────────────────────────────────────────
describe('getExportSettings', () => {
  it('defaults cropToSheet to true when the export namespace is unconfigured/absent', () => {
    // An Export Receipt for a brand-new user: crop-to-Sheet on by default.
    expect(getExportSettings({ id: 'u1', settings: {} })).toEqual({ cropToSheet: true });
    expect(getExportSettings({ id: 'u1', settings: { patternPicker: { sortMode: 'auto' } } }))
      .toEqual({ cropToSheet: true });
  });

  it('reads an explicit cropToSheet=false from the export namespace', () => {
    const profile = { id: 'u1', settings: { export: { cropToSheet: false } } };
    expect(getExportSettings(profile)).toEqual({ cropToSheet: false });
  });

  it('accepts either a fetched profile row or a bare settings object', () => {
    // profile row
    expect(getExportSettings({ settings: { export: { cropToSheet: false } } }))
      .toEqual({ cropToSheet: false });
    // bare settings blob
    expect(getExportSettings({ export: { cropToSheet: false } }))
      .toEqual({ cropToSheet: false });
  });

  it('defaults cropToSheet to true when profile is null/undefined', () => {
    expect(getExportSettings(null)).toEqual({ cropToSheet: true });
    expect(getExportSettings(undefined)).toEqual({ cropToSheet: true });
  });
});

// ─── mergeExport (pure merge helper) ─────────────────────────────────────────
describe('mergeExport', () => {
  it('merges an export patch into the export namespace, preserving the patternPicker sibling', () => {
    const base = { patternPicker: { sortMode: 'auto' }, export: { cropToSheet: true } };
    const result = mergeExport(base, { cropToSheet: false });
    expect(result).toEqual({
      patternPicker: { sortMode: 'auto' },
      export: { cropToSheet: false },
    });
  });

  it('does not mutate the base settings object', () => {
    const base = { patternPicker: { sortMode: 'auto' }, export: { cropToSheet: true } };
    const snapshot = JSON.parse(JSON.stringify(base));
    mergeExport(base, { cropToSheet: false });
    expect(base).toEqual(snapshot);
  });

  it('handles missing base / missing export namespace', () => {
    expect(mergeExport(undefined, { cropToSheet: false })).toEqual({
      export: { cropToSheet: false },
    });
    expect(mergeExport({}, { cropToSheet: false })).toEqual({
      export: { cropToSheet: false },
    });
  });
});

// ─── writeExportSettings — READ-BEFORE-WRITE (no clobber) ─────────────────────
describe('writeExportSettings (supabase)', () => {
  it('re-reads the row and writes BOTH patternPicker AND export — proving no clobber of the sibling writer', async () => {
    // The whole point of this lane: as the SECOND writer into profiles.settings,
    // we select the freshly-persisted row (which another writer filled with
    // patternPicker) BEFORE writing, so our export write preserves it.
    let updatePayload;
    let fromCalls = 0;
    const supa = mockSupabase((table) => {
      expect(table).toBe('profiles');
      fromCalls += 1;
      if (fromCalls === 1) {
        // READ: the row already carries a patternPicker namespace.
        return makeChain({
          data: { settings: { patternPicker: { sortMode: 'custom', manualOrder: ['a', 'b'] } } },
          error: null,
        });
      }
      // WRITE: capture the update payload.
      const chain = makeChain({ data: null, error: null });
      chain.update = vi.fn((payload) => { updatePayload = payload; return chain; });
      return chain;
    });

    const result = await writeExportSettings('u1', { cropToSheet: false });

    // Read happened before write (two `from('profiles')` round trips).
    expect(supa.from).toHaveBeenCalledTimes(2);
    // The persisted blob carries BOTH namespaces — patternPicker survived.
    expect(updatePayload).toEqual({
      settings: {
        patternPicker: { sortMode: 'custom', manualOrder: ['a', 'b'] },
        export: { cropToSheet: false },
      },
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('does not throw on a read error — returns an error-shaped result', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'RLS denied' } }));

    let result;
    await expect(
      (async () => { result = await writeExportSettings('u1', { cropToSheet: false }); })()
    ).resolves.toBeUndefined();

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatchObject({ message: 'RLS denied' });
  });

  it('does not throw on an update error — returns an error-shaped result', async () => {
    let fromCalls = 0;
    mockSupabase(() => {
      fromCalls += 1;
      if (fromCalls === 1) {
        return makeChain({ data: { settings: {} }, error: null });
      }
      return makeChain({ data: null, error: { message: 'update failed' } });
    });

    let result;
    await expect(
      (async () => { result = await writeExportSettings('u1', { cropToSheet: false }); })()
    ).resolves.toBeUndefined();

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatchObject({ message: 'update failed' });
  });
});

// ─── writeExportSettings — guest / unconfigured backend (localStorage) ────────
describe('writeExportSettings (guest / unconfigured → localStorage)', () => {
  it('a guest (no userId) round-trips through localStorage without touching supabase', async () => {
    const fromMock = vi.fn();
    _ref.client = { from: fromMock };

    const result = await writeExportSettings(null, { cropToSheet: false });

    expect(fromMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true });
    // Round-trip: the guest reader sees what the guest writer persisted.
    expect(getGuestExportSettings()).toEqual({ cropToSheet: false });
  });

  it('an unconfigured backend (no supabase client) falls back to localStorage', async () => {
    _ref.client = null;

    const result = await writeExportSettings('u1', { cropToSheet: false });

    expect(result).toMatchObject({ ok: true });
    expect(getGuestExportSettings()).toEqual({ cropToSheet: false });
  });
});

// ─── getGuestExportSettings (guest reader, same key + default) ────────────────
describe('getGuestExportSettings', () => {
  it('defaults cropToSheet to true when nothing is stored', () => {
    expect(getGuestExportSettings()).toEqual({ cropToSheet: true });
  });

  it('reads a previously-persisted guest value', async () => {
    await writeExportSettings(null, { cropToSheet: false });
    expect(getGuestExportSettings()).toEqual({ cropToSheet: false });
  });
});
