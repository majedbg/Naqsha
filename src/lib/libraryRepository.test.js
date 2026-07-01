// LibraryRepository (S0, issue #49) — CRUD on the unified user_patterns table
// + private per-user photo upload. Tests run against the chainable supabase
// mock (no Docker); live per-user RLS behavior is covered separately in
// src/test/rls.userPatterns.test.js.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSupabaseMock } from '../test/supabaseMock';

const _ref = { client: null };
vi.mock('./supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  saveExtractedPattern,
  listExtractedPatterns,
  deleteExtractedPattern,
  loadAndRegisterExtractedPatterns,
  PHOTO_BUCKET,
} from './libraryRepository';
import { makeExtractedPattern, serializeExtractedPattern } from './extraction/extractedPattern';
import { getDynamicPatternClass, unregisterPattern } from './patternRegistry';

const USER = { id: 'user-1' };

const entity = (patternId = 'extracted-lr-1') =>
  makeExtractedPattern({
    patternId,
    title: 'Repo tile',
    tile: {
      width: 30,
      height: 30,
      fills: [{ d: 'M5 5 L25 5 L25 25 L5 25 Z', role: 'engrave' }],
      strokes: [],
    },
  });

let seed;

beforeEach(() => {
  seed = { user_patterns: [] };
  _ref.client = createSupabaseMock(seed, { user: USER });
});

afterEach(() => {
  unregisterPattern('extracted-lr-1');
  unregisterPattern('extracted-lr-2');
});

describe('saveExtractedPattern', () => {
  it('inserts a serialized extracted row owned by the auth user', async () => {
    const res = await saveExtractedPattern(entity());
    expect(res.persisted).toBe(true);
    expect(seed.user_patterns).toHaveLength(1);
    const row = seed.user_patterns[0];
    expect(row.user_id).toBe('user-1');
    expect(row.source).toBe('extracted');
    expect(row.pattern_id).toBe('extracted-lr-1');
    expect(row.tile_svg).toContain('<path');
    expect(row.fabrication_tags).toEqual({ fills: ['engrave'], strokes: [] });
    expect(row.visibility).toBe('private');
  });

  it('uploads the original photo into the per-user bucket folder first', async () => {
    const uploads = [];
    const mock = createSupabaseMock(seed, { user: USER });
    mock.storage = {
      from(bucket) {
        return {
          async upload(path, blob, opts) {
            uploads.push({ bucket, path, blob, opts });
            return { data: { path }, error: null };
          },
        };
      },
    };
    _ref.client = mock;

    const photoBlob = { size: 3, type: 'image/png' };
    const res = await saveExtractedPattern(entity(), { photoBlob, photoExt: 'png' });
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bucket).toBe(PHOTO_BUCKET);
    expect(uploads[0].path).toBe('user-1/extracted-lr-1.png');
    // The stored row references the uploaded photo.
    expect(seed.user_patterns[0].photo_path).toBe('user-1/extracted-lr-1.png');
    expect(res.entity.photoPath).toBe('user-1/extracted-lr-1.png');
  });

  it('still persists the pattern when the photo upload fails (best-effort photo)', async () => {
    const mock = createSupabaseMock(seed, { user: USER });
    mock.storage = {
      from() {
        return {
          async upload() {
            return { data: null, error: { message: 'bucket missing' } };
          },
        };
      },
    };
    _ref.client = mock;
    const res = await saveExtractedPattern(entity(), { photoBlob: {}, photoExt: 'jpg' });
    expect(res.persisted).toBe(true);
    expect(seed.user_patterns[0].photo_path).toBeNull();
  });

  it('reports not-persisted for guests (no auth user) without throwing', async () => {
    _ref.client = createSupabaseMock(seed, { user: null });
    const res = await saveExtractedPattern(entity());
    expect(res.persisted).toBe(false);
    expect(res.reason).toBe('guest');
    expect(seed.user_patterns).toHaveLength(0);
  });

  it('reports not-persisted when supabase is unconfigured', async () => {
    _ref.client = null;
    const res = await saveExtractedPattern(entity());
    expect(res.persisted).toBe(false);
    expect(res.reason).toBe('no-supabase');
  });

  it('surfaces an insert error as persisted:false with the message', async () => {
    _ref.client = createSupabaseMock(seed, { user: USER })
      .injectError('user_patterns', 'insert', { message: 'RLS denied' });
    const res = await saveExtractedPattern(entity());
    expect(res.persisted).toBe(false);
    expect(res.reason).toContain('RLS denied');
  });
});

describe('listExtractedPatterns', () => {
  it('returns only the given user\'s extracted rows', async () => {
    seed.user_patterns.push(
      { ...serializeExtractedPattern(entity('extracted-lr-1')), user_id: 'user-1' },
      { ...serializeExtractedPattern(entity('extracted-lr-2')), user_id: 'user-2' },
      { user_id: 'user-1', source: 'ai', pattern_id: 'ai-1', name: 'AI', source_code: 'x' },
    );
    const rows = await listExtractedPatterns('user-1');
    expect(rows.map((r) => r.pattern_id)).toEqual(['extracted-lr-1']);
  });
});

describe('deleteExtractedPattern', () => {
  it('deletes by pattern_id and unregisters from the registry', async () => {
    await saveExtractedPattern(entity());
    await loadAndRegisterExtractedPatterns('user-1');
    expect(getDynamicPatternClass('extracted-lr-1')).toBeTruthy();
    await deleteExtractedPattern('extracted-lr-1');
    expect(seed.user_patterns).toHaveLength(0);
    expect(getDynamicPatternClass('extracted-lr-1')).toBeNull();
  });
});

describe('loadAndRegisterExtractedPatterns', () => {
  it('deserializes rows and registers each into the dynamic registry', async () => {
    seed.user_patterns.push(
      { ...serializeExtractedPattern(entity('extracted-lr-1')), user_id: 'user-1' },
      { ...serializeExtractedPattern(entity('extracted-lr-2')), user_id: 'user-1' },
    );
    const entities = await loadAndRegisterExtractedPatterns('user-1');
    expect(entities).toHaveLength(2);
    expect(getDynamicPatternClass('extracted-lr-1')).toBeTruthy();
    expect(getDynamicPatternClass('extracted-lr-2')).toBeTruthy();
  });

  it('skips corrupt rows instead of failing the whole load', async () => {
    seed.user_patterns.push(
      { pattern_id: 'extracted-bad', name: 'bad', source: 'extracted', tile_svg: '<svg></svg>', user_id: 'user-1' },
      { ...serializeExtractedPattern(entity('extracted-lr-1')), user_id: 'user-1' },
    );
    const entities = await loadAndRegisterExtractedPatterns('user-1');
    expect(entities).toHaveLength(1);
    expect(getDynamicPatternClass('extracted-lr-1')).toBeTruthy();
  });

  it('returns [] without supabase', async () => {
    _ref.client = null;
    expect(await loadAndRegisterExtractedPatterns('user-1')).toEqual([]);
  });

  // Adversarial-review finding 1: a crafted row (script payloads in d / role /
  // pattern_id) must be rejected at deserialize and skipped — never registered.
  it('skips crafted rows with markup payloads instead of registering them', async () => {
    seed.user_patterns.push(
      {
        pattern_id: 'extracted-evil',
        name: 'evil',
        source: 'extracted',
        user_id: 'user-1',
        tile_svg:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10">\n' +
          '  <path d="M0 0Z&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;" data-kind="fill" data-role="engrave" fill="#000"/>\n' +
          '</svg>',
        fabrication_tags: { fills: ['engrave'], strokes: [] },
      },
      { ...serializeExtractedPattern(entity('extracted-lr-1')), user_id: 'user-1' },
    );
    const entities = await loadAndRegisterExtractedPatterns('user-1');
    expect(entities).toHaveLength(1);
    expect(getDynamicPatternClass('extracted-evil')).toBeNull();
    expect(getDynamicPatternClass('extracted-lr-1')).toBeTruthy();
  });
});
