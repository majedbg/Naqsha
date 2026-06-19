import { supabase } from '../supabase';

export async function createOrg({ name, slug, accent, logo }) {
  if (!supabase) return null;
  // Map the UI-friendly aliases to the actual column names.
  const payload = { name, slug, accent_color: accent, logo_url: logo };
  const { data, error } = await supabase
    .from('orgs')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function isPlatformAdmin() {
  if (!supabase) return false;
  const { data: { user } = {} } = await supabase.auth.getUser();
  if (!user?.email) return false;
  // Mirrors the "platform_admins read own" RLS policy (email = auth.email()):
  // an unfiltered select would see every row in the mock and always be truthy.
  const { data, error } = await supabase
    .from('platform_admins')
    .select('email')
    .eq('email', user.email)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function listOrgs() {
  if (!supabase) return [];
  // RLS scopes the result to orgs the caller can read (member or platform admin).
  const { data, error } = await supabase.from('orgs').select('*');
  if (error) throw error;
  return data || [];
}

export async function assignOrgAdmin(orgId, email) {
  if (!supabase) return null;
  // Email-first row: claim-on-login links user_id when this person first signs in.
  const payload = {
    org_id: orgId,
    email,
    is_admin: true,
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
