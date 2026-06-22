import { supabase } from '../supabase';

// Member-facing job submission service. Submissions are an immutable snapshot:
// dims, ops, material_label and svg_path are captured at creation time so they
// survive later catalog edits.

export async function createSubmission({
  orgId,
  submittedBy,
  orgMaterialId,
  materialLabel,
  source,
  designId,
  svgPath,
  widthMm,
  heightMm,
  ops,
  name,
  notes,
}) {
  if (!supabase) return null;
  const payload = {
    org_id: orgId,
    submitted_by: submittedBy,
    org_material_id: orgMaterialId,
    material_label: materialLabel,
    source,
    design_id: designId,
    svg_path: svgPath,
    width_mm: widthMm,
    height_mm: heightMm,
    ops,
    name,
    notes,
    status: 'pending',
  };
  const { data, error } = await supabase
    .from('submissions')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Guest-facing submission for OPEN orgs. The anon RLS policy permits INSERT only
// (submitted_by IS NULL, guest_name present, org open, svg_path org-prefixed) and
// grants anon NO SELECT, so we must NOT chain `.select()` — a read-back would be
// denied and throw even after a successful insert.
export async function createGuestSubmission({
  orgId,
  guestName,
  guestEmail,
  guestPhone,
  orgMaterialId,
  materialLabel,
  source,
  designId,
  svgPath,
  widthMm,
  heightMm,
  ops,
  name,
  notes,
}) {
  if (!supabase) return null;
  const payload = {
    org_id: orgId,
    submitted_by: null,
    guest_name: guestName,
    guest_email: guestEmail ?? null,
    guest_phone: guestPhone ?? null,
    org_material_id: orgMaterialId,
    material_label: materialLabel,
    source,
    design_id: designId ?? null,
    svg_path: svgPath,
    width_mm: widthMm,
    height_mm: heightMm,
    ops,
    name,
    status: 'pending',
    notes: notes ?? null,
  };
  const { error } = await supabase.from('submissions').insert(payload);
  if (error) throw error;
  // Anon cannot read the row back (no SELECT policy), so return a minimal
  // client-side acknowledgement instead of the DB row.
  return { ok: true };
}

export async function listMine(orgId, userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('org_id', orgId)
    .eq('submitted_by', userId);
  if (error) throw error;
  return data || [];
}

export async function listForOrg(orgId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('org_id', orgId);
  if (error) throw error;
  return data || [];
}

export async function markStatus(submissionId, status) {
  if (!supabase) return null;
  const payload = { status };
  if (status === 'cut') {
    payload.cut_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from('submissions')
    .update(payload)
    .eq('id', submissionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
