// submissionStorage.test.js — Phase 3 integration (download side).
// Mirrors uploadService.test.js: mutable-ref getter mock for ../supabase so a
// per-test client (or null) can be injected. The blob is duck-typed as
// { text: async () => ... } to avoid depending on a real Blob in the node env.

import { vi, describe, it, expect, beforeEach } from 'vitest';

const _ref = { client: null };
vi.mock('../supabase', () => ({
  get supabase() {
    return _ref.client;
  },
}));

import { loadSubmissionSvg } from './submissionStorage';

function mockStorage(downloadResult) {
  const downloadSpy = vi.fn().mockResolvedValue(downloadResult);
  const fromSpy = vi.fn(() => ({ download: downloadSpy }));
  _ref.client = { storage: { from: fromSpy } };
  return { fromSpy, downloadSpy };
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

describe('loadSubmissionSvg', () => {
  it('downloads the right bucket/path and returns the SVG text', async () => {
    const blob = { text: async () => '<svg id="loaded"/>' };
    const { fromSpy, downloadSpy } = mockStorage({ data: blob, error: null });

    const text = await loadSubmissionSvg('org-1/sub-1.svg');

    expect(text).toBe('<svg id="loaded"/>');
    expect(fromSpy).toHaveBeenCalledWith('submissions');
    expect(downloadSpy).toHaveBeenCalledWith('org-1/sub-1.svg');
  });

  it('throws when the storage download returns an error', async () => {
    const storageError = { message: 'object not found' };
    mockStorage({ data: null, error: storageError });

    await expect(loadSubmissionSvg('org-1/missing.svg')).rejects.toBe(
      storageError,
    );
  });

  it('returns null when supabase is not configured', async () => {
    _ref.client = null;
    await expect(loadSubmissionSvg('org-1/sub-1.svg')).resolves.toBeNull();
  });
});
