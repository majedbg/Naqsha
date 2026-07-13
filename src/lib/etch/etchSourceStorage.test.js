// etchSourceStorage.test.js — signed-in source storage for an Etch (Raster Etch
// S7, issue #86).
//
// The signed-in half of the hybrid source persistence (grilled decision 7): a
// SIGNED-IN Etch uploads its full-resolution source photo to a PRIVATE bucket and
// the layer stores a `sourcePath`; a GUEST/offline Etch keeps the S1 capped
// data-URI ON the layer, UNCHANGED. Mirrors materialEvaluationService's
// supabase-mock idiom (mutable ref + chainable builder + storage bucket mock),
// extended with a `download` stub for the load path. NOTHING here touches a real
// bucket or runs the migration.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const _ref = { client: null };
vi.mock('../supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  ETCH_SOURCE_BUCKET,
  MAX_SOURCE_BYTES,
  ALLOWED_SOURCE_TYPES,
  extensionForMime,
  buildEtchSourcePath,
  validateSource,
  uploadEtchSource,
  persistEtchSource,
  fetchEtchSourceDataUrl,
  resolveEtchSourceUrl,
  _clearEtchSourceCache,
} from './etchSourceStorage.js';

// ── Mock plumbing (mirrors materialEvaluationService.test.js) ────────────────

function makeStorageBucket({ uploadResult, downloadResult } = {}) {
  return {
    upload: vi.fn(async () => uploadResult ?? { data: { path: 'p' }, error: null }),
    download: vi.fn(async () =>
      downloadResult ?? { data: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), error: null }),
    remove: vi.fn(async () => ({ data: null, error: null })),
  };
}

function mockSupabase({ bucket } = {}) {
  const storageBucket = bucket ?? makeStorageBucket();
  _ref.client = {
    storage: { from: vi.fn(() => storageBucket) },
  };
  return { client: _ref.client, storageBucket };
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
  _clearEtchSourceCache();
});

// A capped 1×1 PNG data-URI — the S1 guest source shape.
const CAPPED_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function makeSourceFile({ type = 'image/jpeg', size = 4096 } = {}) {
  const file = new Blob([new Uint8Array(size)], { type });
  file.name = `source.${type.split('/')[1]}`;
  return file;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('extensionForMime — pure', () => {
  it('maps the allowed image mimes to extensions', () => {
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/webp')).toBe('webp');
  });
  it('falls back to jpg for unknown/missing mimes', () => {
    expect(extensionForMime('application/pdf')).toBe('jpg');
    expect(extensionForMime(undefined)).toBe('jpg');
  });
});

describe('buildEtchSourcePath — pure, owner-uid FIRST', () => {
  it('puts the owner uid as the FIRST path segment (bucket RLS keys on it)', () => {
    const path = buildEtchSourcePath({ userId: 'user-1', sourceId: 'src-1', mime: 'image/jpeg' });
    expect(path).toBe('user-1/src-1/source.jpg');
    expect(path.split('/')[0]).toBe('user-1');
  });
  it('derives the extension from the source mime', () => {
    expect(buildEtchSourcePath({ userId: 'u', sourceId: 's', mime: 'image/png' })).toBe('u/s/source.png');
    expect(buildEtchSourcePath({ userId: 'u', sourceId: 's', mime: 'image/webp' })).toBe('u/s/source.webp');
  });
});

describe('validateSource — pure preflight (mirrors the bucket server limits)', () => {
  it('accepts an allowed image within the size cap', () => {
    expect(validateSource(makeSourceFile()).ok).toBe(true);
  });
  it('rejects a disallowed mime', () => {
    expect(validateSource(makeSourceFile({ type: 'image/gif' })).ok).toBe(false);
  });
  it('rejects an over-size file', () => {
    expect(validateSource(makeSourceFile({ size: MAX_SOURCE_BYTES + 1 })).ok).toBe(false);
  });
  it('exposes the same limits the migration encodes', () => {
    expect(ETCH_SOURCE_BUCKET).toBe('etch-sources');
    expect(ALLOWED_SOURCE_TYPES).toContain('image/png');
    expect(MAX_SOURCE_BYTES).toBe(10 * 1024 * 1024);
  });
});

// ── uploadEtchSource ─────────────────────────────────────────────────────────

describe('uploadEtchSource', () => {
  it('returns null when offline (no supabase client)', async () => {
    _ref.client = null;
    expect(await uploadEtchSource({ userId: 'u', file: makeSourceFile() })).toBeNull();
  });

  it('uploads to the private bucket under an owner-uid-first path and returns { sourcePath }', async () => {
    const { storageBucket, client } = mockSupabase();
    const res = await uploadEtchSource({ userId: 'user-1', file: makeSourceFile({ type: 'image/png' }) });
    expect(client.storage.from).toHaveBeenCalledWith(ETCH_SOURCE_BUCKET);
    expect(storageBucket.upload).toHaveBeenCalledTimes(1);
    const [path, body, opts] = storageBucket.upload.mock.calls[0];
    expect(path.split('/')[0]).toBe('user-1'); // owner uid first
    expect(path.endsWith('/source.png')).toBe(true);
    expect(opts).toMatchObject({ contentType: 'image/png', upsert: false });
    expect(body).toBeInstanceOf(Blob);
    expect(res.sourcePath).toBe(path);
  });

  it('throws on an upload error (caller falls back)', async () => {
    const bucket = makeStorageBucket({ uploadResult: { data: null, error: new Error('boom') } });
    mockSupabase({ bucket });
    await expect(uploadEtchSource({ userId: 'u', file: makeSourceFile() })).rejects.toThrow('boom');
  });

  it('throws on a disallowed mime before touching storage', async () => {
    const { storageBucket } = mockSupabase();
    await expect(uploadEtchSource({ userId: 'u', file: makeSourceFile({ type: 'image/gif' }) })).rejects.toThrow();
    expect(storageBucket.upload).not.toHaveBeenCalled();
  });
});

// ── persistEtchSource — the import-time signed-in/guest branch ────────────────

describe('persistEtchSource — signed-in → bucket, guest/offline → S1 data-URI', () => {
  const capped = { source: CAPPED_DATA_URL, width: 800, height: 600 };
  const full = { width: 4000, height: 3000 };

  it('SIGNED-IN: uploads full-res, stores sourcePath + full dims, and strips the base64 source', async () => {
    mockSupabase();
    const upload = vi.fn(async () => ({ sourcePath: 'user-1/src-1/source.jpg' }));
    const params = await persistEtchSource({ userId: 'user-1', file: makeSourceFile(), capped, full, upload });
    expect(params.sourcePath).toBe('user-1/src-1/source.jpg');
    expect(params.sourceWidth).toBe(4000); // full-res dims, not capped
    expect(params.sourceHeight).toBe(3000);
    expect('source' in params).toBe(false); // NO inline base64 in the saved design
    expect(upload).toHaveBeenCalledWith({ userId: 'user-1', file: expect.any(Blob) });
  });

  it('GUEST: no userId → returns the S1 capped data-URI params UNCHANGED and never uploads', async () => {
    mockSupabase();
    const upload = vi.fn();
    const params = await persistEtchSource({ userId: null, file: makeSourceFile(), capped, full, upload });
    expect(params).toEqual({ source: CAPPED_DATA_URL, sourceWidth: 800, sourceHeight: 600 });
    expect('sourcePath' in params).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('OFFLINE: no supabase client → S1 fallback even with a userId', async () => {
    _ref.client = null;
    const upload = vi.fn();
    const params = await persistEtchSource({ userId: 'user-1', file: makeSourceFile(), capped, full, upload });
    expect(params).toEqual({ source: CAPPED_DATA_URL, sourceWidth: 800, sourceHeight: 600 });
    expect(upload).not.toHaveBeenCalled();
  });

  it('UPLOAD FAILURE: falls back to the local data-URI — the maker never loses work', async () => {
    mockSupabase();
    const upload = vi.fn(async () => { throw new Error('network'); });
    const params = await persistEtchSource({ userId: 'user-1', file: makeSourceFile(), capped, full, upload });
    expect(params).toEqual({ source: CAPPED_DATA_URL, sourceWidth: 800, sourceHeight: 600 });
    expect('sourcePath' in params).toBe(false);
  });
});

// ── Load path: fetchEtchSourceDataUrl (download, not signed URL) ──────────────

describe('fetchEtchSourceDataUrl — downloads the source into a data-URL', () => {
  it('downloads from the bucket and returns a data-URL (keeps the resample canvas same-origin)', async () => {
    const { storageBucket, client } = mockSupabase();
    const url = await fetchEtchSourceDataUrl('user-1/src-1/source.png');
    expect(client.storage.from).toHaveBeenCalledWith(ETCH_SOURCE_BUCKET);
    expect(storageBucket.download).toHaveBeenCalledWith('user-1/src-1/source.png');
    expect(url).toMatch(/^data:image\/png;base64,/);
  });

  it('memoizes by sourcePath — a re-resolve does not re-download the full blob', async () => {
    const { storageBucket } = mockSupabase();
    const a = await fetchEtchSourceDataUrl('user-1/src-1/source.png');
    const b = await fetchEtchSourceDataUrl('user-1/src-1/source.png');
    expect(a).toBe(b);
    expect(storageBucket.download).toHaveBeenCalledTimes(1);
  });

  it('SIGN-OUT SAFETY (S-1): after _clearEtchSourceCache the SAME path re-downloads, never serving a prior account cached bytes', async () => {
    const { storageBucket } = mockSupabase();
    await fetchEtchSourceDataUrl('userA/src-1/source.png'); // account A caches
    expect(storageBucket.download).toHaveBeenCalledTimes(1);
    // The exact call AuthContext makes on SIGNED_OUT / signOut.
    _clearEtchSourceCache();
    // Account B (same tab) resolving the same lingering path must hit the
    // RLS-enforced download again, not the previous owner's cached photo.
    await fetchEtchSourceDataUrl('userA/src-1/source.png');
    expect(storageBucket.download).toHaveBeenCalledTimes(2);
  });

  it('returns null (and evicts, so a later resolve retries) on a download error', async () => {
    const bucket = makeStorageBucket({ downloadResult: { data: null, error: new Error('nope') } });
    const { storageBucket } = mockSupabase({ bucket });
    expect(await fetchEtchSourceDataUrl('user-1/src-1/source.png')).toBeNull();
    // evicted → a second call re-attempts the download.
    await fetchEtchSourceDataUrl('user-1/src-1/source.png');
    expect(storageBucket.download).toHaveBeenCalledTimes(2);
  });

  it('returns null offline', async () => {
    _ref.client = null;
    expect(await fetchEtchSourceDataUrl('user-1/src-1/source.png')).toBeNull();
  });
});

// ── resolveEtchSourceUrl — the SAME seam both paths feed resolveEtchBitmap ────

describe('resolveEtchSourceUrl — guest inline vs signed-in bucket', () => {
  it('GUEST: returns the inline data-URI as-is and never fetches', async () => {
    const fetchSource = vi.fn();
    const layer = { params: { source: CAPPED_DATA_URL } };
    expect(await resolveEtchSourceUrl(layer, fetchSource)).toBe(CAPPED_DATA_URL);
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it('SIGNED-IN: fetches the sourcePath from the bucket', async () => {
    const fetchSource = vi.fn(async () => 'data:image/png;base64,ZZ==');
    const layer = { params: { sourcePath: 'user-1/src-1/source.png' } };
    expect(await resolveEtchSourceUrl(layer, fetchSource)).toBe('data:image/png;base64,ZZ==');
    expect(fetchSource).toHaveBeenCalledWith('user-1/src-1/source.png');
  });

  it('returns null when the layer has neither source nor sourcePath', async () => {
    expect(await resolveEtchSourceUrl({ params: {} }, vi.fn())).toBeNull();
    expect(await resolveEtchSourceUrl(null, vi.fn())).toBeNull();
  });
});

// ── Migration presence/shape (NO SQL executed — human-gated) ──────────────────

describe('migration 015 — private etch-sources bucket + owner-only RLS (authored, NOT applied)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationPath = resolve(here, '../../../supabase/migrations/20250101000015_etch_sources.sql');

  it('exists and provisions a PRIVATE bucket named etch-sources', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("'etch-sources'");
    expect(sql).toMatch(/insert into storage\.buckets/i);
    // public = false → private bucket, served only via the owner's session.
    expect(sql).toMatch(/false/);
  });

  it('scopes object access to the owner uid (first path segment) — owner-only RLS', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/);
    expect(sql).toMatch(/on storage\.objects for all/i);
  });

  it('is flagged HUMAN-GATED and adds no table/column (sourcePath rides in designs.config jsonb)', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toMatch(/HUMAN-GATED/i);
    expect(sql).not.toMatch(/create table/i);
  });
});
