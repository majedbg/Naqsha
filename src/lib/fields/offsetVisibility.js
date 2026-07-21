/**
 * offsetVisibility.js — pure predicate for whether a modulator's device-level
 * `offset` control has any effect on rendered output, so the Inspector can hide
 * a dead knob (owner report: "Offset does nothing" — true on warp/lattice/no-target).
 *
 * WHICH CHANNELS CONSUME offset (traced from the output pipeline):
 *   • density → GrainField reads densityWeight → modulationTransfer, which does
 *     `v = v + offset` (modulation.js:49). CONSUMES offset.
 *   • distort → Spiral.js:84 masks with `modulationTransfer(s, distortMod)`,
 *     same `+ offset`. CONSUMES offset.
 *   • warp   → warp.js:38 uses ONLY cfg.amount; the transfer chain (offset/shape/
 *     steps) is deferred for warp. IGNORES offset.
 *   • lattice → a discrete placement channel with NO field-transfer knobs
 *     (resolveModulationForTarget.js:48). IGNORES offset.
 *
 * The predicate keys off each map's STORED `m.channel`, matching resolveGuide
 * (the singular "Inspector gating" resolver) which trusts `m.channel` too — so
 * the gate and the output agree. `addTarget` always stamps a channel; an
 * undefined channel only arises from legacy data, and resolveGuide defaults such
 * a field-channel map to "density", so we treat undefined as offset-consuming.
 */

/** Channels whose transfer chain includes `+ offset`. */
export const OFFSET_CONSUMING_CHANNELS = Object.freeze(["density", "distort"]);

/**
 * @param {string|undefined} channel
 * @returns {boolean} true if a map on this channel is biased by offset
 */
export function channelConsumesOffset(channel) {
  // undefined → resolveGuide defaults a field-channel map to "density", which
  // consumes offset; only explicit 'warp'/'lattice' ignore it.
  return OFFSET_CONSUMING_CHANNELS.includes(channel ?? "density");
}

/**
 * Does the modulator's `offset` affect ANY of its mapped targets' output?
 * True iff at least one map is on an offset-consuming channel (density/distort).
 * A modulator with no maps, or only warp/lattice maps, returns false.
 *
 * @param {{maps?: Array<{channel?: string}>}|null|undefined} modulator
 * @returns {boolean}
 */
export function offsetAffectsOutput(modulator) {
  const maps = Array.isArray(modulator?.maps) ? modulator.maps : [];
  return maps.some((m) => m && channelConsumesOffset(m.channel));
}
