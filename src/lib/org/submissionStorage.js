import { supabase } from '../supabase';

const BUCKET = 'submissions';

// Downloads a previously-uploaded submission SVG from the private `submissions`
// bucket and returns its text. The mirror of uploadService.uploadSubmissionSvg:
// upload writes `<orgId>/<submissionId>.svg`, this reads it back for the admin
// aggregate/export flow (AggregatePanel's `loadSvg`). The storage download API
// returns a Blob in `data`; we resolve it to a string. Returns null when
// supabase is unconfigured (local dev without backend).
export async function loadSubmissionSvg(svgPath) {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(svgPath);
  if (error) throw error;
  return data.text();
}
