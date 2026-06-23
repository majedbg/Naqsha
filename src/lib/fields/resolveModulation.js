/**
 * resolveModulation — turn a layer's STORED, serializable modulation spec into
 * the runtime object GrainField consumes at geometry-build time.
 *
 * This is the seam between document data and the live render. The document only
 * stores a serializable reference:
 *   layer.modulation = { sourceLayerId, channel, gain, bias, invert }
 * The actual ScalarField is NEVER serialized — it's rebuilt from the source
 * layer's params here, every render, via fieldForLayer (which memoizes).
 *
 * GrainField's runtime contract (see GrainField.js): it reads
 *   params.modulation = { field: ScalarField, channel: 'density', gain, bias, invert }
 * and treats anything else (null / wrong channel / no field) as a no-op,
 * producing byte-identical output to the unmodulated path.
 */
import { fieldForLayer } from './fieldRegistry';

/**
 * Resolve a layer's stored modulation spec into the runtime modulation object.
 * @param {object} layer - the consumer layer (carries `layer.modulation` spec)
 * @param {object[]} layers - all layers, used to look up the source by id
 * @returns {{ field: object, channel: string, gain: number, bias: number, invert: boolean } | null}
 *   the runtime object, or null when there is nothing to apply.
 */
export function resolveLayerModulation(layer, layers) {
  const spec = layer?.modulation;
  if (!spec) return null;

  const { sourceLayerId } = spec;
  if (!sourceLayerId) return null;

  // Forbid self-modulation — a layer cannot guide its own density. Checked
  // before lookup so the guard holds regardless of whether the layer produces
  // a field of its own.
  if (sourceLayerId === layer.id) return null;

  const source = Array.isArray(layers)
    ? layers.find((l) => l && l.id === sourceLayerId)
    : null;
  if (!source) return null;

  const field = fieldForLayer(source);
  if (!field) return null;

  return {
    field,
    channel: spec.channel ?? 'density',
    gain: spec.gain ?? 1,
    bias: spec.bias ?? 0,
    invert: spec.invert ?? false,
  };
}

export default resolveLayerModulation;
