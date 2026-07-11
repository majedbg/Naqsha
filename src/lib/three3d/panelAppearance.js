// panelAppearance — pure, three-free resolution of a PANEL's own material choice
// (panel.materialId, panels.js) into the AppearanceParams the 3D scene renders.
//
// Precedence per sheet (the per-panel extension of spec §3.5):
//   1. explicit — the panel's materialId resolves against the preview-material
//      catalog → that material's appearance ALWAYS applies in 3D, regardless of
//      the canvas Color-View lens mode (the user pinned this panel's stock).
//   2. fallback — no/unknown materialId → the caller's fallback appearance (the
//      canvas-level Material-lens appearance, or null → substrate optics).
//
// Lives on the 2D side of the dynamic-import boundary (like sheetSpecs /
// sheetMaterial) so both the R3F layer and the mark builder (markTexture) can
// share it, and it stays node-testable.

import { resolveAppearance } from './resolveAppearance.js';
import { DEFAULT_PREVIEW_MATERIALS } from '../materialPreview.js';

/**
 * Catalog lookup by id. Unknown/absent id → null (never throws), so a stale
 * materialId persisted against a since-removed catalog entry degrades to the
 * fallback appearance instead of breaking the scene.
 * @param {string|null|undefined} materialId
 * @param {Array<{id:string}>} [materials]
 * @returns {object|null}
 */
export function materialById(materialId, materials = DEFAULT_PREVIEW_MATERIALS) {
  if (!materialId || !Array.isArray(materials)) return null;
  return materials.find((m) => m && m.id === materialId) || null;
}

/**
 * The appearance one panel's sheet should render with: its own material's
 * resolved appearance when materialId names a catalog entry, else the fallback
 * (the document-level lens appearance, possibly null).
 * @param {string|null|undefined} materialId
 * @param {object|null} [fallbackAppearance] resolved AppearanceParams or null
 * @param {Array<{id:string}>} [materials]
 * @returns {object|null}
 */
export function appearanceForPanelMaterial(
  materialId,
  fallbackAppearance = null,
  materials = DEFAULT_PREVIEW_MATERIALS,
) {
  const material = materialById(materialId, materials);
  return material ? resolveAppearance(material) : fallbackAppearance;
}

/**
 * LIVE per-panel material map for the 3D scene: panelId → materialId (only
 * panels that have one). Built from the LIVE panels array so a material change
 * in the left panel re-tints an open 3D preview without a Rebuild — the same
 * live-prop path the canvas-level material lens rides (D14).
 * @param {object[]} [panels]
 * @returns {Record<string,string>}
 */
export function panelMaterialIds(panels) {
  const out = {};
  for (const p of Array.isArray(panels) ? panels : []) {
    if (p && p.id && p.materialId) out[p.id] = p.materialId;
  }
  return out;
}
