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
  getPhotoURL,
  updateExtractedPatternMeta,
  PHOTO_BUCKET,
} from './libraryRepository';
import { makeExtractedPattern, serializeExtractedPattern } from './extraction/extractedPattern';
import {
  getDynamicPatternClass,
  unregisterPattern,
  getDynamicLabel,
  getDynamicTypes,
  onRegistryChange,
} from './patternRegistry';
import { registerExtractedPattern } from './patterns/ExtractedPatternGenerator';
import { getLibraryEntry, clearLibraryEntries, addLibraryEntry } from './libraryStore';

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
  clearLibraryEntries();
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

  // Review finding 4 (storage hygiene): the ROW is inserted first, THEN the
  // photo uploads and the row's photo_path is updated — a failed insert can
  // never leave an orphaned storage object behind.
  it('inserts the row first, then uploads the photo and back-fills photo_path', async () => {
    const uploads = [];
    const mock = createSupabaseMock(seed, { user: USER });
    mock.storage = {
      from(bucket) {
        return {
          async upload(path, blob, opts) {
            uploads.push({ bucket, path, blob, opts, rowsAtUpload: seed.user_patterns.length });
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
    // Insert-before-upload: the row already existed when the upload ran.
    expect(uploads[0].rowsAtUpload).toBe(1);
    // The stored row references the uploaded photo.
    expect(seed.user_patterns[0].photo_path).toBe('user-1/extracted-lr-1.png');
    expect(res.entity.photoPath).toBe('user-1/extracted-lr-1.png');
  });

  it('never uploads the photo when the row insert fails (no orphaned objects)', async () => {
    const uploads = [];
    const mock = createSupabaseMock(seed, { user: USER })
      .injectError('user_patterns', 'insert', { message: 'RLS denied' });
    mock.storage = {
      from() {
        return {
          async upload(path) {
            uploads.push(path);
            return { data: { path }, error: null };
          },
        };
      },
    };
    _ref.client = mock;
    const res = await saveExtractedPattern(entity(), { photoBlob: {}, photoExt: 'png' });
    expect(res.persisted).toBe(false);
    expect(uploads).toHaveLength(0);
  });

  it('sanitizes the photo extension against the image whitelist', async () => {
    const uploads = [];
    const mock = createSupabaseMock(seed, { user: USER });
    mock.storage = {
      from() {
        return {
          async upload(path) {
            uploads.push(path);
            return { data: { path }, error: null };
          },
        };
      },
    };
    _ref.client = mock;
    // Uppercase allowed ext → lowercased; anything off-whitelist → 'jpg'.
    await saveExtractedPattern(entity('extracted-lr-1'), { photoBlob: {}, photoExt: 'JPEG' });
    await saveExtractedPattern(entity('extracted-lr-2'), { photoBlob: {}, photoExt: 'svg' });
    await saveExtractedPattern(entity('extracted-lr-3'), { photoBlob: {}, photoExt: 'png"; DROP' });
    expect(uploads).toEqual([
      'user-1/extracted-lr-1.jpeg',
      'user-1/extracted-lr-2.jpg',
      'user-1/extracted-lr-3.jpg',
    ]);
    unregisterPattern('extracted-lr-3');
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
    expect(res.entity.photoPath).toBeNull();
    expect(seed.user_patterns[0].photo_path).toBeNull();
  });

  it('stays persisted with a null photoPath when the photo_path back-fill fails', async () => {
    const mock = createSupabaseMock(seed, { user: USER })
      .injectError('user_patterns', 'update', { message: 'update denied' });
    _ref.client = mock;
    const res = await saveExtractedPattern(entity(), { photoBlob: {}, photoExt: 'png' });
    expect(res.persisted).toBe(true);
    // Truthful entity: the DB row still has photo_path null.
    expect(res.entity.photoPath).toBeNull();
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

  it('also drops the entry from the library store (one entity, two surfaces)', async () => {
    await saveExtractedPattern(entity());
    await loadAndRegisterExtractedPatterns('user-1');
    expect(getLibraryEntry('extracted-lr-1')).toBeTruthy();
    await deleteExtractedPattern('extracted-lr-1');
    expect(getLibraryEntry('extracted-lr-1')).toBeNull();
  });
});

describe('getPhotoURL', () => {
  it('resolves a signed URL for a stored photo path', async () => {
    const mock = createSupabaseMock(seed, { user: USER });
    mock.storage = {
      from(bucket) {
        return {
          async createSignedUrl(path, ttl) {
            return {
              data: { signedUrl: `https://cdn.test/${bucket}/${path}?ttl=${ttl}` },
              error: null,
            };
          },
        };
      },
    };
    _ref.client = mock;
    await expect(getPhotoURL('user-1/extracted-lr-1.png')).resolves.toBe(
      `https://cdn.test/${PHOTO_BUCKET}/user-1/extracted-lr-1.png?ttl=3600`
    );
  });

  it('degrades to null on missing path, signing error, or no supabase', async () => {
    const mock = createSupabaseMock(seed, { user: USER });
    mock.storage = {
      from() {
        return {
          async createSignedUrl() {
            return { data: null, error: { message: 'object not found' } };
          },
        };
      },
    };
    _ref.client = mock;
    await expect(getPhotoURL(null)).resolves.toBeNull();
    await expect(getPhotoURL('user-1/missing.png')).resolves.toBeNull();
    _ref.client = null;
    await expect(getPhotoURL('user-1/extracted-lr-1.png')).resolves.toBeNull();
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

// S9 (issue #58): editable-later metadata. Updates the store ALWAYS; persists
// best-effort. Palette + geometry are not editable here.
describe('updateExtractedPatternMeta', () => {
  it('persists a normalized metadata patch to the row and the store', async () => {
    seed.user_patterns = [
      { ...serializeExtractedPattern(entity()), user_id: 'user-1', created_at: '2026-07-01' },
    ];
    addLibraryEntry(entity());

    const res = await updateExtractedPatternMeta('extracted-lr-1', {
      title: '  New title  ',
      note: 'edited note',
      favorite: true,
      tags: ['Gothic', 'gothic', 'tracery'],
      material: 'Glass',
      tradition: 'Gothic tracery',
      palette: [{ hex: '#fff', coverage: 1 }], // not an editable field → ignored
    });

    expect(res.persisted).toBe(true);
    const row = seed.user_patterns[0];
    expect(row.name).toBe('New title');
    expect(row.note).toBe('edited note');
    expect(row.favorite).toBe(true);
    expect(row.tags).toEqual(['Gothic', 'tracery']); // deduped
    expect(row.material).toBe('glass'); // slug-normalized
    expect(row.palette).toEqual([]); // palette untouched by a metadata edit

    const stored = getLibraryEntry('extracted-lr-1').entity;
    expect(stored.title).toBe('New title');
    expect(stored.favorite).toBe(true);
    expect(stored.material).toBe('glass');
  });

  it('ignores a blank title edit so a name is never wiped', async () => {
    seed.user_patterns = [{ ...serializeExtractedPattern(entity()), user_id: 'user-1' }];
    addLibraryEntry(entity());
    await updateExtractedPatternMeta('extracted-lr-1', { title: '   ', note: 'kept' });
    expect(seed.user_patterns[0].name).toBe('Repo tile'); // unchanged
    expect(seed.user_patterns[0].note).toBe('kept');
  });

  it('updates the store but reports session-only for a guest', async () => {
    _ref.client = createSupabaseMock(seed, { user: null });
    addLibraryEntry(entity());
    const res = await updateExtractedPatternMeta('extracted-lr-1', { favorite: true });
    expect(res.persisted).toBe(false);
    expect(res.reason).toBe('guest');
    expect(getLibraryEntry('extracted-lr-1').entity.favorite).toBe(true);
  });
});

// S9 adversarial-review MAJOR: a title edit must not diverge the two surfaces.
// The Library store AND the dynamic registry (picker custom-family card label,
// getDynamicLabel → layer auto-naming, D6) must both reflect the new title —
// including for guests, whose edits are session-only.
describe('updateExtractedPatternMeta — title syncs the picker label', () => {
  it('updates getDynamicLabel for a signed-in edit', async () => {
    seed.user_patterns = [{ ...serializeExtractedPattern(entity()), user_id: 'user-1' }];
    registerExtractedPattern(entity()); // one entity, two surfaces
    expect(getDynamicLabel('extracted-lr-1')).toBe('Repo tile');

    const res = await updateExtractedPatternMeta('extracted-lr-1', { title: 'Renamed tile' });
    expect(res.persisted).toBe(true);
    expect(getDynamicLabel('extracted-lr-1')).toBe('Renamed tile');
    expect(getLibraryEntry('extracted-lr-1').entity.title).toBe('Renamed tile');
  });

  it('updates getDynamicLabel for a guest (session-only) edit', async () => {
    _ref.client = createSupabaseMock(seed, { user: null });
    registerExtractedPattern(entity());

    const res = await updateExtractedPatternMeta('extracted-lr-1', { title: 'Guest rename' });
    expect(res.persisted).toBe(false);
    expect(getDynamicLabel('extracted-lr-1')).toBe('Guest rename');
  });

  it('notifies registry subscribers so the picker re-renders live', async () => {
    registerExtractedPattern(entity());
    let notified = 0;
    const off = onRegistryChange(() => { notified += 1; });
    await updateExtractedPatternMeta('extracted-lr-1', { title: 'Live rename' });
    off();
    expect(notified).toBeGreaterThan(0);
    expect(getDynamicTypes().find((t) => t.id === 'extracted-lr-1').label).toBe('Live rename');
  });

  it('leaves the label untouched when the patch has no title', async () => {
    registerExtractedPattern(entity());
    await updateExtractedPatternMeta('extracted-lr-1', { favorite: true });
    expect(getDynamicLabel('extracted-lr-1')).toBe('Repo tile');
  });
});

// S9 adversarial-review MINOR: collection assignment defense-in-depth. The uuid
// must belong to THIS user's collections (RI bypasses RLS, so a crafted call
// could otherwise point the row at a foreign collection).
describe('updateExtractedPatternMeta — collection ownership verification', () => {
  const MINE = '123e4567-e89b-42d3-a456-426614174000';
  const FOREIGN = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(() => {
    seed.user_patterns = [{ ...serializeExtractedPattern(entity()), user_id: 'user-1' }];
    seed.collections = [
      { id: MINE, user_id: 'user-1', name: 'Uppsala trip', updated_at: '2026-07-01' },
      { id: FOREIGN, user_id: 'user-2', name: 'Not yours', updated_at: '2026-07-01' },
    ];
    addLibraryEntry(entity());
  });

  it('persists a collection the user owns', async () => {
    const res = await updateExtractedPatternMeta('extracted-lr-1', { collectionId: MINE });
    expect(res.persisted).toBe(true);
    expect(res.reason).toBeUndefined();
    expect(seed.user_patterns[0].collection_id).toBe(MINE);
  });

  it('nulls a collection uuid that is not in the user’s collections', async () => {
    const res = await updateExtractedPatternMeta('extracted-lr-1', { collectionId: FOREIGN });
    expect(res.persisted).toBe(true);
    expect(res.reason).toBe('unknown-collection');
    expect(seed.user_patterns[0].collection_id).toBeNull();
    expect(getLibraryEntry('extracted-lr-1').entity.collectionId).toBeNull();
  });

  it('clears an assignment with an explicit null (no verification round-trip)', async () => {
    seed.user_patterns[0].collection_id = MINE;
    const res = await updateExtractedPatternMeta('extracted-lr-1', { collectionId: null });
    expect(res.persisted).toBe(true);
    expect(seed.user_patterns[0].collection_id).toBeNull();
  });
});
