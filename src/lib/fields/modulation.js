/**
 * Modulation helpers — how a guide field's value becomes a per-mark adjustment.
 *
 * Density channel: a signed field value s ∈ [-1,1] maps to a non-negative
 * spatial weight. A weighted-Lloyd / weighted-CVT consumer (GrainField) uses
 * this weight per Voronoi cell so points migrate toward high-weight regions —
 * i.e. the pattern packs denser where the guide field is strong.
 */

/**
 * @param {number} s - signed field value, normally in [-1,1]
 * @param {object} [cfg]
 * @returns {number} non-negative weight; 1 at neutral
 */
export function densityWeight(s, cfg = {}) {
  const { gain = 1, bias = 0, invert = false } = cfg;
  const v = invert ? -s : s;
  return Math.max(0, 1 + gain * v + bias);
}
