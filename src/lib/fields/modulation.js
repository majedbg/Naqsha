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

/**
 * Affine-remap the field's nominal [-1,1] band onto a device-level output
 * range [min,max]. `[-1,1]` is identity; `[0,1]` is attract-only (output ≥ 0);
 * `[-1,0]` is repel-only (output ≤ 0). Replaces the old per-map polarity toggle.
 * @param {number} s - signed field value, normally in [-1,1]
 * @param {{min:number,max:number}} [range] - floats in [-1,1], min ≤ max
 * @returns {number}
 */
export function applyRange(s, range = { min: -1, max: 1 }) {
  const min = range?.min ?? -1;
  const max = range?.max ?? 1;
  return min + ((s + 1) / 2) * (max - min);
}

export function modulationTransfer(s, cfg = {}) {
  const {
    amount = 1,
    offset = 0,
    range = { min: -1, max: 1 },
    shape = 0,
    steps = 0,
  } = cfg;
  // Transfer chain: field band → attract/repel range → bias → ease → terrace → scale.
  let v = applyRange(s, range); // field's [-1,1] → [min,max] (replaces polarity)
  v = v + offset;
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
