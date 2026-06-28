// Material Archetypes — the in-code render archetypes for the 3D appearance
// system (spec: docs/material-3d-appearance-plan.md §3.1–§3.2; locked decision L1).
//
// "Archetypes in code, params as data." A small FIXED set of render archetypes
// live here as default AppearanceParams; the R3F/`.jsx` layer reads these defaults
// and builds the actual three materials/shaders from them. Per-material params
// (tint, transmission, roughness, edgeGain, …) are data resolved at runtime by
// `resolveAppearance.js` (S1), which MERGES these registry defaults with any
// explicit/inferred overrides.
//
// IMPORTANT: this module imports NO three — it stays a pure, node-testable map so
// the registry and resolver can be unit-tested without WebGL. Three-specific
// material construction lives in the `.jsx` (S4+).
//
// AppearanceParams contract (§3.1):
//   archetype     — one of ARCHETYPE_NAMES
//   tintHex       — '#rrggbb' base color (resolver overrides from materialSheetHex)
//   transmission  — 0..1 acrylic see-through (0 for wood/opaque/mirror)
//   roughness     — 0..1
//   metalness     — 0..1 (1 = mirror; 0 for plain acrylic/wood)
//   ior           — ~1.49 acrylic; ignored by opaque/metal
//   edgeGain      — 0..~8 perimeter emissive strength (0 = no glow)
//   rimGain       — 0..~2 face fresnel emissive strength
//   texturePath   — null | '/textures/...' (reserved; only wood may set it later, L6)
//   clearcoat     — 0..1 (pearlescent's reserved nacre term; 0 elsewhere)

// The eight v1 archetypes (§3.2). `opaque-tinted` is the safe fallback for any
// material that matches no finish — S1's corpus fixture asserts no KNOWN name
// reaches it.
export const DEFAULT_ARCHETYPE = 'opaque-tinted';

// Each entry is a complete AppearanceParams default. tintHex here is only a
// fallback — the resolver replaces it with the material's real sheet hex. The
// per-archetype invariants (transmission/edgeGain/metalness) are the look contract
// and are asserted in the co-located test.
export const ARCHETYPE_DEFAULTS = Object.freeze({
  // High edge glow, mid transmission, saturated tint, low roughness — the only
  // archetype that glows hard. (Source corpus: in-code `green-fluorescent`.)
  'fluorescent-acrylic': Object.freeze({
    archetype: 'fluorescent-acrylic',
    tintHex: '#e6e954',
    transmission: 0.4,
    roughness: 0.12,
    metalness: 0,
    ior: 1.49,
    edgeGain: 6.0,
    rimGain: 1.2,
    clearcoat: 0,
    texturePath: null,
  }),
  // Highly transmissive, near-zero tint, only a hint of edge glow.
  'clear-acrylic': Object.freeze({
    archetype: 'clear-acrylic',
    tintHex: '#e7e7e7',
    transmission: 0.95,
    roughness: 0.05,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0.3,
    rimGain: 0.5,
    clearcoat: 0,
    texturePath: null,
  }),
  // Mid transmission, tinted, small edge gain (the last-resort acrylic bucket).
  'translucent-acrylic': Object.freeze({
    archetype: 'translucent-acrylic',
    tintHex: '#cccccc',
    transmission: 0.6,
    roughness: 0.22,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0.8,
    rimGain: 0.6,
    clearcoat: 0,
    texturePath: null,
  }),
  // Solid, glossy, NO edge glow.
  'opaque-acrylic': Object.freeze({
    archetype: 'opaque-acrylic',
    tintHex: '#888888',
    transmission: 0,
    roughness: 0.25,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0,
    rimGain: 0,
    clearcoat: 0,
    texturePath: null,
  }),
  // Opaque, glossy, slightly metallic with a clearcoat sheen — v1 nacre
  // approximation. No edge glow.
  'pearlescent-acrylic': Object.freeze({
    archetype: 'pearlescent-acrylic',
    tintHex: '#aab0c0',
    transmission: 0,
    roughness: 0.18,
    metalness: 0.2,
    ior: 1.49,
    edgeGain: 0,
    rimGain: 0.3,
    clearcoat: 0.6,
    texturePath: null,
  }),
  // Fully metallic, near-mirror-smooth, opaque, NO edge glow.
  'mirror-acrylic': Object.freeze({
    archetype: 'mirror-acrylic',
    tintHex: '#cfd2d6',
    transmission: 0,
    roughness: 0.04,
    metalness: 1.0,
    ior: 1.49,
    edgeGain: 0,
    rimGain: 0,
    clearcoat: 0,
    texturePath: null,
  }),
  // Opaque procedural grain (v1), matte-ish, non-metallic, NO edge glow.
  // texturePath reserved for committed grain images as a follow-up (L6).
  wood: Object.freeze({
    archetype: 'wood',
    tintHex: '#d8b988',
    transmission: 0,
    roughness: 0.7,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0,
    rimGain: 0,
    clearcoat: 0,
    texturePath: null,
  }),
  // Safe default — solid, inert. Built from the material's hex by the resolver.
  // A KNOWN seed/default name reaching this is a bug (S1 fixture asserts none do).
  'opaque-tinted': Object.freeze({
    archetype: 'opaque-tinted',
    tintHex: '#c9c2b5',
    transmission: 0,
    roughness: 0.5,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0,
    rimGain: 0,
    clearcoat: 0,
    texturePath: null,
  }),
});

export const ARCHETYPE_NAMES = Object.freeze(Object.keys(ARCHETYPE_DEFAULTS));

// True iff `name` is a known archetype id.
export function isArchetype(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(ARCHETYPE_DEFAULTS, name);
}

// A FRESH copy of the defaults for `archetype`. Unknown / nullish input falls
// back to the safe DEFAULT_ARCHETYPE. Returns a shallow clone so callers (the
// resolver merging overrides, the `.jsx` mutating uniforms) can never poison the
// frozen registry source.
export function getArchetypeDefaults(archetype) {
  const key = isArchetype(archetype) ? archetype : DEFAULT_ARCHETYPE;
  return { ...ARCHETYPE_DEFAULTS[key] };
}

// Map AppearanceParams → a flat, uniform-friendly bag the shader/material layer
// consumes. Values stay primitive (string hex / number) — no three objects — so
// this module remains node-testable. The `.jsx` converts uTint to a THREE.Color.
export function appearanceToUniforms(params = {}) {
  return {
    uTint: params.tintHex,
    uTransmission: params.transmission,
    uRoughness: params.roughness,
    uMetalness: params.metalness,
    uIor: params.ior,
    uEdgeGain: params.edgeGain,
    uRimGain: params.rimGain,
    uClearcoat: params.clearcoat,
  };
}
