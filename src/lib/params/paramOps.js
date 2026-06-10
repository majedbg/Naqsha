/**
 * paramOps.js — canonical param-logic seam (AR-1A)
 *
 * Single source of truth for all pure param-manipulation helpers. Previously
 * duplicated across useLayers.js, PatternParams.jsx, ParamGroup.jsx, and
 * ParamRow.jsx with a critical drift: useLayers.randomValueForDef branched on
 * `def.type === 'select'` (misses iconselect), while PatternParams.jsx
 * correctly branches on `def.options` presence. That caused iconselect defs
 * (shape, fillMode) to hit the numeric path and produce NaN when randomized
 * via the per-layer "Randomize Params" button.
 *
 * Canonical rule (PatternParams' version, now the only version):
 *   • Branch on def.options PRESENCE, not def.type.
 *   • This covers both 'select' and 'iconselect' automatically.
 *   • SYMMETRY_PARAM has type:'iconselect' but carries numeric min/max/step
 *     and NO options array — it correctly stays on the numeric path.
 */

// ─────────────────────────────────────────────────────────────────────────────
// randomValueForDef
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a random value for a single param definition.
 *
 * Branching logic:
 *   - If def.options exists → enumerated path (select / iconselect with options)
 *     Uses def.randomOptions if present, otherwise def.options.
 *   - Otherwise → numeric path: random within [randomMin..randomMax] or
 *     [min..max], snapped to def.step, floating-point-safe.
 *
 * @param {object} def  A param definition from PATTERN_PARAM_DEFS (or an axis).
 * @returns {string|number} The random value.
 */
export function randomValueForDef(def) {
  if (def.options) {
    const opts = def.randomOptions || def.options;
    return opts[Math.floor(Math.random() * opts.length)].value;
  }
  // Numeric: random within [randomMin..randomMax] or [min..max], snapped to step
  const lo = def.randomMin ?? def.min;
  const hi = def.randomMax ?? def.max;
  const range = hi - lo;
  const raw = lo + Math.random() * range;
  const snapped = Math.round(raw / def.step) * def.step;
  // Clamp and fix floating point precision
  const decimals = String(def.step).split('.')[1]?.length || 0;
  return parseFloat(Math.max(lo, Math.min(hi, snapped)).toFixed(decimals));
}

// ─────────────────────────────────────────────────────────────────────────────
// randomPatchForDef
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a (possibly composite) def to a patch over its real param keys.
 *
 * Composite rows carry a synthetic key (e.g. 'radii', 'offset') that the
 * rendering engine never reads; a randomize operation must expand to the
 * underlying real keys.
 *
 *   def.axes  → per-axis ranges (plot2d): each key randomizes over its OWN
 *               axis range. Without this, both keys would share def's single
 *               min/max, destroying the R/r ratio semantics.
 *   def.keys  → shared range (pad2d): all keys share the def's range.
 *   otherwise → single key via def.key.
 *
 * @param {object} def  A param definition (may have axes, keys, or key).
 * @returns {object} A patch object { [realKey]: value, ... }.
 */
export function randomPatchForDef(def) {
  if (def.axes) {
    const patch = {};
    for (const ax of def.axes) patch[ax.key] = randomValueForDef(ax);
    return patch;
  }
  if (def.keys) {
    const patch = {};
    for (const k of def.keys) patch[k] = randomValueForDef(def);
    return patch;
  }
  return { [def.key]: randomValueForDef(def) };
}

// ─────────────────────────────────────────────────────────────────────────────
// defaultPatchForDef
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a reset patch returning each key to its default value.
 *
 * Falls back to def.min when the key is absent from the defaults object
 * (matches original behavior in PatternParams.jsx).
 *
 * @param {object} def       A param definition.
 * @param {object} defaults  DEFAULT_PARAMS[patternType] (or dynamic defaults).
 * @returns {object} A patch object { [realKey]: defaultValue, ... }.
 */
export function defaultPatchForDef(def, defaults) {
  if (def.keys) {
    const patch = {};
    for (const k of def.keys) patch[k] = defaults[k] ?? def.min;
    return patch;
  }
  return { [def.key]: defaults[def.key] ?? def.min };
}

// ─────────────────────────────────────────────────────────────────────────────
// isRowDefault
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return true when every real key of a (possibly composite) param row equals
 * its default value.
 *
 * `def.keys || [def.key]` covers both composite (pad2d) and single-key rows.
 * Falls back to def.min per key when the key is absent from defaults.
 *
 * @param {object} def       A param definition.
 * @param {object} params    Current layer params.
 * @param {object} defaults  DEFAULT_PARAMS[patternType].
 * @returns {boolean}
 */
export function isRowDefault(def, params, defaults) {
  const keys = def.keys || [def.key];
  return keys.every((k) => params[k] === (defaults[k] ?? def.min));
}
