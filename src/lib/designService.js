import { supabase } from './supabase';

export async function saveDesign(userId, name, config, thumbnail, existingId) {
  if (!supabase) return null;
  const payload = { user_id: userId, name, config, thumbnail };

  if (existingId) {
    const { data, error } = await supabase
      .from('designs')
      .update(payload)
      .eq('id', existingId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('designs')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function loadUserDesigns(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('designs')
    .select('id, name, thumbnail, share_token, share_mode, created_at, updated_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function loadDesign(designId, userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('designs')
    .select('*')
    .eq('id', designId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDesign(designId, userId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('designs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', designId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function countUserDesigns(userId) {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from('designs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) throw error;
  return count || 0;
}

export function generateShareToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function enableSharing(designId, userId, mode = 'view') {
  if (!supabase) return null;
  const token = generateShareToken();
  const { data, error } = await supabase
    .from('designs')
    .update({ share_token: token, share_mode: mode })
    .eq('id', designId)
    .eq('user_id', userId)
    .select('share_token, share_mode')
    .single();
  if (error) throw error;
  return data;
}

export async function revokeSharing(designId, userId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('designs')
    .update({ share_token: null, share_mode: 'none' })
    .eq('id', designId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function loadSharedDesign(token) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_shared_design', { token });
  if (error) throw error;
  return data;
}

export async function saveHistorySnapshot(designId, userId, config, thumbnail) {
  if (!supabase) return;
  // Insert snapshot
  const { error: insertErr } = await supabase
    .from('design_history')
    .insert({ design_id: designId, user_id: userId, config, thumbnail });
  if (insertErr) throw insertErr;

  // Prune to last 50 snapshots
  const { data: all } = await supabase
    .from('design_history')
    .select('id')
    .eq('design_id', designId)
    .order('created_at', { ascending: false });
  if (all && all.length > 50) {
    const toDelete = all.slice(50).map((h) => h.id);
    await supabase.from('design_history').delete().in('id', toDelete);
  }
}
