// resolveAppearance — the ONE pure resolver (spec §3.3, locked decision L3).
//
//   resolveAppearance(material) -> AppearanceParams
//
// Three-tier precedence, NEVER requires a DB:
//   1. explicit — material.archetype is a valid archetype id → merge that
//      archetype's registry defaults with any per-material `material.appearance`
//      overrides.
//   2. inferred — keyword match on material.name (case-insensitive), THEN
//      material.type. Ordering is by SPECIFICITY (more specific finishes first)
//      so e.g. "Black Opaque" hits opaque before any color/last-resort rule.
//   3. default — opaque-tinted, built from the material's sheet hex. Only truly
//      unknown materials land here; the S1 corpus fixture asserts NO known
//      seed/in-code name falls through.
//
// In every tier tintHex is sourced from `materialSheetHex(material)` (reused from
// materialPreview.js — NOT forked), so all 53 catalog materials get their real
// sheet color. `material.appearance` overrides win last (it may also override
// tintHex). Imports NO three: stays node-testable.

import {
  getArchetypeDefaults,
  isArchetype,
  DEFAULT_ARCHETYPE,
} from './materialArchetypes.js';
import { materialSheetHex } from '../materialPreview.js';

// Inference rules, in specificity order (§3.3). Each rule's regex is tested
// (case-insensitively) against the material NAME. First match wins, so the most
// specific finishes must come first — e.g. /opaque/ before the bare-acrylic
// last-resort, and pearl/tortoise/iridescent before opaque/translucent.
const NAME_RULES = [
  [/fluor/, 'fluorescent-acrylic'],
  [/mirror/, 'mirror-acrylic'],
  [/iridescent|aura|pearl|tortoise/, 'pearlescent-acrylic'],
  [/clear|colorless/, 'clear-acrylic'],
  [/translucent|frost|satin|ice/, 'translucent-acrylic'],
  [/opaque/, 'opaque-acrylic'],
  [/ply|wood|birch|walnut|mdf/, 'wood'],
];

// Type fallbacks, applied only when NO name rule matched. Wood-ish types map to
// wood; any acrylic/plastic with no finish keyword lands in the last-resort
// translucent bucket. Anything else returns null → caller uses the safe default.
function inferFromType(type) {
  const t = `${type || ''}`.toLowerCase();
  if (/ply|wood|mdf|veneer|bamboo|birch|walnut|oak|maple|cherry/.test(t)) return 'wood';
  if (/acryl|cast|petg|polyc|plexi|plastic/.test(t)) return 'translucent-acrylic';
  return null;
}

// The archetype for a material, by NAME then TYPE. Returns null when nothing
// matches (→ default tier). Pure; case-insensitive.
function inferArchetype(material) {
  const name = `${material.name || ''}`.toLowerCase();
  for (const [re, archetype] of NAME_RULES) {
    if (re.test(name)) return archetype;
  }
  return inferFromType(material.type);
}

export function resolveAppearance(material) {
  // Degenerate input → safe default, tint from the neutral sheet fallback.
  if (!material || typeof material !== 'object') {
    return { ...getArchetypeDefaults(DEFAULT_ARCHETYPE), tintHex: materialSheetHex({}) };
  }

  // 1. explicit · 2. inferred · 3. default
  const archetype = isArchetype(material.archetype)
    ? material.archetype
    : inferArchetype(material) || DEFAULT_ARCHETYPE;

  const base = getArchetypeDefaults(archetype); // fresh shallow clone of registry
  const tintHex = materialSheetHex(material);
  const overrides = material.appearance && typeof material.appearance === 'object'
    ? material.appearance
    : {};

  // Registry defaults < real sheet tint < explicit per-material overrides.
  return { ...base, tintHex, ...overrides };
}
