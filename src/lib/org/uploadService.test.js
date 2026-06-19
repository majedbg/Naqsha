// uploadService.test.js — Worker 2d
// Unit tests (inline spy-based storage mock). The shared supabaseMock's
// storage.from() drops the bucket arg and upload() drops body/options, so we
// wire our own spies to assert the exact upload call.

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mutable-ref getter pattern (mirrors submissionService.test.js). The file lives
// in src/lib/org/, so it imports '../supabase'.
const _ref = { client: null };
vi.mock('../supabase', () => ({
  get supabase() { return _ref.client; },
}));

import { uploadSubmissionSvg, UploadValidationError } from './uploadService';

// Build a supabase-shaped client whose storage upload is spied. `uploadResult`
// lets a test inject the { data, error } the real storage API would return.
function mockStorage(uploadResult = { data: { path: 'x' }, error: null }) {
  const uploadSpy = vi.fn().mockResolvedValue(uploadResult);
  const fromSpy = vi.fn(() => ({ upload: uploadSpy }));
  _ref.client = { storage: { from: fromSpy } };
  return { fromSpy, uploadSpy };
}

beforeEach(() => {
  vi.clearAllMocks();
  _ref.client = null;
});

// ─── Behavior 1: TRACER ──────────────────────────────────────────────────────
describe('uploadSubmissionSvg — tracer', () => {
  it('uploads to <orgId>/<submissionId>.svg in the submissions bucket', async () => {
    const { fromSpy, uploadSpy } = mockStorage();
    const svgString = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

    const path = await uploadSubmissionSvg({
      orgId: 'org-1',
      submissionId: 'sub-1',
      svgString,
    });

    expect(path).toBe('org-1/sub-1.svg');
    expect(fromSpy).toHaveBeenCalledWith('submissions');
    expect(uploadSpy).toHaveBeenCalledWith('org-1/sub-1.svg', svgString, {
      contentType: 'image/svg+xml',
    });
  });
});

// ─── Behavior 2: rejects oversize (>5MB) BEFORE uploading ────────────────────
describe('uploadSubmissionSvg — oversize', () => {
  it('throws a typed error and never calls upload for >5MB input', async () => {
    const { uploadSpy } = mockStorage();
    // Looks like a valid SVG (so it does not trip the type check first), then
    // padded past the 5MB byte ceiling.
    const oversize = `<svg>${'a'.repeat(5 * 1024 * 1024 + 1)}</svg>`;

    await expect(
      uploadSubmissionSvg({ orgId: 'org-1', submissionId: 'sub-1', svgString: oversize }),
    ).rejects.toBeInstanceOf(UploadValidationError);

    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('measures the ceiling in UTF-8 bytes, not string length', async () => {
    const { uploadSpy } = mockStorage();
    // '€' is 3 UTF-8 bytes but length 1. Just over half the cap in chars puts
    // the byte length over the cap, so a length-based check would wrongly pass.
    const justOverInBytes = Math.ceil((5 * 1024 * 1024 + 1) / 3);
    const svgString = `<svg>${'€'.repeat(justOverInBytes)}</svg>`;

    await expect(
      uploadSubmissionSvg({ orgId: 'org-1', submissionId: 'sub-1', svgString }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});

// ─── Behavior 4: storage upload error surfaces as a throw ────────────────────
describe('uploadSubmissionSvg — storage error', () => {
  it('throws when the storage upload returns an error', async () => {
    const storageError = { message: 'bucket policy denied' };
    mockStorage({ data: null, error: storageError });

    await expect(
      uploadSubmissionSvg({
        orgId: 'org-1',
        submissionId: 'sub-1',
        svgString: '<svg></svg>',
      }),
    ).rejects.toBe(storageError);
  });
});

// ─── Behavior 3: rejects non-SVG / empty input ───────────────────────────────
describe('uploadSubmissionSvg — invalid content', () => {
  it('throws a typed error for empty input and never uploads', async () => {
    const { uploadSpy } = mockStorage();

    await expect(
      uploadSubmissionSvg({ orgId: 'org-1', submissionId: 'sub-1', svgString: '' }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("throws a typed error when content doesn't look like <svg", async () => {
    const { uploadSpy } = mockStorage();

    await expect(
      uploadSubmissionSvg({
        orgId: 'org-1',
        submissionId: 'sub-1',
        svgString: '<html><body>nope</body></html>',
      }),
    ).rejects.toBeInstanceOf(UploadValidationError);
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
