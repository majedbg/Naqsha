// Feature flags — minimal, flippable-without-rebuild (locked decision 5 for
// the extraction feature: ships FREE but wrapped in a flag + tier gate so it
// can be flipped to premium at any time).
//
// Resolution order (first hit wins):
//   1. localStorage `naqsha:flag:<name>` = 'on' | 'off'   (per-browser kill switch)
//   2. env VITE_FLAG_<NAME> = 'on'/'true' | 'off'/'false' (per-deploy)
//   3. DEFAULTS
//
// The tier half of the gate lives in tierLimits.checkGate('extraction') — this
// module only answers "is the feature switched on at all".

const DEFAULTS = {
  extraction: true, // Photo → Pattern extraction (PRD #48), default-open
  // S12 (issue #61): the "lift to parameters" step — fit a parametric family,
  // adopt it as a pattern with LIVE structural knobs. Ships default-open (locked
  // decision 5); flip 'off' here (or per-browser / per-deploy) to hide the
  // family proposal entirely and always keep the traced tile.
  parameterize: true,
};

export function isFeatureEnabled(name) {
  try {
    const v = globalThis.localStorage?.getItem(`naqsha:flag:${name}`);
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch {
    // no localStorage (node tests, privacy modes) — fall through
  }
  const env = import.meta.env?.[`VITE_FLAG_${name.toUpperCase()}`];
  if (env === 'on' || env === 'true') return true;
  if (env === 'off' || env === 'false') return false;
  return DEFAULTS[name] ?? false;
}
