/**
 * ScalarField — a sampled 2D scalar field over the unit domain (u,v) ∈ [0,1]².
 *
 * This is the shared primitive behind pattern MODULATION (a "guide" pattern's
 * field steering another pattern's density / warp / weight) and field PREVIEW
 * (the 2D heatmap overlay, and later a 3D height-surface in the preview view).
 *
 * Design decisions (see modulation design review):
 *  - Domain is the UNIT SQUARE [0,1]², not pixels. A field is canvas-size- and
 *    resolution-independent; consumers map their own coords into [0,1]. This is
 *    also exactly the domain a height-surface plot wants (z = f(u,v)).
 *  - The field is a PRE-SAMPLED grid buffer (`data`, a Float32Array), not a live
 *    closure. Sampling is then pure array + bilinear interpolation — cheap,
 *    cacheable, and the raw grid doubles as a vertex height-map for a 3D mesh.
 *  - Fields NEVER draw from a pattern's RNG stream (that would shift downstream
 *    pattern output and break byte-identity). A field is built from a pure
 *    function or its own seeded RNG, supplied by the producer.
 *
 * Grid layout: `nx × ny` sample POINTS. Sample (i,j) sits at
 *   u = i/(nx-1), v = j/(ny-1),  i ∈ [0,nx-1], j ∈ [0,ny-1]
 * so the four corners land exactly on the domain corners. Row-major:
 *   data[j*nx + i].
 */
export class ScalarField {
  /**
   * @param {object} o
   * @param {number} o.nx - sample points along u (≥2)
   * @param {number} o.ny - sample points along v (≥2)
   * @param {Float32Array} o.data - length nx*ny, row-major
   * @param {number} o.min - minimum raw value in the grid
   * @param {number} o.max - maximum raw value in the grid
   * @param {object} [o.meta] - free-form provenance (producer id, params, seed)
   */
  constructor({ nx, ny, data, min, max, meta = {} }) {
    this.nx = nx;
    this.ny = ny;
    this.data = data;
    this.min = min;
    this.max = max;
    this.maxAbs = Math.max(Math.abs(min), Math.abs(max)) || 1;
    this.range = max - min || 1;
    this.meta = meta;
  }

  /**
   * Build a field by evaluating a pure function over the unit grid.
   * @param {(u:number, v:number) => number} fn
   * @param {object} [o]
   * @param {number} [o.nx=129]
   * @param {number} [o.ny=129]
   * @param {object} [o.meta]
   * @returns {ScalarField}
   */
  static fromFunction(fn, { nx = 129, ny = 129, meta = {} } = {}) {
    const cols = Math.max(2, Math.round(nx));
    const rows = Math.max(2, Math.round(ny));
    const data = new Float32Array(cols * rows);
    let min = Infinity;
    let max = -Infinity;
    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      for (let i = 0; i < cols; i++) {
        const u = i / (cols - 1);
        const val = fn(u, v);
        data[j * cols + i] = val;
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    return new ScalarField({ nx: cols, ny: rows, data, min, max, meta });
  }

  // --- Direct grid access (no interpolation) — used by the heatmap + 3D mesh,
  // which iterate the grid points themselves. ---------------------------------

  /** Raw value at grid index (i,j). */
  rawAt(i, j) {
    return this.data[j * this.nx + i];
  }

  /** Signed value at grid index, normalized to [-1,1] by max |value|. */
  signedAt(i, j) {
    return this.data[j * this.nx + i] / this.maxAbs;
  }

  /** Min-max normalized value at grid index, in [0,1]. */
  normAt(i, j) {
    return (this.data[j * this.nx + i] - this.min) / this.range;
  }

  // --- Continuous sampling (bilinear) — used by modulation consumers, which
  // sample at arbitrary mark positions. --------------------------------------

  /**
   * Bilinearly-interpolated raw value at (u,v). Domain is clamped to [0,1].
   * @param {number} u
   * @param {number} v
   * @returns {number}
   */
  sample(u, v) {
    const { nx, ny, data } = this;
    const cu = u < 0 ? 0 : u > 1 ? 1 : u;
    const cv = v < 0 ? 0 : v > 1 ? 1 : v;
    const fx = cu * (nx - 1);
    const fy = cv * (ny - 1);
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const i1 = i0 + 1 < nx ? i0 + 1 : i0;
    const j1 = j0 + 1 < ny ? j0 + 1 : j0;
    const tx = fx - i0;
    const ty = fy - j0;
    const a = data[j0 * nx + i0];
    const b = data[j0 * nx + i1];
    const c = data[j1 * nx + i0];
    const d = data[j1 * nx + i1];
    const top = a + (b - a) * tx;
    const bot = c + (d - c) * tx;
    return top + (bot - top) * ty;
  }

  /** Bilinear value normalized to [-1,1] by max |value| (signed fields). */
  sampleSigned(u, v) {
    return this.sample(u, v) / this.maxAbs;
  }

  /** Bilinear value normalized to [0,1] by min/max. */
  sampleNorm(u, v) {
    return (this.sample(u, v) - this.min) / this.range;
  }

  /**
   * Central-difference gradient of the raw field at (u,v), in value-per-unit-
   * domain. This is the vector field used for WARP (displace along ∇f). `h` is a
   * step in domain units; defaults to one grid cell.
   * @returns {{dx:number, dy:number}}
   */
  sampleGradient(u, v, h) {
    const step = h || 1 / Math.max(this.nx, this.ny);
    const dx = (this.sample(u + step, v) - this.sample(u - step, v)) / (2 * step);
    const dy = (this.sample(u, v + step) - this.sample(u, v - step)) / (2 * step);
    return { dx, dy };
  }
}

export default ScalarField;
