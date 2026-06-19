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

export async function claimOnLogin() {
  if (!supabase) return;
  // Claim is the SECURITY DEFINER RPC `claim_memberships()`: it derives identity
  // from the auth context (auth.uid()/auth.email()), enforces jwt_email_verified()
  // (invite-hijack defense), and flips matching invited org_members rows to
  // active + sets user_id (also fills platform_admins.user_id). A plain client
  // UPDATE is denied by RLS — there is no member-self-UPDATE policy on
  // org_members — so the RPC is the only working claim path.
  const { error } = await supabase.rpc('claim_memberships');
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
