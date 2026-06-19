import { supabase } from '../supabase';

export async function addMemberByEmail(orgId, email, { isAdmin = false } = {}) {
  if (!supabase) return null;
  const payload = {
    org_id: orgId,
    email,
    is_admin: isAdmin,
    status: 'invited',
  };
  const { data, error } = await supabase
    .from('org_members')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function claimOnLogin(email, userId) {
  if (!supabase) return;
  // Match the pending invited row by email and activate it. The mock has no
  // `.is()`, so we filter on status='invited' (the same row as user_id IS NULL).
  const { error } = await supabase
    .from('org_members')
    .update({ user_id: userId, status: 'active' })
    .eq('email', email)
    .eq('status', 'invited');
  if (error) throw error;
}

export async function listRoster(orgId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('org_members')
    .select('*')
    .eq('org_id', orgId);
  if (error) throw error;
  return data || [];
}

export async function editMember(memberId, patch) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('org_members')
    .update(patch)
    .eq('id', memberId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeMember(memberId) {
  if (!supabase) return;
  // Membership removal must touch ONLY org_members — never submissions/jobs.
  const { error } = await supabase
    .from('org_members')
    .delete()
    .eq('id', memberId);
  if (error) throw error;
}

export async function isOrgAdmin(orgId, userId) {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('is_admin', true)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}
