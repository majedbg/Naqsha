/**
 * Diverging colormap for visualizing a SIGNED scalar field (range ~[-1,1]).
 *
 * Anchored in the project's jewel-tone, light-mode aesthetic:
 *   negative → sapphire/teal,  zero → pale parchment,  positive → garnet/magenta
 *
 * The neutral band sits at s = 0, which for a Chladni field is the nodal set —
 * i.e. exactly where the pattern draws its lines. So the lightest part of the
 * heatmap coincides with the rendered nodal lines, and the saturated lobes show
 * the antinodes (where a modulated pattern would be pushed hardest).
 *
 * Alpha grows with |s| (with a small floor so the whole field stays visible),
 * keeping the zero-crossing reads as a faint crease rather than a hard edge.
 */

// RGB anchors (0–255).
const NEG = { r: 17, g: 109, b: 138 }; // sapphire-teal
const MID = { r: 244, g: 238, b: 224 }; // parchment
const POS = { r: 178, g: 42, b: 92 }; // garnet-magenta

// CSS color strings for the three diverging anchors, so UI controls (e.g. the
// modulation range slider's gradient track) match the field plot exactly without
// hardcoding literal red/white/blue.
export const ANCHOR_POS = `rgb(${POS.r}, ${POS.g}, ${POS.b})`; // garnet (+1)
export const ANCHOR_MID = `rgb(${MID.r}, ${MID.g}, ${MID.b})`; // parchment (0)
export const ANCHOR_NEG = `rgb(${NEG.r}, ${NEG.g}, ${NEG.b})`; // sapphire (−1)

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mix(c0, c1, t) {
  return {
    r: Math.round(lerp(c0.r, c1.r, t)),
    g: Math.round(lerp(c0.g, c1.g, t)),
    b: Math.round(lerp(c0.b, c1.b, t)),
  };
}

/**
 * Map a signed value s (expected in [-1,1], clamped) to an RGBA color.
 * @param {number} s
 * @returns {{r:number, g:number, b:number, a:number}} a ∈ [0,1]
 */
export function signedColor(s) {
  const cs = s < -1 ? -1 : s > 1 ? 1 : s;
  const mag = Math.abs(cs);
  const rgb = cs < 0 ? mix(MID, NEG, mag) : mix(MID, POS, mag);
  // Perceptual-ish ramp: emphasize structure, keep a 0.12 floor so flat-ish
  // regions don't vanish entirely.
  const a = 0.12 + 0.88 * Math.pow(mag, 0.6);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a };
}

export default signedColor;
