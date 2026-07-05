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
 * Given a target layer, find a modulator that maps to it and merge device-level
 * + per-map controls with the resolved field into the runtime object the
 * consumer reads as `params.modulation`. Pure; no field is stored — it is
 * resolved here at render time.
 */
import { fieldForLayer } from "./fieldRegistry";
import { latticeForLayer } from "./latticeForLayer";

export function resolveModulationForTarget(targetLayer, layers) {
  if (!targetLayer || !Array.isArray(layers)) return null;
  for (const guide of layers) {
    if (!guide || guide.id === targetLayer.id) continue; // no self-modulation
    const dev = guide.modulator;
    const maps = dev?.maps;
    if (!Array.isArray(maps)) continue;
    const m = maps.find((mp) => mp && mp.targetLayerId === targetLayer.id);
    if (!m) continue;

    // 'lattice' is a DISCRETE placement channel, not a continuous field: a Grid
    // guide supplies its intersection nodes (post-jitter, per symmetry copy) for
    // the target to stamp a motif at. It carries none of the field-transfer
    // knobs (range/offset/shape/steps) — those only mean something reshaping a
    // [-1,1] field. Branch BEFORE fieldForLayer, which returns null for a grid
    // (grid is not a field producer) and would otherwise skip this map.
    if (m.channel === "lattice") {
      const lattice = latticeForLayer(guide);
      if (!lattice) continue; // guide can't produce a lattice (not a grid)
      return {
        channel: "lattice",
        nodes: lattice.nodes,
        cellSize: lattice.cellSize,
        amount: m.amount ?? 1,
      };
    }

    const field = fieldForLayer(guide);
    if (!field) continue; // guide can't produce a field
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
  return null;
}
