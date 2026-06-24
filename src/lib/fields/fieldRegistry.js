/**
 * fieldRegistry — map a layer to the ScalarField it produces (if any).
 *
 * This is the single place that knows WHICH pattern types can act as a
 * modulation guide and how to build their field. Today only Chladli produces a
 * field (its closed-form standing-wave scalar); the registry is shaped so other
 * producers can be added later without touching the resolver or the UI.
 *
 * Pure + side-effect-free: building a Chladni field is internally memoized by
 * chladniField(), so calling fieldForLayer() repeatedly is cheap.
 */
import { chladniField } from './chladniField';
import { topographicField } from './topographicField';

/**
 * Can this layer act as a modulation source (i.e. produce a ScalarField)?
 * @param {object} layer
 * @returns {boolean}
 */
export function canProduceField(layer) {
  const t = layer?.patternType;
  return t === 'chladni' || t === 'topographic';
}

/**
 * Build (or fetch from cache) the ScalarField a layer produces. Dispatches by
 * pattern type: chladni → its closed-form standing-wave field; topographic →
 * the fBm terrain reconstructed from the layer seed (so the guide's iso-lines
 * track the drawn contours).
 * @param {object} layer
 * @returns {import('./ScalarField').ScalarField | null} field, or null if the
 *   layer produces no field.
 */
export function fieldForLayer(layer) {
  if (!canProduceField(layer)) return null;
  if (layer.patternType === 'topographic') {
    return topographicField(layer.params, { seed: layer.seed, resolution: 128 });
  }
  return chladniField(layer.params, { resolution: 128 });
}

export default fieldForLayer;
