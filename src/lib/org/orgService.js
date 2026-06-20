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
