/**
 * transferVisibility.js — pure predicate for whether a modulator's device-level
 * TRANSFER controls (offset / shape / steps) have any effect on rendered output,
 * so the Inspector can hide dead knobs (owner report: these "do nothing" on
 * warp/lattice/no-target).
 *
 * All three controls live in ONE place — `modulationTransfer` (modulation.js):
 *   offset → `v = v + offset`             (line 49)
 *   shape  → `v = shapeEase(v, shape)`    (line 50)
 *   steps  → `v = round(v*steps)/steps`   (line 51)
 * so they share a single consumption profile: whichever channels run
 * `modulationTransfer` consume ALL THREE, and the rest consume NONE.
 *
 * WHICH CHANNELS run modulationTransfer (traced by enumerating its callers):
 *   • density → GrainField → stackDensityWeight → densityWeight →
 *     modulationTransfer. CONSUMES.
 *   • distort → Spiral.js:84 `modulationTransfer(s, distortMod)`. CONSUMES.
 *   • warp   → warp.js uses ONLY cfg.amount; the transfer chain is deferred.
 *     IGNORES.
 *   • lattice → a discrete placement channel with NO field-transfer knobs
 *     (resolveModulationForTarget.js:48). IGNORES.
 * (ShapeCurve.jsx also calls shapeEase, but only to DRAW the response curve —
 * a UI readout, not an output path, so it doesn't widen the profile.)
 *
 * The predicate keys off each map's STORED `m.channel`, matching resolveGuide
 * (the singular "Inspector gating" resolver) which trusts `m.channel` too — so
 * the gate and the output agree. `addTarget` always stamps a channel; an
 * undefined channel only arises from legacy data, and resolveGuide defaults such
 * a field-channel map to "density", so we treat undefined as consuming.
 */

/** Channels whose transfer chain (offset/shape/steps) actually runs. */
export const TRANSFER_CONSUMING_CHANNELS = Object.freeze(["density", "distort"]);

/**
 * @param {string|undefined} channel
 * @returns {boolean} true if a map on this channel is shaped by the transfer chain
 */
export function channelConsumesTransfer(channel) {
  // undefined → resolveGuide defaults a field-channel map to "density", which
  // runs the transfer chain; only explicit 'warp'/'lattice' skip it.
  return TRANSFER_CONSUMING_CHANNELS.includes(channel ?? "density");
}

/**
 * Do the device-level transfer controls (offset / shape / steps) affect ANY of
 * the modulator's mapped targets' output? True iff at least one map is on a
 * transfer-consuming channel (density/distort). A modulator with no maps, or
 * only warp/lattice maps, returns false.
 *
 * @param {{maps?: Array<{channel?: string}>}|null|undefined} modulator
 * @returns {boolean}
 */
export function transferControlsAffectOutput(modulator) {
  const maps = Array.isArray(modulator?.maps) ? modulator.maps : [];
  return maps.some((m) => m && channelConsumesTransfer(m.channel));
}
