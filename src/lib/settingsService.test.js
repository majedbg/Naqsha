// settingsService.test.js — Slice 2 of pattern-picker-manual-sort.
// Per-user profiles.settings jsonb under the `patternPicker` namespace.
//
// Mock pattern mirrors materialService.test.js / designService.test.js:
// a `_ref.client` getter so the test can swap the (mocked) supabase client
// per-case, plus a chainable thenable resolving to { data, error }.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const _ref = { client: null };

vi.mock('./supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  getPatternPickerSettings,
  writePatternPickerSettings,
  mergePatternPicker,
} from './settingsService';

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
});

// ─── getPatternPickerSettings (pure read) ────────────────────────────────────
describe('getPatternPickerSettings', () => {
  it('returns the nested patternPicker value', () => {
    const pp = { sortMode: 'custom', manualOrder: ['a', 'b'] };
    const profile = { id: 'u1', settings: { patternPicker: pp } };
    expect(getPatternPickerSettings(profile)).toEqual(pp);
  });

  it('returns null when profile is null/undefined', () => {
    expect(getPatternPickerSettings(null)).toBeNull();
    expect(getPatternPickerSettings(undefined)).toBeNull();
  });

  it('returns null when settings is missing', () => {
    expect(getPatternPickerSettings({ id: 'u1' })).toBeNull();
  });

  it('returns null when patternPicker namespace is missing', () => {
    expect(getPatternPickerSettings({ id: 'u1', settings: { other: 1 } })).toBeNull();
  });
});

// ─── mergePatternPicker (pure merge helper) ──────────────────────────────────
describe('mergePatternPicker', () => {
  it('merges pickerSettings into patternPicker without dropping other top-level keys', () => {
    const base = { other: 1, patternPicker: { sortMode: 'auto' } };
    const result = mergePatternPicker(base, { manualOrder: ['a'] });
    expect(result).toEqual({
      other: 1,
      patternPicker: { sortMode: 'auto', manualOrder: ['a'] },
    });
  });

  it('does not mutate the base settings object', () => {
    const base = { other: 1, patternPicker: { sortMode: 'auto' } };
    const snapshot = JSON.parse(JSON.stringify(base));
    mergePatternPicker(base, { manualOrder: ['a'] });
    expect(base).toEqual(snapshot);
  });

  it('handles missing base / missing patternPicker', () => {
    expect(mergePatternPicker(undefined, { sortMode: 'custom' })).toEqual({
      patternPicker: { sortMode: 'custom' },
    });
    expect(mergePatternPicker({}, { sortMode: 'custom' })).toEqual({
      patternPicker: { sortMode: 'custom' },
    });
  });
});

// ─── writePatternPickerSettings (guarded persist) ────────────────────────────
describe('writePatternPickerSettings', () => {
  it('merges pickerSettings into baseSettings.patternPicker and calls update + .eq(id)', async () => {
    const updateMock = vi.fn(() => chain);
    const eqMock = vi.fn(() => chain);
    let chain;
    const supa = mockSupabase((table) => {
      expect(table).toBe('profiles');
      chain = makeChain({ data: null, error: null });
      chain.update = updateMock;
      chain.eq = eqMock;
      return chain;
    });

    const base = { other: 1, patternPicker: { sortMode: 'auto' } };
    const result = await writePatternPickerSettings('u1', { manualOrder: ['a'] }, base);

    expect(supa.from).toHaveBeenCalledWith('profiles');
    expect(updateMock).toHaveBeenCalledWith({
      settings: {
        other: 1,
        patternPicker: { sortMode: 'auto', manualOrder: ['a'] },
      },
    });
    expect(eqMock).toHaveBeenCalledWith('id', 'u1');
    expect(result).toMatchObject({ ok: true });
  });

  it('defaults baseSettings to {} when omitted', async () => {
    const updateMock = vi.fn(() => chain);
    let chain;
    mockSupabase(() => {
      chain = makeChain({ data: null, error: null });
      chain.update = updateMock;
      return chain;
    });

    await writePatternPickerSettings('u1', { sortMode: 'custom' });

    expect(updateMock).toHaveBeenCalledWith({
      settings: { patternPicker: { sortMode: 'custom' } },
    });
  });

  it('is a NO-OP for a guest (no userId) — update NOT called, resolves without throwing', async () => {
    const fromMock = vi.fn();
    _ref.client = { from: fromMock };

    const result = await writePatternPickerSettings(null, { manualOrder: ['a'] }, {});

    expect(fromMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, skipped: true });
  });

  it('is a NO-OP when supabase client is null', async () => {
    _ref.client = null;
    const result = await writePatternPickerSettings('u1', { manualOrder: ['a'] }, {});
    expect(result).toMatchObject({ ok: false, skipped: true });
  });

  it('does not throw on a supabase error — returns an error-shaped result', async () => {
    mockSupabase(() => makeChain({ data: null, error: { message: 'RLS denied' } }));

    let result;
    await expect(
      (async () => { result = await writePatternPickerSettings('u1', { manualOrder: ['a'] }, {}); })()
    ).resolves.toBeUndefined();

    expect(result).toMatchObject({ ok: false });
    expect(result.error).toMatchObject({ message: 'RLS denied' });
  });
});
