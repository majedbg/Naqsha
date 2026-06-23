/**
 * chladniField — build a ScalarField from Chladni pattern params.
 *
 * The closed-form standing-wave field is THE reason Chladni is a great
 * modulator: it's a smooth, symmetric, signed scalar f(u,v) defined everywhere,
 * not just on the nodal lines the pattern draws. Those drawn lines are exactly
 * the zero set f = 0, so the field's neutral band coincides with the rendered
 * pattern — making it an intuitive guide for steering other patterns.
 *
 * The formula is replicated VERBATIM from the pattern source
 *   src/lib/patterns/extras/Chladni.js  (`mode` / `fieldAt`)
 * so the field and the drawn nodal lines agree exactly. It is duplicated rather
 * than imported because Chladni.js builds the formula inline inside generate()
 * (closing over params); extracting a shared helper there is a later DRY pass
 * that must preserve the pattern's byte-identical output. This module is
 * read-only/preview-only and never touches the pattern's draw path.
 *
 * In Chladni.js the plate coords reduce to gx = i/cols, gy = j/rows — i.e. the
 * normalized grid position — which is exactly the ScalarField unit domain.
 */
import { ScalarField } from './ScalarField';

const PI = Math.PI;

/** Single standing-wave mode pair on the unit plate. */
function mode(mm, nn, gx, gy) {
  return (
    Math.cos(nn * PI * gx) * Math.cos(mm * PI * gy) -
    Math.cos(mm * PI * gx) * Math.cos(nn * PI * gy)
  );
}

/**
 * Pure field function for given Chladni params: (u,v) ∈ [0,1]² → signed value.
 * Exposed for modulation consumers that want the closed form directly.
 */
export function chladniFieldFn(params = {}) {
  const { m = 4, n = 3, blend = 0, m2 = 5, n2 = 2 } = params;
  const w = Math.max(0, Math.min(1, blend)); // clamp blend weight
  if (w <= 0) return (u, v) => mode(m, n, u, v);
  return (u, v) => (1 - w) * mode(m, n, u, v) + w * mode(m2, n2, u, v);
}

// --- Small LRU-ish memo so toggling the overlay / re-rendering doesn't rebuild
// the grid every frame. Keyed by the params that change the field + resolution.
// (Canvas size is irrelevant — the field lives in the unit domain.)
const CACHE = new Map();
const CACHE_MAX = 24;

function cacheKey(params, resolution) {
  const { m = 4, n = 3, blend = 0, m2 = 5, n2 = 2 } = params || {};
  return `${m}|${n}|${blend}|${m2}|${n2}|${resolution}`;
}

/**
 * Build (or fetch from cache) a ScalarField for the given Chladni params.
 * @param {object} params - Chladni layer params (m,n,blend,m2,n2)
 * @param {object} [opts]
 * @param {number} [opts.resolution=128] - grid cells per axis (→ res+1 samples)
 * @returns {ScalarField}
 */
export function chladniField(params = {}, { resolution = 128 } = {}) {
  const res = Math.max(8, Math.round(resolution));
  const key = cacheKey(params, res);
  const hit = CACHE.get(key);
  if (hit) {
    // refresh LRU recency
    CACHE.delete(key);
    CACHE.set(key, hit);
    return hit;
  }
  const fn = chladniFieldFn(params);
  const field = ScalarField.fromFunction(fn, {
    nx: res + 1,
    ny: res + 1,
    meta: { producer: 'chladni', params: { ...params }, resolution: res },
  });
  CACHE.set(key, field);
  if (CACHE.size > CACHE_MAX) {
    // evict oldest insertion (first key)
    const oldest = CACHE.keys().next().value;
    CACHE.delete(oldest);
  }
  return field;
}

export default chladniField;
