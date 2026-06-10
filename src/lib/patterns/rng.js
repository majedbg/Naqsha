/**
 * Shared deterministic PRNG for pattern logic.
 *
 * `mulberry32` is lifted VERBATIM from the copy that lived inside Duality.js so
 * that any pattern routed through it produces byte-identical values to `main`.
 * It is used by:
 *   - Duality (production randomness — was a local copy, now shared here)
 *   - RecordingContext (headless test randomness for random()/noise())
 *
 * NOTE: P5Adapter (production rendering) does NOT use this — it delegates
 * random/noise to the live p5 instance to keep on-canvas / SVG output
 * byte-identical to `main`. Unifying production RNG onto mulberry32 is an
 * explicitly out-of-scope optional follow-up (O-3).
 *
 * @param {number} seed - integer seed
 * @returns {() => number} a function returning floats in [0, 1)
 */
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
