// selectedMaterialForScene — the live-prop gate for the 3D Material→Appearance
// thread (spec §3.5, decision D14).
//
// `selectedMaterial` is LENS state (a sibling to the spacing/exaggeration live
// props), NOT part of the frozen design snapshot — so changing material updates
// the 3D scene without a Rebuild. This pure helper decides what the scene sees:
// the user's selected material ONLY when the Material lens is active; otherwise
// null, so Sheets falls back to the substrate's intrinsic descriptor (today's
// Operation-lens / no-material behavior).
//
// The mode check is load-bearing: in useColorView, `setMode` is independent of
// `materialId`, so `colorView.material` can be non-null while mode==='operation'.
// Collapsing both "operation lens" and "no material" to null here is exactly the
// single fallback case §3.5 describes. Imports NO three: node-testable.
//
// @param {{ mode?: 'operation'|'material', material?: object|null }} colorView
// @returns {object|null} the material for the 3D scene, or null to fall back.
export function selectedMaterialForScene(colorView) {
  if (!colorView || colorView.mode !== 'material') return null;
  return colorView.material ?? null;
}
