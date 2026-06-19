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
