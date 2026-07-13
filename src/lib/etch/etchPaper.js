// etchPaper — the PURE grain math behind the Paper Stage of the Etch Stack
// (Raster Etch S6, issue #85; vocabulary is LAW — CONTEXT.md → Stage, ADR-0007).
// A Paper Stage overlays organic paper GRAIN onto the continuous luma field
// BEFORE screening, giving the etch its "tooth" (the shaders.paper.design look).
// It is a FIELD Stage — gray→gray, `{ gray: Float64Array, alpha, width, height }`
// → same-shape field — NOT a screen: it perturbs the value the screen later
// dithers, it never produces the 1-bit buffer. It is the LEAST fabrication-
// critical Stage. It mirrors etchTone's shape exactly (pure typed-array math, no
// DOM, identity short-circuit when neutral), so it runs identically on the main
// thread, inside etch.worker, and headless under vitest.
//
// DETERMINISM IS THE WHOLE POINT (grilled decision 4). The grain is SEEDED off a
// stable per-layer `seed` carried in the Stage params (plain JSON data, minted
// once at createPaperStage time). Given the same field + params (grain, scale,
// seed) the output is BYTE-IDENTICAL — across reloads (the seed rehydrates with
// the doc), across the worker/inline boundary (the seed structured-clones like any
// param), and across JS engines. To guarantee the last one we do NOT use
// `Math.random()` or `Math.sin`-hashing (engine-dependent round-off): the noise is
// built from INTEGER bit-mixing (Math.imul / xor / shift), whose results are
// exactly specified by the language. A missing/zero seed hashes deterministically
// (seed 0), so a doc that predates the seed field still reloads to a stable grain.
//
// THE NOISE — smooth value-noise (not white noise), so the grain reads as paper
// fibre rather than TV static:
//   • Hash the integer lattice point (gx, gy) + seed → a value in [0,1). The hash
//     is a small avalanche mixer; every bit of the inputs diffuses across the word.
//   • Sample the four lattice corners around the pixel's (x/scale, y/scale) grid
//     position and bilinearly interpolate with a smoothstep fade — so `scale` IS
//     the grain feature size in device pixels (scale 1 ≈ per-pixel speckle; a
//     larger scale = coarser, softer fibre).
//   • The signed perturbation is `(noise − 0.5) · 2 · amplitude`, so it is roughly
//     ZERO-MEAN — grain textures the field (some pixels darker, some lighter), it
//     does not just brighten it. `amplitude = grain/100 · PAPER_GRAIN_MAX` (luma
//     units), clamped into 0..255 like every other Etch field op.

/** Neutral grain — a fresh Paper Stage is added but changes NOTHING until grain
 * moves (mirrors Tone's fully-neutral default; the identity guard lives below). */
export const DEFAULT_PAPER_GRAIN = 0;

/** Default grain feature size in device pixels (a soft, plausible paper fibre). */
export const DEFAULT_PAPER_SCALE = 4;

/** Max grain amplitude in LUMA units, at grain 100. Strong, visible tooth; still
 * sub-full-range so a midtone stays a midtone with texture, not a blown field. */
export const PAPER_GRAIN_MAX = 96;

/** Smallest grain feature size — scale is floored here so a 0/garbage scale can
 * never divide-by-zero the lattice sampling (falls back to per-pixel speckle). */
const MIN_PAPER_SCALE = 1;

/**
 * Hash an integer lattice point (ix, iy) + seed to a value in [0, 1). Pure
 * INTEGER avalanche mixing (Math.imul + xor + unsigned shift) — no floats in the
 * hash, so it is bit-for-bit identical on every JS engine (the determinism
 * contract). Odd 32-bit constants are the usual xxHash/murmur-style mixers.
 *
 * @param {number} ix integer lattice x
 * @param {number} iy integer lattice y
 * @param {number} seed stable per-layer seed (0 for a seedless legacy doc)
 * @returns {number} deterministic value in [0, 1)
 */
function hashLattice(ix, iy, seed) {
  let h = (seed | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (ix | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (iy | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296; // unsigned → [0, 1)
}

/** Hermite smoothstep fade — softens the bilinear interpolation so lattice cells
 * blend into continuous fibre instead of showing linear diamond seams. */
function fade(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Seeded value-noise at device pixel (x, y). The field is sampled on a lattice
 * spaced by `scale` device pixels and bilinearly interpolated, so `scale` is the
 * grain feature size. PURE and deterministic — the Stage's whole reload/worker
 * stability rests on this being a function of (x, y, scale, seed) alone.
 *
 * @param {number} x device pixel x
 * @param {number} y device pixel y
 * @param {number} scale grain feature size in device px (≥ 1)
 * @param {number} seed stable per-layer seed
 * @returns {number} value in [0, 1)
 */
export function paperNoiseAt(x, y, scale, seed) {
  const s = scale >= MIN_PAPER_SCALE ? scale : MIN_PAPER_SCALE;
  const gx = x / s;
  const gy = y / s;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = fade(gx - ix);
  const fy = fade(gy - iy);
  const n00 = hashLattice(ix, iy, seed);
  const n10 = hashLattice(ix + 1, iy, seed);
  const n01 = hashLattice(ix, iy + 1, seed);
  const n11 = hashLattice(ix + 1, iy + 1, seed);
  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

/**
 * Apply a Paper Stage's params to a luma field: overlay seeded grain, gray→gray.
 * grain 0 (coerced, so a string "0" from a persisted doc also counts) returns the
 * SAME field object — a pixel-exact identity, so "adding a Paper Stage changes
 * nothing until you move grain" and a near-cut pixel cannot drift across the
 * screen. alpha and width/height are carried forward untouched (screening reads
 * transparent pixels as paper downstream, exactly as for Tone).
 *
 * @param {{gray:Float64Array, alpha, width:number, height:number}} field
 * @param {{grain?:number, scale?:number, seed?:number}} [params]
 * @returns {{gray:Float64Array, alpha, width:number, height:number}}
 */
export function applyPaperField(field, params = {}) {
  const grain = Number(params.grain) || 0; // coerce so string "0" short-circuits
  if (!grain) return field; // identity: same object ⇒ pixel-exact no-op
  const scale = Number(params.scale) > 0 ? Number(params.scale) : DEFAULT_PAPER_SCALE;
  const seed = Number(params.seed) | 0; // NaN/undefined → 0 (deterministic legacy)
  // grain 0..100 → luma amplitude; abs+cap so an out-of-range control still bounds.
  const amplitude = (Math.min(100, Math.abs(grain)) / 100) * PAPER_GRAIN_MAX;
  const { gray, alpha, width, height } = field;
  const out = new Float64Array(gray.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const j = y * width + x;
      const n = paperNoiseAt(x, y, scale, seed);
      const v = gray[j] + (n - 0.5) * 2 * amplitude; // signed, ~zero-mean grain
      out[j] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  return { gray: out, alpha, width, height };
}
