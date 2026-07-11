// Edge-face material derivation (ADR 0003 #6). PURE, three.js-free: lives on the
// 2D side of the dynamic-import boundary so the tint math is unit-testable without
// WebGL. The R3F layer (Sheets.jsx) attaches the result to the slab's four SIDE
// faces (multi-material box, `attach="material-N"`).
//
// WHY: a real acrylic slab's cut edges read brighter than its faces — the sheet
// acts as a light guide (total internal reflection concentrates the scene's light
// at the perimeter), and colorless PMMA shows the classic faint GREEN edge cast
// (the polymer's slight absorption tint, invisible through 3mm of face but
// integrated over the sheet's width at the edge). Colored acrylics concentrate
// their own tint instead. This replaced the full-slab additive Fresnel shell +
// emissive rim bars (EdgeGlow) — an additive glow over the whole surface is a
// stylized render, not a material proof. The edge-face material is lit, tone-
// mapped, non-additive and non-bloomed.
//
// EXCEPTION (same fidelity logic): fluorescent acrylic genuinely fluoresces at its
// edges, so that archetype alone keeps a modest REAL emissive on the side faces
// (`emissive` + `emissiveIntensity` from the archetype's edgeGain), registered for
// bloom by Sheets.jsx — which is one of the on-demand composer triggers (#5).
import { mix, luminance } from '../materialReaction.js';

// How far the edge color lifts toward white — the TIR "light gathering" brightness.
// Provisional pending reference-photo calibration (docs/material-references/).
const EDGE_LIGHTEN = 0.25;
// The colorless-PMMA edge cast: a soft green, mixed faintly (never a neon rim).
export const EDGE_GREEN = '#86e0b8';
const EDGE_GREEN_MIX = 0.25;
// Laser-cut acrylic edges are flame-polished but still scatter more than the cast
// face (roughness 0.02) — a satin edge.
const EDGE_ROUGHNESS = 0.3;

// Saturation (HSV-style, 0..1) of an #rrggbb hex — colorless detection input.
function saturation(hex) {
  const h = `${hex}`.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 0;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  if (max === 0) return 0;
  return (max - Math.min(r, g, b)) / max;
}

// Clear/colorless PMMA: near-neutral (low saturation) and light. Only this family
// shows the green edge cast; a saturated tinted acrylic edge concentrates its OWN
// hue instead.
function isColorless(hex) {
  return saturation(hex) < 0.12 && luminance(hex) > 0.65;
}

/**
 * The material channels for a slab's four SIDE faces.
 *
 * `distinct` is true only for transmissive slabs (the acrylic family — matching
 * sheetMaterial's `mode === 'transmission'`): those get a dedicated edge-face
 * material. Opaque slabs (wood, opaque/mirror/pearlescent acrylic, unknown stock)
 * return `distinct: false` — their sides simply share the face material, so
 * Sheets.jsx keeps the plain single-material box for them.
 *
 * Channels (all lit, tone-mapped, non-additive):
 *   color              — face tint lifted toward white (EDGE_LIGHTEN); colorless
 *                        PMMA additionally casts toward EDGE_GREEN.
 *   roughness          — satin EDGE_ROUGHNESS (cut edge scatters more than the face).
 *   metalness          — 0.
 *   emissive           — the archetype tint for fluorescent-acrylic ONLY, else null.
 *   emissiveIntensity  — the fluorescent archetype's edgeGain, else 0.
 *
 * @param {{ appearance?: import('./resolveAppearance.js').AppearanceParams|null,
 *           descriptor?: import('./sheetSpecs.js').MaterialDescriptor }} args
 * @returns {{ distinct:boolean, color:string, roughness:number, metalness:number,
 *             emissive:string|null, emissiveIntensity:number }}
 */
export function resolveEdgeFace({ appearance = null, descriptor = {} } = {}) {
  const transmissive = appearance
    ? (appearance.transmission ?? 0) > 0
    : descriptor.type === 'transmissive';
  const base = (appearance ? appearance.tintHex : descriptor.color) || '#e7e7e7';

  if (!transmissive) {
    return {
      distinct: false,
      color: base,
      roughness: EDGE_ROUGHNESS,
      metalness: 0,
      emissive: null,
      emissiveIntensity: 0,
    };
  }

  const lifted = mix(base, '#ffffff', EDGE_LIGHTEN);
  const color = isColorless(base) ? mix(lifted, EDGE_GREEN, EDGE_GREEN_MIX) : lifted;
  const fluorescent = appearance?.archetype === 'fluorescent-acrylic';
  return {
    distinct: true,
    color,
    roughness: EDGE_ROUGHNESS,
    metalness: 0,
    // The DYE's emission hue, not the face tint: fluorescence is Stokes-shifted
    // (the dye re-emits deeper/red-shifted vs what the face transmits), so a
    // material may carry an explicit `emissiveHex` override (per-material
    // appearance, resolveAppearance). Without one the face tint stands in —
    // the pre-override behavior, still what the green stock is calibrated on.
    emissive: fluorescent ? (appearance.emissiveHex || appearance.tintHex) : null,
    emissiveIntensity: fluorescent ? (appearance.edgeGain ?? 0) : 0,
  };
}
