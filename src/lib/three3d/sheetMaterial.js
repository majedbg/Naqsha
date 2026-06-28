// sheetMaterial — the pure mapping that decides WHICH three material a Surface-A
// slab renders and with what appearance-driven channels (S4, spec §3.5/§3.2).
//
//   resolveSheetMaterial({ appearance, descriptor }) -> SheetMaterialProps
//
// This is the extractable math for the otherwise-WebGL S4 slice: given the
// selected material's resolved AppearanceParams (or null) and the slab's intrinsic
// substrate MaterialDescriptor, it returns a flat, three-free bag the `.jsx`
// switches on. Keeping it pure makes the appearance→material decision unit-testable
// without a renderer; Sheets.jsx only maps `mode` → a three material element and
// passes these channels straight through.
//
// Precedence (spec §3.5): when a material lens is active (`appearance` present) the
// resolved archetype DRIVES the material — its transmission/clearcoat decide the
// render mode, overriding the substrate descriptor's intrinsic type. When no
// material is selected (`appearance` null) the result is BYTE-IDENTICAL to the
// pre-S4 substrate-descriptor behavior (the no-material fallback, asserted below).
//
// Imports NO three: stays node-testable.

/**
 * @typedef {'transmission'|'standard'|'physical'} SheetMaterialMode
 * @typedef {{ mode:SheetMaterialMode, color:string, transmission:number,
 *             roughness:number, metalness:number, ior:number, clearcoat:number }}
 *   SheetMaterialProps
 */

// Acrylic PMMA index of refraction; the fallback when a source omits ior.
const DEFAULT_IOR = 1.49;
// Pre-S4 Sheets defaults, preserved for the no-material fallback path.
const TRANSMISSIVE_DEFAULT_ROUGHNESS = 0.15;
const STANDARD_DEFAULT_ROUGHNESS = 0.8;

/**
 * Resolve the three material + appearance channels for one slab.
 *
 * @param {{ appearance?: import('./resolveAppearance.js').AppearanceParams|null,
 *           descriptor?: import('./sheetSpecs.js').MaterialDescriptor }} args
 * @returns {SheetMaterialProps}
 */
export function resolveSheetMaterial({ appearance = null, descriptor = {} } = {}) {
  // No material lens → reproduce the pre-S4 substrate-descriptor behavior exactly.
  if (!appearance) {
    if (descriptor.type === 'transmissive') {
      return {
        mode: 'transmission',
        color: descriptor.color,
        transmission: 1,
        roughness: descriptor.roughness ?? TRANSMISSIVE_DEFAULT_ROUGHNESS,
        metalness: 0,
        ior: descriptor.ior ?? DEFAULT_IOR,
        clearcoat: 0,
      };
    }
    return {
      mode: 'standard',
      color: descriptor.color,
      transmission: 0,
      roughness: descriptor.roughness ?? STANDARD_DEFAULT_ROUGHNESS,
      metalness: 0,
      ior: descriptor.ior ?? DEFAULT_IOR,
      clearcoat: 0,
    };
  }

  // Material lens active → the resolved archetype drives the material.
  const color = appearance.tintHex;
  const roughness = appearance.roughness ?? STANDARD_DEFAULT_ROUGHNESS;
  const metalness = appearance.metalness ?? 0;
  const ior = appearance.ior ?? DEFAULT_IOR;
  const clearcoat = appearance.clearcoat ?? 0;
  const transmission = appearance.transmission ?? 0;

  // See-through archetypes (clear / translucent / fluorescent acrylic) →
  // MeshTransmissionMaterial, with the archetype's own transmission strength.
  if (transmission > 0) {
    return { mode: 'transmission', color, transmission, roughness, metalness, ior, clearcoat: 0 };
  }

  // Opaque + a clearcoat term (pearlescent nacre, §3.2) needs MeshPhysicalMaterial;
  // meshStandardMaterial can't do clearcoat. Everything else opaque (opaque-acrylic,
  // mirror, wood, opaque-tinted) is a plain standard material.
  if (clearcoat > 0) {
    return { mode: 'physical', color, transmission: 0, roughness, metalness, ior, clearcoat };
  }
  return { mode: 'standard', color, transmission: 0, roughness, metalness, ior, clearcoat: 0 };
}
