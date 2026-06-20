import { supabase } from '../supabase';

// Flatten a nested `org_materials` + `materials(*)` join row into the
// merged item the UI consumes. Explicit pick so the catalog material id
// never clobbers the org_materials id.
function flattenOrgMaterial(row) {
  const m = row.materials || {};
  return {
    id: row.id, // org_materials.id — toggle/UI key on this
    org_id: row.org_id,
    material_id: row.material_id,
    name: m.name,
    type: m.type,
    thickness_mm: m.thickness_mm,
    color: m.color,
    sheet_w_mm: row.sheet_w_mm,
    sheet_h_mm: row.sheet_h_mm,
    price: row.price,
    is_active: row.is_active,
  };
}

// The global materials catalog (platform-owned, read by any authenticated user).
// Feeds the MaterialAdmin "add material" dropdown.
export async function listMaterials() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .order('name');
  if (error) throw error;
  return data || [];
}

// All of an org's offerings INCLUDING inactive ones. The admin UI needs the
// inactive rows so its Activate toggle can round-trip a deactivated offering;
// the aggregate/sheet path uses listActiveOrgMaterials (active-only) instead.
export async function listOrgMaterials(orgId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('org_materials')
    .select('*, materials(*)')
    .eq('org_id', orgId);
  if (error) throw error;
  return (data || []).map(flattenOrgMaterial);
}

export async function listActiveOrgMaterials(orgId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('org_materials')
    .select('*, materials(*)')
    .eq('org_id', orgId)
    .eq('is_active', true);
  if (error) throw error;
  return (data || []).map(flattenOrgMaterial);
}

export async function addOrgMaterial(orgId, materialId, attrs = {}) {
  if (!supabase) return null;
  const payload = { org_id: orgId, material_id: materialId, ...attrs };
  const { data, error } = await supabase
    .from('org_materials')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleOrgMaterial(orgMaterialId, isActive) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('org_materials')
    .update({ is_active: isActive })
    .eq('id', orgMaterialId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
