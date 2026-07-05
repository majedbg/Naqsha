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

/**
 * Byte-exact port of p5.js's seeded `random()` (the Numerical-Recipes LCG that
 * backs p5 after `randomSeed(seed)`). Unlike `mulberry32`, this reproduces the
 * EXACT sequence a live p5 instance yields, so offline reconstruction of a
 * pattern's p5-seeded randomness lands on the same values the canvas drew.
 *
 * Used by `latticeForLayer` to reconstruct a Grid's jittered node positions
 * (which the pattern computes via `ctx.random`, i.e. live p5) without a live p5
 * instance — so a motif stamped on the lattice sits on the grid's real, jittered
 * crossings. Coordinate/parity relies on this matching p5 byte-for-byte:
 *   state ∈ [0, 2³²);  state ← (a·state + c) mod m;  rand = state / m
 * with p5's constants a=1664525, c=1013904223, m=2³². The product a·state peaks
 * at ~7.15e15 < 2⁵³, so it stays exact in JS doubles (no precision drift).
 * `noiseSeed` does NOT touch p5's random state, so seeding here with the layer
 * seed reproduces the random stream regardless of any noise usage.
 *
 * VERSION PIN: these constants and the min/max mapping are transcribed from the
 * installed p5 (2.2.3, `node_modules/p5/lib/p5.js` — the `_lcg`/`random` impl).
 * The port can't be unit-asserted against a live p5 here (importing p5 in the
 * test env fails on a transitive gifenc CJS/ESM issue), so it is version-pinned:
 * if p5's LCG ever changes on upgrade, re-verify against the new source — stamps
 * would otherwise silently drift off the grid's crossings.
 *
 * @param {number} seed - the value passed to p5 `randomSeed` (cast `>>> 0`).
 * @returns {(min?: number, max?: number) => number} p5-compatible `random`:
 *   `random()`→[0,1), `random(max)`→[0,max), `random(min,max)`→[min,max).
 */
export function makeP5Random(seed) {
  const m = 4294967296; // 2^32
  const a = 1664525;
  const c = 1013904223;
  let state = (seed == null ? 0 : seed) >>> 0;
  return function (min, max) {
    state = (a * state + c) % m;
    const rand = state / m;
    if (min === undefined) return rand;
    if (max === undefined) return rand * min;
    if (min > max) {
      const tmp = min;
      min = max;
      max = tmp;
    }
    return rand * (max - min) + min;
  };
}
