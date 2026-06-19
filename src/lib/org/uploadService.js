import { supabase } from '../supabase';

const BUCKET = 'submissions';

// 5MB ceiling, 1024-based. The check is on the UTF-8 byte length, not the JS
// string length (which diverges on multibyte chars).
const MAX_BYTES = 5 * 1024 * 1024;

export class UploadValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

// Uploads an ALREADY-SANITIZED SVG to the private `submissions` bucket at the
// path `<orgId>/<submissionId>.svg`. The org_id prefix is required by the
// storage + submissions RLS policies (the first path segment must equal the
// row's org_id). Returns the storage path.
export async function uploadSubmissionSvg({ orgId, submissionId, svgString }) {
  if (!supabase) return null;

  if (typeof svgString !== 'string' || !svgString.trimStart().startsWith('<svg')) {
    throw new UploadValidationError('Input does not look like an SVG document.');
  }

  const byteLength = new TextEncoder().encode(svgString).length;
  if (byteLength > MAX_BYTES) {
    throw new UploadValidationError(
      `SVG exceeds ${MAX_BYTES} bytes (got ${byteLength}).`,
    );
  }

  const path = `${orgId}/${submissionId}.svg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, svgString, { contentType: 'image/svg+xml' });
  if (error) throw error;
  return path;
}
