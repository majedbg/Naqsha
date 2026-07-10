// materialEvaluationService.test.js — material-evaluation slice 1
//
// The evaluation-submission service: one maker photo + one render screenshot
// stored as ONE row (the pairing is the atomic unit of evidence — vision doc).
// Mirrors userMotifService's supabase-mock idiom (mutable ref + chainable
// builder), extended with a storage mock for the private bucket.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const _ref = { client: null };
vi.mock('./supabase', () => ({
  get supabase() { return _ref.client; },
}));

import {
  EVALUATION_BUCKET,
  MAX_PHOTO_BYTES,
  ALLOWED_PHOTO_TYPES,
  extensionForMime,
  buildEvaluationPaths,
  dataUrlToBlob,
  validateSubmission,
  evaluationToRow,
  rowToEvaluation,
  submitEvaluation,
  loadEvaluations,
} from './materialEvaluationService';

// ── Mock plumbing ────────────────────────────────────────────────────────────

function makeChain(resolution) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    eq: () => chain,
    order: () => chain,
    single: () => chain,
    then(resolve, reject) {
      return Promise.resolve(resolution).then(resolve, reject);
    },
  };
  return chain;
}

function makeStorageBucket({ uploadResult, signedResult } = {}) {
  return {
    upload: vi.fn(async () => uploadResult ?? { data: { path: 'p' }, error: null }),
    createSignedUrl: vi.fn(async (path) =>
      signedResult ?? { data: { signedUrl: `https://signed/${path}` }, error: null }),
    remove: vi.fn(async () => ({ data: null, error: null })),
  };
}

function mockSupabase({ fromImpl, bucket } = {}) {
  const storageBucket = bucket ?? makeStorageBucket();
  _ref.client = {
    from: vi.fn(fromImpl ?? (() => makeChain({ data: null, error: null }))),
    storage: { from: vi.fn(() => storageBucket) },
  };
  return { client: _ref.client, storageBucket };
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

const MATERIAL = { id: 'turquoise-opaque', name: 'Turquoise Opaque', type: 'acrylic', hex: '#61DBC2' };
// 1×1 transparent PNG.
const RENDER_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function makePhotoFile({ type = 'image/jpeg', size = 1024 } = {}) {
  const file = new Blob([new Uint8Array(size)], { type });
  file.name = `photo.${type.split('/')[1]}`;
  return file;
}

const ROW = {
  id: 'eval-1',
  user_id: 'user-1',
  material_id: 'turquoise-opaque',
  material_name: 'Turquoise Opaque',
  archetype: 'opaque-acrylic',
  kind: 'material-vs-render',
  photo_path: 'user-1/eval-1/photo.jpg',
  render_path: 'user-1/eval-1/render.png',
  note: 'my sheet, daylight',
  created_at: '2026-07-10T00:00:00Z',
};

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

describe('buildEvaluationPaths — pure', () => {
  it('builds owner-first paths (RLS: first segment is the owner uid)', () => {
    const paths = buildEvaluationPaths({
      userId: 'user-1',
      evaluationId: 'eval-1',
      photoMime: 'image/jpeg',
    });
    expect(paths.photoPath).toBe('user-1/eval-1/photo.jpg');
    expect(paths.renderPath).toBe('user-1/eval-1/render.png');
  });

  it('derives the photo extension from its mime', () => {
    const paths = buildEvaluationPaths({
      userId: 'u',
      evaluationId: 'e',
      photoMime: 'image/webp',
    });
    expect(paths.photoPath).toBe('u/e/photo.webp');
  });
});

describe('dataUrlToBlob — pure', () => {
  it('decodes a PNG data URL into a Blob with the right mime', () => {
    const blob = dataUrlToBlob(RENDER_DATA_URL);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('returns null for a non-data-URL string', () => {
    expect(dataUrlToBlob('https://example.com/x.png')).toBeNull();
    expect(dataUrlToBlob(null)).toBeNull();
  });
});

describe('validateSubmission — pure', () => {
  const valid = {
    material: MATERIAL,
    photoFile: makePhotoFile(),
    renderDataUrl: RENDER_DATA_URL,
  };

  it('accepts a complete submission', () => {
    expect(validateSubmission(valid)).toEqual({ ok: true });
  });

  it('rejects a missing material / photo / render', () => {
    expect(validateSubmission({ ...valid, material: null }).ok).toBe(false);
    expect(validateSubmission({ ...valid, photoFile: null }).ok).toBe(false);
    expect(validateSubmission({ ...valid, renderDataUrl: null }).ok).toBe(false);
  });

  it('rejects a photo of a disallowed type (mirrors the bucket mime allowlist)', () => {
    const res = validateSubmission({ ...valid, photoFile: makePhotoFile({ type: 'image/gif' }) });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/PNG|JPEG|WebP/i);
  });

  it('rejects a photo over the bucket size cap', () => {
    const res = validateSubmission({
      ...valid,
      photoFile: makePhotoFile({ size: MAX_PHOTO_BYTES + 1 }),
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/10\s?MB/i);
  });
});

describe('evaluationToRow / rowToEvaluation — pure mappers', () => {
  it('evaluationToRow builds the snake_case insert payload (user_id added by caller)', () => {
    const row = evaluationToRow({
      material: MATERIAL,
      archetype: 'opaque-acrylic',
      photoPath: 'user-1/eval-1/photo.jpg',
      renderPath: 'user-1/eval-1/render.png',
      note: 'my sheet, daylight',
    });
    expect(row).toEqual({
      material_id: 'turquoise-opaque',
      material_name: 'Turquoise Opaque',
      archetype: 'opaque-acrylic',
      kind: 'material-vs-render',
      photo_path: 'user-1/eval-1/photo.jpg',
      render_path: 'user-1/eval-1/render.png',
      note: 'my sheet, daylight',
    });
  });

  it('rowToEvaluation maps the DB row to the in-app camelCase shape', () => {
    const e = rowToEvaluation(ROW);
    expect(e).toMatchObject({
      id: 'eval-1',
      materialId: 'turquoise-opaque',
      materialName: 'Turquoise Opaque',
      archetype: 'opaque-acrylic',
      kind: 'material-vs-render',
      photoPath: 'user-1/eval-1/photo.jpg',
      renderPath: 'user-1/eval-1/render.png',
      note: 'my sheet, daylight',
      createdAt: '2026-07-10T00:00:00Z',
    });
  });
});

// ── Service ──────────────────────────────────────────────────────────────────

describe('submitEvaluation', () => {
  const args = {
    userId: 'user-1',
    material: MATERIAL,
    archetype: 'opaque-acrylic',
    photoFile: makePhotoFile(),
    renderDataUrl: RENDER_DATA_URL,
    note: 'my sheet, daylight',
  };

  it('returns null when supabase is null (offline / no backend)', async () => {
    _ref.client = null;
    expect(await submitEvaluation(args)).toBeNull();
  });

  it('uploads photo + render to the private bucket and inserts ONE row', async () => {
    const inserted = vi.fn();
    const { client, storageBucket } = mockSupabase({
      fromImpl: (table) => {
        expect(table).toBe('material_evaluations');
        const chain = makeChain({ data: ROW, error: null });
        const origInsert = chain.insert;
        chain.insert = (payload) => { inserted(payload); return origInsert(payload); };
        return chain;
      },
    });

    const result = await submitEvaluation(args);

    expect(client.storage.from).toHaveBeenCalledWith(EVALUATION_BUCKET);
    expect(storageBucket.upload).toHaveBeenCalledTimes(2);
    const uploadedPaths = storageBucket.upload.mock.calls.map((c) => c[0]);
    expect(uploadedPaths.some((p) => /^user-1\/.+\/photo\.jpg$/.test(p))).toBe(true);
    expect(uploadedPaths.some((p) => /^user-1\/.+\/render\.png$/.test(p))).toBe(true);

    expect(inserted).toHaveBeenCalledTimes(1);
    const payload = inserted.mock.calls[0][0];
    expect(payload.user_id).toBe('user-1');
    expect(payload.material_id).toBe('turquoise-opaque');
    expect(payload.archetype).toBe('opaque-acrylic');
    // The row's paths point at the objects just uploaded.
    expect(uploadedPaths).toContain(payload.photo_path);
    expect(uploadedPaths).toContain(payload.render_path);

    expect(result.id).toBe('eval-1');
    expect(result.materialName).toBe('Turquoise Opaque');
  });

  it('throws when a storage upload errors (no row insert attempted)', async () => {
    const { client } = mockSupabase({
      bucket: makeStorageBucket({ uploadResult: { data: null, error: { message: 'upload failed' } } }),
    });
    await expect(submitEvaluation(args)).rejects.toMatchObject({ message: 'upload failed' });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('throws when the insert errors', async () => {
    mockSupabase({
      fromImpl: () => makeChain({ data: null, error: { message: 'insert failed' } }),
    });
    await expect(submitEvaluation(args)).rejects.toMatchObject({ message: 'insert failed' });
  });

  it('rejects an invalid submission before touching the network', async () => {
    const { client } = mockSupabase({});
    await expect(
      submitEvaluation({ ...args, photoFile: makePhotoFile({ type: 'image/gif' }) }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/PNG|JPEG|WebP/i) });
    expect(client.storage.from).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('loadEvaluations', () => {
  it('returns [] when supabase is null or userId is falsy', async () => {
    _ref.client = null;
    expect(await loadEvaluations('user-1')).toEqual([]);
    mockSupabase({});
    expect(await loadEvaluations(null)).toEqual([]);
  });

  it('lists the user rows newest-first with signed URLs for both sides', async () => {
    const { storageBucket } = mockSupabase({
      fromImpl: () => makeChain({ data: [ROW], error: null }),
    });
    const list = await loadEvaluations('user-1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('eval-1');
    expect(list[0].photoUrl).toBe(`https://signed/${ROW.photo_path}`);
    expect(list[0].renderUrl).toBe(`https://signed/${ROW.render_path}`);
    expect(storageBucket.createSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('keeps a row listed (URLs null) when signing fails — metadata still reviewable', async () => {
    mockSupabase({
      fromImpl: () => makeChain({ data: [ROW], error: null }),
      bucket: makeStorageBucket({ signedResult: { data: null, error: { message: 'no' } } }),
    });
    const list = await loadEvaluations('user-1');
    expect(list).toHaveLength(1);
    expect(list[0].photoUrl).toBeNull();
    expect(list[0].renderUrl).toBeNull();
  });

  it('throws when the query errors', async () => {
    mockSupabase({
      fromImpl: () => makeChain({ data: null, error: { message: 'load failed' } }),
    });
    await expect(loadEvaluations('user-1')).rejects.toMatchObject({ message: 'load failed' });
  });
});

describe('constants', () => {
  it('exposes the bucket + limits the migration also encodes', () => {
    expect(EVALUATION_BUCKET).toBe('material-evaluations');
    expect(MAX_PHOTO_BYTES).toBe(10 * 1024 * 1024);
    expect(ALLOWED_PHOTO_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });
});
