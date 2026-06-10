import { supabase } from './supabase';

export async function loadCollections(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('collections')
    .select('id, name, description, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCollection(userId, name, description = '') {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('collections')
    .insert({ user_id: userId, name, description })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCollection(collectionId, userId) {
  if (!supabase) return;
  let query = supabase
    .from('collections')
    .delete()
    .eq('id', collectionId);
  if (userId !== undefined) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
}

export async function renameCollection(collectionId, name, userId) {
  if (!supabase) return;
  let query = supabase
    .from('collections')
    .update({ name })
    .eq('id', collectionId);
  if (userId !== undefined) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) throw error;
}

export async function addDesignToCollection(collectionId, designId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('collection_designs')
    .insert({ collection_id: collectionId, design_id: designId });
  if (error && error.code !== '23505') throw error; // ignore duplicate
}

export async function removeDesignFromCollection(collectionId, designId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('collection_designs')
    .delete()
    .eq('collection_id', collectionId)
    .eq('design_id', designId);
  if (error) throw error;
}

export async function loadCollectionDesigns(collectionId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('collection_designs')
    .select('design_id, sort_order, added_at, designs:design_id(id, name, thumbnail, updated_at)')
    .eq('collection_id', collectionId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((cd) => ({ ...cd.designs, sort_order: cd.sort_order }));
}
