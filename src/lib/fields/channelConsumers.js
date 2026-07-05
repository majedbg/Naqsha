/**
 * channelConsumers.js — single source of truth for which modulation CHANNEL a
 * given pattern type consumes. Used by the Modulator device UI to (a) decide
 * which target layers are candidates and (b) stamp the right channel on a new
 * map when a target is added.
 *
 *   grainfield → 'density'  (weighted-Lloyd density consumer)
 *   chladni / topographic / flowfield / recursive → 'warp'  (vertex-displacement consumers)
 *   spiral → 'distort'  (consumes the new 'distort' scalar amount-mask channel)
 *   grid → 'warp'  (reuses the existing 'warp' vertex-displacement channel)
 *   extracted-motif layers (dynamic patternIds) → 'lattice'  (a Grid guide
 *     stamps the tile at each of its intersection nodes — placement, not a field)
 *   anything else → null  (not a modulation target)
 */
import { getDynamicTypes } from "../patternRegistry";

const CHANNEL_BY_TYPE = {
  grainfield: "density",
  chladni: "warp",
  topographic: "warp",
  flowfield: "warp",
  recursive: "warp",
  spiral: "distort",
  grid: "warp",
};

/**
 * @param {string} patternType
 * @returns {'warp' | 'density' | 'distort' | 'lattice' | null}
 */
export function channelForTarget(patternType) {
  if (CHANNEL_BY_TYPE[patternType]) return CHANNEL_BY_TYPE[patternType];
  // Extracted motifs have dynamic patternIds, so they can't be static keys —
  // resolve them by provenance. Only a Grid guide actually produces a lattice
  // (enforced in latticeForLayer); a non-grid guide mapped here simply yields
  // no nodes and the motif renders static.
  const dyn = getDynamicTypes().find((t) => t.id === patternType);
  if (dyn && dyn.origin === "extracted") return "lattice";
  return null;
}
