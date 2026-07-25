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

/**
 * Preview transfer for the FieldOverlay heatmap readout. DELEGATES to the real
 * `modulationTransfer` so the readout can never drift from the output pipeline —
 * it applies the SAME device-level transfer controls (range → +offset → shape
 * ease → steps terrace) in the SAME order. The ONLY thing it omits is per-map
 * `amount`: the readout is device-level (shared across every mapped target),
 * so there is no single amount to show — `modulationTransfer` defaults amount to
 * 1, a pure vertical scale that would not change the heatmap's structure anyway.
 * All controls default to their neutral values, so a caller that passes only a
 * range (or nothing) gets plain `applyRange` back, byte-identical to before.
 * Output may leave [-1,1] once biased/eased; signedColor clamps, so it saturates.
 * @param {number} s - signed field value, normally in [-1,1]
 * @param {{offset?:number, range?:{min:number,max:number}, shape?:number, steps?:number}} [cfg]
 * @returns {number}
 */
export function previewValue(s, { offset = 0, range, shape = 0, steps = 0 } = {}) {
  // amount intentionally omitted → modulationTransfer's default of 1.
  return modulationTransfer(s, { offset, range, shape, steps });
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

/**
 * Phase 2b (PRD §5) — DENSITY channel stacking. MULTIPLY the per-source weights:
 *   Πᵢ densityWeight(fieldᵢ.sampleSigned(u,v), cfgᵢ) = Πᵢ max(0, 1+transferᵢ).
 * Multiplicative so a NEUTRAL source (weight 1) is a no-op, and the product stays
 * clamped ≥ 0 (each factor is already ≥ 0). The accumulator starts from the first
 * source's weight, so N=1 is bit-identical to a lone densityWeight. Sources
 * without a density field are ignored; an empty stack is the neutral weight 1.
 *
 * @param {object[]} sources - resolved modulation objects; each may carry
 *   {channel, field, amount, ...}. Only channel==='density' with a `field` count.
 * @param {number} u - unit-domain x
 * @param {number} v - unit-domain y
 * @returns {number} non-negative composite weight (1 when no density source)
 */
export function stackDensityWeight(sources, u, v) {
  const dens = Array.isArray(sources)
    ? sources.filter((s) => s && s.channel === "density" && s.field)
    : [];
  if (dens.length === 0) return 1;
  let w = densityWeight(dens[0].field.sampleSigned(u, v), dens[0]);
  for (let i = 1; i < dens.length; i++) {
    w *= densityWeight(dens[i].field.sampleSigned(u, v), dens[i]);
  }
  return w;
}
