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
// material is selected (`appearance` null) the descriptor supplies IDENTITY only
// (kind decides the render mode via `type`, color tints) and the OPTICS come from
// the archetypes' substrate fallback (materialArchetypes.substrateOptics) — the
// single source of optics per ADR 0003. (This replaced the pre-S4 byte-identical
// contract, under which the descriptor carried its own roughness/ior duplicate.)
//
// Imports NO three: stays node-testable.
import { substrateOptics } from './materialArchetypes.js';

/**
 * @typedef {'transmission'|'standard'|'physical'} SheetMaterialMode
 * @typedef {{ mode:SheetMaterialMode, color:string, transmission:number,
 *             roughness:number, metalness:number, ior:number, clearcoat:number }}
 *   SheetMaterialProps
 */

// Acrylic PMMA index of refraction; the fallback when an appearance omits ior.
const DEFAULT_IOR = 1.49;
// Fallback roughness when an appearance omits it (matches the pre-ADR-0003 value).
const STANDARD_DEFAULT_ROUGHNESS = 0.8;

/**
 * Resolve the three material + appearance channels for one slab.
 *
 * @param {{ appearance?: import('./resolveAppearance.js').AppearanceParams|null,
 *           descriptor?: import('./sheetSpecs.js').MaterialDescriptor }} args
 * @returns {SheetMaterialProps}
 */
export function resolveSheetMaterial({ appearance = null, descriptor = {} } = {}) {
  // No material lens → descriptor identity (type/kind/color) + archetype optics.
  if (!appearance) {
    if (descriptor.type === 'transmissive') {
      // A transmissive descriptor is acrylic by construction (sheetSpecs D7); the
      // `|| 'acrylic'` guards a kind-less descriptor from landing in the opaque
      // fallback optics (transmission 0 inside transmission mode).
      const optics = substrateOptics(descriptor.kind || 'acrylic');
      return {
        mode: 'transmission',
        color: descriptor.color,
        transmission: optics.transmission,
        roughness: optics.roughness,
        metalness: 0,
        ior: optics.ior,
        clearcoat: 0,
      };
    }
    const optics = substrateOptics(descriptor.kind);
    return {
      mode: 'standard',
      color: descriptor.color,
      transmission: 0,
      roughness: optics.roughness,
      metalness: 0,
      ior: optics.ior,
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
  // faceGlow (fluorescent body re-emission, LSC model) rides along as a FAINT
  // emissive on the face material — non-bloomed; the hot TIR-guided emission
  // is the edge mesh's edgeGain concern, not this.
  if (transmission > 0) {
    return {
      mode: 'transmission',
      color,
      transmission,
      roughness,
      metalness,
      ior,
      clearcoat: 0,
      faceGlow: appearance.faceGlow ?? 0,
      // The dye's Stokes-shifted emission hue for the faint face re-emission —
      // same override the edge/groove emission honors; face tint when absent.
      faceGlowHex: appearance.emissiveHex || color,
    };
  }

  // Opaque + a clearcoat term (pearlescent nacre, §3.2) needs MeshPhysicalMaterial;
  // meshStandardMaterial can't do clearcoat. Everything else opaque (opaque-acrylic,
  // mirror, wood, opaque-tinted) is a plain standard material.
  if (clearcoat > 0) {
    return { mode: 'physical', color, transmission: 0, roughness, metalness, ior, clearcoat };
  }
  return { mode: 'standard', color, transmission: 0, roughness, metalness, ior, clearcoat: 0 };
}
