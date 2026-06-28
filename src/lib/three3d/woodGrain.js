// woodGrain — procedural wood-grain MATH + params (S6, plan §3.2 / L6). PURE and
// three.js-free, exactly like every sibling in lib/three3d/: it is unit-tested
// without WebGL, and the WoodGrain.jsx shader (smoke-only) MIRRORS these formulas
// in GLSL. Float-vs-double precision means GLSL and JS are NOT bit-identical — the
// tests assert this module's own PROPERTIES (determinism, [0,1] range, ring
// behaviour, colour endpoints), and the look lands on the NEEDS-HUMAN checklist.
//
// Why procedural (L6): wood gets a distinct-from-acrylic look with ZERO committed
// assets and fully testable logic. `texturePath` is RESERVED on the archetype for
// committed grain images as a follow-up — it is plumbed here (default null,
// passed through if set) but v1 NEVER loads a texture; the procedural grain is
// always rendered.
//
// The grain model: rings of concentric latewood bands (centred well OUTSIDE the
// slab so only gently-curved arcs cross it — reads as plank grain, not a target),
// warped by a little value-noise turbulence so the rings wander like real wood.

// Default grain params. The `.jsx` reads these into shader uniforms; overrides
// (and the reserved texturePath) come through `resolveWoodGrainParams`.
export const WOOD_GRAIN_DEFAULTS = Object.freeze({
  ringFrequency: 9.0, // ring-band count scale across the slab's normalized span
  turbulence: 0.35, // how far the noise warps the rings (0 = perfect concentric)
  noiseScale: 3.2, // spatial frequency of the warp noise
  grainContrast: 0.55, // darkening of latewood bands vs the base tint (0..1)
  centerU: -1.6, // ring centre, in normalized surface coords — offset off-slab so
  centerV: -0.5, // the slab catches arcs, not full circles (the "plank" look)
  texturePath: null, // RESERVED (L6) — committed grain image follow-up; v1 ignores
});

// --- value noise (GLSL-mirrorable) ------------------------------------------
// A hash + bilinear value-noise pair simple enough to reproduce in GLSL. We test
// THIS implementation's determinism and bounds, not GLSL equivalence.

/** Deterministic hash of an integer lattice point → [0, 1). */
export function hash2(ix, iy) {
  // fract(sin(dot)·k) — the canonical GLSL hash, evaluated in JS doubles.
  const s = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Smoothstep-interpolated value noise at (x, y) → [0, 1]. */
export function valueNoise2(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  // Smoothstep fade (3t²−2t³), matching GLSL smoothstep on the cell fraction.
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  const top = a + (b - a) * ux;
  const bot = c + (d - c) * ux;
  return top + (bot - top) * uy;
}

/** Fractional-Brownian-motion stack of value noise → [0, 1]. */
export function fbm2(x, y, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(fx, fy);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

// --- grain field ------------------------------------------------------------

/**
 * Procedural wood-grain value at a normalized surface coordinate (u, v) — the
 * latewood band intensity, ALWAYS in [0, 1] (0 = pale earlywood, 1 = dark
 * latewood ring). The `.jsx` mirrors this in GLSL and multiplies it into the
 * slab's diffuse colour.
 *
 * @param {number} u  normalized surface coord (slab x / width)
 * @param {number} v  normalized surface coord (slab y / height)
 * @param {object} [params]  WOOD_GRAIN_DEFAULTS overrides
 * @returns {number} grain in [0, 1]
 */
export function woodGrainAt(u, v, params = {}) {
  const { ringFrequency, turbulence, noiseScale, centerU, centerV } = {
    ...WOOD_GRAIN_DEFAULTS,
    ...params,
  };
  const du = u - centerU;
  const dv = v - centerV;
  const dist = Math.hypot(du, dv);
  // Warp the ring radius by noise so the bands wander (0 turbulence = concentric).
  const turb = (fbm2(u * noiseScale, v * noiseScale, 3) - 0.5) * 2 * turbulence;
  const rings = (dist + turb) * ringFrequency;
  // Triangle wave of the ring coordinate → band intensity in [0, 1]. fract is
  // taken with a positive modulo so negative coords behave; peaks at ring edges.
  const frac = ((rings % 1) + 1) % 1;
  return Math.abs(frac * 2 - 1);
}

// --- colour shading ---------------------------------------------------------

const HEX_RE = /^#([0-9a-f]{6})$/i;

/** Parse '#rrggbb' → [r, g, b] in 0..255. Throws on a malformed hex. */
function parseHex(hex) {
  const m = HEX_RE.exec(String(hex).trim());
  if (!m) throw new Error(`woodGrain: invalid hex "${hex}"`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/**
 * Shade the base wood tint by a grain value: earlywood (grain 0) keeps the base
 * colour; latewood (grain 1) darkens it by `grainContrast`. Monotonic in grain.
 *
 * @param {string} baseHex  '#rrggbb' base wood tint
 * @param {number} grain    grain value in [0, 1] (from woodGrainAt)
 * @param {object} [params] WOOD_GRAIN_DEFAULTS overrides (uses grainContrast)
 * @returns {string} '#rrggbb'
 */
export function shadeWoodHex(baseHex, grain, params = {}) {
  const { grainContrast } = { ...WOOD_GRAIN_DEFAULTS, ...params };
  const g = Math.max(0, Math.min(1, grain));
  const factor = 1 - grainContrast * g; // grain 0 → 1.0; grain 1 → 1 - contrast
  const [r, gg, b] = parseHex(baseHex);
  return `#${toHex2(r * factor)}${toHex2(gg * factor)}${toHex2(b * factor)}`;
}

// --- param resolution -------------------------------------------------------

/**
 * Resolve the wood-grain params from a resolved AppearanceParams. Merges the
 * grain defaults and carries the RESERVED `texturePath` through (default null;
 * passed through if a future material/registry sets it). v1 ALWAYS renders the
 * procedural grain regardless of texturePath — see `hasWoodTexture`.
 *
 * @param {object} [appearance]  resolved AppearanceParams (may carry texturePath)
 * @returns {object} grain params + texturePath
 */
export function resolveWoodGrainParams(appearance = {}) {
  return {
    ...WOOD_GRAIN_DEFAULTS,
    texturePath: appearance?.texturePath ?? WOOD_GRAIN_DEFAULTS.texturePath,
  };
}

/**
 * Whether a committed grain image is reserved for this material. v1 NEVER acts on
 * it (procedural grain is always used) — this exists only so the follow-up that
 * loads `/textures/...` has a single, tested predicate to branch on.
 */
export function hasWoodTexture(params = {}) {
  return typeof params?.texturePath === 'string' && params.texturePath.length > 0;
}
