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
 *   anything else → null  (not a modulation target)
 */
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
 * @returns {'warp' | 'density' | 'distort' | null}
 */
export function channelForTarget(patternType) {
  return CHANNEL_BY_TYPE[patternType] ?? null;
}
