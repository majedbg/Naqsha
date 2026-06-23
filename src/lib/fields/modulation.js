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
/**
 * Bend the response curve. shape ∈ [-1,1]: 0 = linear; >0 eases in (slow
 * start), <0 eases out (fast start). Endpoints (0, ±1) and sign are preserved.
 */
export function shapeEase(v, shape) {
  if (!shape) return v;
  const p = Math.pow(3, shape); // shape 1 → exp 3, shape -1 → exp 1/3
  return Math.sign(v) * Math.pow(Math.abs(v), p);
}

export function modulationTransfer(s, cfg = {}) {
  const {
    amount = 1,
    offset = 0,
    polarity = "bipolar",
    shape = 0,
    steps = 0,
  } = cfg;
  let v = s + offset;
  if (polarity === "unipolar") v = v * 0.5 + 0.5;
  v = shapeEase(v, shape);
  if (steps > 0) v = Math.round(v * steps) / steps; // terrace into bands
  return amount * v;
}

/**
 * Density channel consumer wrapper: a Voronoi cell weight ≥ 0. Neutral field →
 * 1 (unchanged); positive contribution packs denser, negative thins out.
 */
export function densityWeight(s, cfg = {}) {
  return Math.max(0, 1 + modulationTransfer(s, cfg));
}
