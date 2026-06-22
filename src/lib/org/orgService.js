import { supabase } from '../supabase';

export async function getOrgBySlug(slug) {
  if (!supabase) return null;
  // maybeSingle: real Supabase `.single()` throws PGRST116 on zero rows; we want
  // null for an unknown slug.
  const { data, error } = await supabase
    .from('orgs')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// Open/close an org's guest submission window. Targets the `orgs` table
// (`orgs.submissions_open boolean`) — admin-only via RLS in production.
export async function setSubmissionsOpen(orgId, open) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('orgs')
    .update({ submissions_open: open })
    .eq('id', orgId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
