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
// composite-options rows (#166)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Whether a def is a COMPOSITE-OPTIONS row: an enumerated control whose options
 * each carry a `patch` over SEVERAL real keys instead of one scalar `value`.
 * Grid Lines is the first (and today the only) one — three legal answers over
 * `drawHorizontal` / `drawVertical`, with the illegal fourth simply absent.
 *
 * Branch on SHAPE (`options[].patch` presence), not on `def.type` — the
 * canonical rule at the top of this file. `type` stays `'iconselect'`, so the
 * dispatcher and the control are the ordinary ones.
 *
 * @param {object} def
 * @returns {boolean}
 */
export function isCompositeOptionsDef(def) {
  return (
    Array.isArray(def?.options) &&
    def.options.length > 0 &&
    def.options.every((o) => o && typeof o.patch === 'object' && o.patch !== null)
  );
}

/**
 * Which composite option the LIVE params currently sit on, by id.
 *
 * The comparison thresholds at `>= 0.5` on both sides, matching the readers
 * these patches feed (Grid.js gates each line family at `>= 0.5`, and
 * hostKinds' gridIsSingleAxis does the same). That is what keeps the stored
 * continuum READ-legal: `0.6` still reads as its option even though the toggle
 * can only ever WRITE `0` or `1`. Composite-options patches are binary-valued
 * by contract; a future non-binary one would need its own comparison.
 *
 * Returns `undefined` when no option matches — which is exactly the legacy
 * blank-Grid case. It is deliberately NOT coerced: the control renders with
 * nothing selected, the canvas is unchanged, and the first click repairs it
 * forever because no option writes the blank state back.
 *
 * @param {object} def     a param definition
 * @param {object} params  current layer params
 * @returns {string|undefined} the matching option's id
 */
export function optionIdForParams(def, params) {
  if (!isCompositeOptionsDef(def)) return undefined;
  const on = (k) => (params?.[k] ?? 0) >= 0.5;
  return def.options.find((o) =>
    Object.entries(o.patch).every(([k, v]) => on(k) === (v >= 0.5)),
  )?.id;
}

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
 *   options[].patch → composite options (#166): pick a whole OPTION and return
 *               its patch. MUST precede the `def.keys` branch — a def with both
 *               `keys` and `options` would otherwise fall through and write the
 *               SAME randomValueForDef(def) into every key, i.e. an option id
 *               string into two numeric params. It also means the illegal
 *               states are unreachable from the dice BY CONSTRUCTION, because
 *               only legal patches are on the menu.
 *   def.axes  → per-axis ranges (plot2d): each key randomizes over its OWN
 *               axis range. Without this, both keys would share def's single
 *               min/max, destroying the R/r ratio semantics.
 *   def.keys  → shared range (pad2d): all keys share the def's range.
 *   otherwise → single key via def.key.
 *
 * @param {object} def  A param definition (may have composite options, axes,
 *                      keys, or key).
 * @returns {object} A patch object { [realKey]: value, ... }.
 */
export function randomPatchForDef(def) {
  if (isCompositeOptionsDef(def)) {
    const opts = def.randomOptions || def.options;
    // A fresh copy: callers Object.assign this into layer params, and the def
    // is a module-level constant that must not become aliased state.
    return { ...opts[Math.floor(Math.random() * opts.length)].patch };
  }
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
