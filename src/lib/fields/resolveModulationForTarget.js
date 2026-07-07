/**
 * Modulator-centric resolution (Ableton-LFO model).
 *
 * A GUIDE layer owns a `modulator` device that maps OUT to target layers:
 *   layer.modulator = {
 *     offset, shape, steps, range,     // device-level transfer (shared)
 *     maps: [ { targetLayerId, channel, amount } ]   // per-map
 *   }
 *
 * `range = {min,max}` (device-level) affine-remaps the field's [-1,1] band onto
 * [min,max] (replaces the old per-map `polarity`). Legacy documents that still
 * carry per-map `polarity` and no `dev.range` are migrated per-resolution
 * (non-destructive): unipolar → {0,1}, anything else → {-1,1}.
 *
 * Given a target layer, find EVERY modulator that maps to it and merge device-
 * level + per-map controls with the resolved field into the runtime objects the
 * consumer reads. Pure; no field is stored — it is resolved here at render time.
 *
 * Phase 2b (PRD §5) — multi-source stacking: `resolveModulationsForTarget`
 * (plural) returns the FULL array of resolved sources (one per guide mapping to
 * the target, in layer order), so a consumer can stack them (warp: vector-sum;
 * density: multiply). `resolveModulationForTarget` (singular) is the back-compat
 * wrapper returning the FIRST source (or null) — the historical first-match
 * contract, kept so single-source callers (Inspector gating) and the existing
 * test suite stay byte-identical.
 */
import { fieldForLayer } from "./fieldRegistry";
import { latticeForLayer } from "./latticeForLayer";

/**
 * Resolve ONE guide's map to the target into a runtime modulation object, or
 * null if the guide can't produce the field/lattice it promises.
 */
function resolveGuide(guide, targetLayer) {
  if (!guide || guide.id === targetLayer.id) return null; // no self-modulation
  const dev = guide.modulator;
  const maps = dev?.maps;
  if (!Array.isArray(maps)) return null;
  const m = maps.find((mp) => mp && mp.targetLayerId === targetLayer.id);
  if (!m) return null;

  // 'lattice' is a DISCRETE placement channel, not a continuous field: a Grid
  // guide supplies its intersection nodes (post-jitter, per symmetry copy) for
  // the target to stamp a motif at. It carries none of the field-transfer
  // knobs (range/offset/shape/steps) — those only mean something reshaping a
  // [-1,1] field. Branch BEFORE fieldForLayer, which returns null for a grid
  // (grid is not a field producer) and would otherwise skip this map.
  if (m.channel === "lattice") {
    const lattice = latticeForLayer(guide);
    if (!lattice) return null; // guide can't produce a lattice (not a grid)
    return {
      channel: "lattice",
      nodes: lattice.nodes,
      cellSize: lattice.cellSize,
      amount: m.amount ?? 1,
    };
  }

  const field = fieldForLayer(guide);
  if (!field) return null; // guide can't produce a field
  // Device-level range, with legacy per-map polarity migrated as a fallback.
  const range =
    dev.range ?? (m.polarity === "unipolar" ? { min: 0, max: 1 } : { min: -1, max: 1 });
  return {
    field,
    channel: m.channel ?? "density",
    amount: m.amount ?? 1,
    range,
    offset: dev.offset ?? 0,
    shape: dev.shape ?? 0,
    steps: dev.steps ?? 0,
  };
}

/**
 * Phase 2b: every guide that maps to the target, in layer order.
 * @returns {object[]} resolved modulation objects (empty when none map here)
 */
export function resolveModulationsForTarget(targetLayer, layers) {
  if (!targetLayer || !Array.isArray(layers)) return [];
  const out = [];
  for (const guide of layers) {
    const resolved = resolveGuide(guide, targetLayer);
    if (resolved) out.push(resolved);
  }
  return out;
}

/**
 * Back-compat single-source resolver: the FIRST guide (layer order) that maps
 * to the target, or null. Equivalent to `resolveModulationsForTarget(...)[0]`.
 */
export function resolveModulationForTarget(targetLayer, layers) {
  const all = resolveModulationsForTarget(targetLayer, layers);
  return all.length ? all[0] : null;
}

/**
 * Fold a resolved-sources array into the COMPOSITE `params.modulation` object
 * consumers read: the FIRST source's fields (so every single-source reader —
 * warp/density/distort/lattice consumers AND the motif-anchor refusal in
 * semanticAnchors / gridAnchors — sees the shape it always did) enriched with a
 * `sources` array carrying the full stack. N=1 → sources:[only], byte-identical.
 * Returns `undefined` for an empty stack so the caller adds NO `modulation` key
 * (unmodulated layers stay byte-identical to baseline).
 *
 * @param {object[]} mods - resolveModulationsForTarget output
 * @returns {object|undefined}
 */
export function composeModulationParam(mods) {
  if (!Array.isArray(mods) || mods.length === 0) return undefined;
  return { ...mods[0], sources: mods };
}
