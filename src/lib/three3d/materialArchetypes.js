// Material Archetypes — the in-code render archetypes for the 3D appearance
// system (spec: docs/material-3d-appearance-plan.md §3.1–§3.2; locked decision L1),
// and — per ADR 0003 (fidelity-first preview) — THE SINGLE SOURCE OF OPTICS for
// every preview material. The `MaterialDescriptor` (sheetSpecs.js) carries
// substrate IDENTITY only (kind, color, thickness); everything about how a
// material RENDERS (roughness, IOR, transmission, edge behavior) resolves here,
// grounded in measured stock properties (PMMA: IOR 1.49, ~92% transmittance @ 3mm,
// polished-cast roughness ≈ 0.02). Numbers are calibrated under
// THREE.NeutralToneMapping (Scene3D) — do not retune under a different mapper.
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
// AppearanceParams contract (§3.1, edge model revised by ADR 0003):
//   archetype     — one of ARCHETYPE_NAMES
//   tintHex       — '#rrggbb' base color (resolver overrides from materialSheetHex)
//   transmission  — 0..1 acrylic see-through (0 for wood/opaque/mirror)
//   roughness     — 0..1
//   metalness     — 0..1 (1 = mirror; 0 for plain acrylic/wood)
//   ior           — ~1.49 acrylic; ignored by opaque/metal
//   edgeGain      — 0..~8 EMISSIVE strength of the slab's side faces. Under the
//                   fidelity model only genuinely fluorescent stock emits: the
//                   fluorescent archetype is the ONLY entry > 0. Non-fluorescent
//                   acrylic edge brightness is the non-emissive edge-face material
//                   (edgeFace.js), not a gain here.
//   faceGlow      — 0..~0.5 FAINT emissive on the FACE material (non-bloomed),
//                   the body re-emission of fluorescent stock (LSC literature:
//                   most re-emission is TIR-guided to the edges, a little escapes
//                   the faces). Fluorescent is the ONLY entry > 0.
//   markGlow      — 0..~3 emissive strength of MARKS on the sheet: a groove/kerf
//                   roughens the surface and breaks TIR, so the trapped dye
//                   re-emission ESCAPES there — engraved lines glow like thin
//                   edges (the edge-lit-sign mechanism). Bloomed, scaled per
//                   process depth in the reaction layer, and multiplied by the
//                   runtime glow-drive seam (Marks.jsx) for future animation
//                   (e.g. mic-volume sync). Fluorescent is the ONLY entry > 0.
//   texturePath   — null | '/textures/...' (reserved; only wood may set it later, L6)
//   clearcoat     — 0..1 (pearlescent's reserved nacre term; 0 elsewhere)
//   emissiveHex   — OPTIONAL per-material override (never set by an archetype;
//                   arrives via material.appearance through resolveAppearance):
//                   the dye's Stokes-shifted EMISSION hue. Fluorescence re-emits
//                   red-shifted from what the face transmits, so edges/grooves/
//                   face-glow (edgeFace, markTexture, sheetMaterial) emit this
//                   when present and fall back to tintHex when absent — the
//                   pre-override behavior the green stock is calibrated on.
//
// (rimGain — the full-slab additive Fresnel shell term — was REMOVED with the
// shell itself, ADR 0003: an additive glow over the whole surface is a stylized
// render, not a material proof.)

// The eight v1 archetypes (§3.2). `opaque-tinted` is the safe fallback for any
// material that matches no finish — S1's corpus fixture asserts no KNOWN name
// reaches it.
export const DEFAULT_ARCHETYPE = 'opaque-tinted';

// Each entry is a complete AppearanceParams default. tintHex here is only a
// fallback — the resolver replaces it with the material's real sheet hex. The
// per-archetype invariants (transmission/edgeGain/metalness) are the look contract
// and are asserted in the co-located test.
export const ARCHETYPE_DEFAULTS = Object.freeze({
  // The ONLY archetype with emissive edges — real fluorescent PMMA collects light
  // and re-emits it at the cut faces, so a modest genuine emissive on the SIDE
  // faces (edgeFace.js routes edgeGain there, registered for bloom) is fidelity,
  // not stylization (ADR 0003 exception). edgeGain 2.0 is provisional pending
  // reference-photo calibration; the old 3.0/6.0 values were tuned for the removed
  // whole-selection bloom pipeline and blew out under it.
  // Optics per the luminescent-solar-concentrator literature (Wilson 2009,
  // perylene-doped PMMA): the HOST stays as transparent as clear cast (~92%
  // outside the dye's narrow absorption band) — the sheet reads as tinted
  // glass, NOT opaque paint. The dye's re-emission is guided by TIR to the cut
  // faces (edgeGain), with only a FAINT body glow on the faces (faceGlow,
  // non-bloomed) standing in for re-emission escaping the faces.
  'fluorescent-acrylic': Object.freeze({
    archetype: 'fluorescent-acrylic',
    tintHex: '#e6e954',
    transmission: 0.9,
    roughness: 0.03,
    metalness: 0,
    ior: 1.49,
    edgeGain: 2.0,
    // Kept LOW on purpose (calibration round 06): the body glow sets the floor
    // the grooves must contrast against — real scored lines pop because the
    // face is barely luminous next to them.
    faceGlow: 0.08,
    // Above edgeGain deliberately: a deep engraving's rough floor + walls leak
    // MORE per unit length than a polished cut edge, and thin lines need HDR
    // headroom for the bloom halo to diffuse past the line (user-observed on
    // physical stock: grooves read "quite glowy", brighter than faces suggest).
    markGlow: 3.0,
    clearcoat: 0,
    texturePath: null,
  }),
  // Clear cast PMMA ground truth (ADR 0003): IOR 1.49, ~92–95% transmittance,
  // polished-cast surface roughness ≈ 0.02 (was 0.05 — cast acrylic is glossier
  // than that). Edge brightness comes from the non-emissive edge-face material.
  'clear-acrylic': Object.freeze({
    archetype: 'clear-acrylic',
    tintHex: '#e7e7e7',
    transmission: 0.95,
    roughness: 0.02,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0,
    faceGlow: 0,
    markGlow: 0,
    clearcoat: 0,
    texturePath: null,
  }),
  // Mid transmission, tinted (the last-resort acrylic bucket). Frosted/satin
  // finishes scatter — hence the higher roughness than clear cast.
  'translucent-acrylic': Object.freeze({
    archetype: 'translucent-acrylic',
    tintHex: '#cccccc',
    transmission: 0.6,
    roughness: 0.22,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0,
    faceGlow: 0,
    markGlow: 0,
    clearcoat: 0,
    texturePath: null,
  }),
  // Solid, glossy, non-emissive.
  'opaque-acrylic': Object.freeze({
    archetype: 'opaque-acrylic',
    tintHex: '#888888',
    transmission: 0,
    roughness: 0.25,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0,
    faceGlow: 0,
    markGlow: 0,
    clearcoat: 0,
    texturePath: null,
  }),
  // Opaque, glossy, slightly metallic with a clearcoat sheen — v1 nacre
  // approximation. Non-emissive.
  'pearlescent-acrylic': Object.freeze({
    archetype: 'pearlescent-acrylic',
    tintHex: '#aab0c0',
    transmission: 0,
    roughness: 0.18,
    metalness: 0.2,
    ior: 1.49,
    edgeGain: 0,
    faceGlow: 0,
    markGlow: 0,
    clearcoat: 0.6,
    texturePath: null,
  }),
  // Fully metallic, near-mirror-smooth, opaque, non-emissive.
  'mirror-acrylic': Object.freeze({
    archetype: 'mirror-acrylic',
    tintHex: '#cfd2d6',
    transmission: 0,
    roughness: 0.04,
    metalness: 1.0,
    ior: 1.49,
    edgeGain: 0,
    faceGlow: 0,
    markGlow: 0,
    clearcoat: 0,
    texturePath: null,
  }),
  // Opaque procedural grain (v1), matte-ish, non-metallic, non-emissive.
  // texturePath reserved for committed grain images as a follow-up (L6).
  wood: Object.freeze({
    archetype: 'wood',
    tintHex: '#d8b988',
    transmission: 0,
    roughness: 0.7,
    metalness: 0,
    ior: 1.49,
    edgeGain: 0,
    faceGlow: 0,
    markGlow: 0,
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
    faceGlow: 0,
    markGlow: 0,
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
    uFaceGlow: params.faceGlow,
    uMarkGlow: params.markGlow,
    uClearcoat: params.clearcoat,
  };
}

// ── Substrate-fallback optics (ADR 0003, "archetypes own optics") ─────────────
// When NO material lens is active, a slab renders from its substrate descriptor —
// which now carries identity only (kind, color, thickness). These maps resolve a
// substrate KIND to the archetype whose optics stand in for it, folding in the
// per-kind roughness the descriptor used to duplicate (D7: plywood ~0.8, mdf ~0.9,
// cardstock ~1.0 matte; unknown "other" stock ~0.7).
const SUBSTRATE_ARCHETYPE_BY_KIND = Object.freeze({
  acrylic: 'clear-acrylic',
  plywood: 'wood',
  mdf: 'wood',
  cardstock: 'wood',
});
const SUBSTRATE_ROUGHNESS_BY_KIND = Object.freeze({
  plywood: 0.8,
  mdf: 0.9,
  cardstock: 1.0,
  other: 0.7,
});

/**
 * Optics for a bare substrate kind (the no-material-lens fallback). Acrylic reads
 * as clear cast PMMA (transmission 0.95, roughness 0.02, IOR 1.49); the wood-like
 * kinds share the wood archetype with their per-kind matte roughness; anything
 * unknown falls back to the inert opaque-tinted optics at the neutral 0.7. Color
 * stays the DESCRIPTOR's business (identity) — this returns optics only.
 * @param {string|undefined} kind
 * @returns {{ archetype:string, transmission:number, roughness:number,
 *             metalness:number, ior:number, clearcoat:number }}
 */
export function substrateOptics(kind) {
  const known = Object.prototype.hasOwnProperty.call(SUBSTRATE_ARCHETYPE_BY_KIND, kind);
  const archetype = known ? SUBSTRATE_ARCHETYPE_BY_KIND[kind] : DEFAULT_ARCHETYPE;
  const d = ARCHETYPE_DEFAULTS[archetype];
  return {
    archetype,
    transmission: d.transmission,
    roughness: SUBSTRATE_ROUGHNESS_BY_KIND[known ? kind : 'other'] ?? d.roughness,
    metalness: d.metalness,
    ior: d.ior,
    clearcoat: d.clearcoat,
  };
}
