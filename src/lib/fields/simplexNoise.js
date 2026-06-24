/**
 * simplexNoise — a seeded, inline 2D Simplex noise sampler.
 *
 * `makeSimplex(seed)` returns a pure function `(x, y) => number` in roughly
 * `[-1, 1]`. The seed deterministically permutes the 0..255 permutation table
 * (via a mulberry32 PRNG → Fisher–Yates shuffle), so two callers with the same
 * seed get the identical field and different seeds get different fields. No npm
 * dependency, no `Math.random()` — the module is pure and headless.
 *
 * The kernel is the classic Stefan Gustavson 2D simplex algorithm (skew/unskew
 * constants for the simplex grid + 12 gradient directions). The final `70.0 *`
 * scale is the standard normalization that maps the summed gradient
 * contributions into ~[-1,1]. This module never draws and never touches a
 * pattern's RNG stream — fields are built from their own seeded source so they
 * can't shift downstream pattern output (see ScalarField's design notes).
 */

// 12 gradient directions (the standard simplex gradient set, projected to 2D by
// using only the (x,y) components).
const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [1, 0], [-1, 0],
  [0, 1], [0, -1], [0, 1], [0, -1],
];

// Skew/unskew factors for the 2D simplex grid.
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

/** Small, fast, fully-deterministic 32-bit PRNG seeded by an integer. */
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a seeded 2D simplex noise function.
 * @param {number} seed - any integer; deterministically permutes the table.
 * @returns {(x:number, y:number) => number} value in ~[-1,1]
 */
export function makeSimplex(seed) {
  // Seed a PRNG and Fisher–Yates shuffle a 0..255 permutation.
  const rng = mulberry32((seed | 0) >>> 0 || 1);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  // Doubled tables avoid index wrapping in the hot path.
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  return function noise2D(xin, yin) {
    // Skew the input space to determine which simplex cell we're in.
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    // Unskew the cell origin back to (x,y) space.
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = xin - X0;
    const y0 = yin - Y0;

    // For the 2D case, the simplex is a triangle; determine which half we're in.
    let i1;
    let j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

    // Offsets for the other two corners in (x,y) unskewed coords.
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    // Hashed gradient indices of the three simplex corners.
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = permMod12[ii + perm[jj]];
    const gi1 = permMod12[ii + i1 + perm[jj + j1]];
    const gi2 = permMod12[ii + 1 + perm[jj + 1]];

    // Contribution from each corner.
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      t0 *= t0;
      n0 = t0 * t0 * (GRAD[gi0][0] * x0 + GRAD[gi0][1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      t1 *= t1;
      n1 = t1 * t1 * (GRAD[gi1][0] * x1 + GRAD[gi1][1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      t2 *= t2;
      n2 = t2 * t2 * (GRAD[gi2][0] * x2 + GRAD[gi2][1] * y2);
    }

    // Scale the summed contributions to ~[-1,1].
    return 70.0 * (n0 + n1 + n2);
  };
}

export default makeSimplex;
