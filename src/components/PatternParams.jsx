import {
  DEFAULT_PARAMS,
  PATTERN_PARAM_DEFS,
  PARAM_GROUPS,
  PARAM_GROUP_MAP,
  FEATURED_PARAMS,
} from "../constants";
import {
  getDynamicParamDefs,
  getDynamicDefaults,
} from "../lib/patternRegistry";
import { useGate } from "../lib/useGate";
import { UNIVERSAL_PARAM_KEYS } from "../lib/tierLimits";
import UpgradePrompt from "./UpgradePrompt";
import ParamGroup from "./ParamGroup";
import ParamRow from "./ui/ParamRow";

// Generate a random value for a single param definition.
// Branches on `def.options` presence (not `type`), so option-bearing controls
// of any type — select, iconselect (WI-5) — hit the enumerated path, while
// every numeric control hits the numeric path. Supports randomMin/randomMax caps.
function randomValueForDef(def) {
  if (def.options) {
    const opts = def.randomOptions || def.options;
    return opts[Math.floor(Math.random() * opts.length)].value;
  }
  const lo = def.randomMin ?? def.min;
  const hi = def.randomMax ?? def.max;
  const range = hi - lo;
  const raw = lo + Math.random() * range;
  const snapped = Math.round(raw / def.step) * def.step;
  const decimals = String(def.step).split(".")[1]?.length || 0;
  return parseFloat(
    Math.max(lo, Math.min(hi, snapped)).toFixed(decimals)
  );
}

// A param row maps to one OR many real keys. Composite defs (WI-3's pad2d)
// carry `def.keys`; single defs carry `def.key`. These helpers return a *patch
// object* spanning every real key so reset/randomize stay key-count agnostic.
function randomPatchForDef(def) {
  // Composite with per-axis ranges (plot2d): each key randomizes over its OWN
  // axis range. Without this, both keys would share def's single min/max.
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

function defaultPatchForDef(def, defaults) {
  if (def.keys) {
    const patch = {};
    for (const k of def.keys) patch[k] = defaults[k] ?? def.min;
    return patch;
  }
  return { [def.key]: defaults[def.key] ?? def.min };
}

export default function PatternParams({
  patternType,
  params,
  onChange,
  randomizeKeys,
  onRandomizeKeysChange,
}) {
  const defs =
    PATTERN_PARAM_DEFS[patternType] || getDynamicParamDefs(patternType);
  const { check, tier } = useGate();
  if (!defs) return null;

  const defaults =
    DEFAULT_PARAMS[patternType] || getDynamicDefaults(patternType) || {};
  const keys = randomizeKeys || [];

  const toggleKey = (key) => {
    const next = keys.includes(key)
      ? keys.filter((k) => k !== key)
      : [...keys, key];
    onRandomizeKeysChange(next);
  };

  const toggleGroupKeys = (groupKeys, allChecked) => {
    if (allChecked) {
      onRandomizeKeysChange(keys.filter((k) => !groupKeys.includes(k)));
    } else {
      const toAdd = groupKeys.filter((k) => !keys.includes(k));
      onRandomizeKeysChange([...keys, ...toAdd]);
    }
  };

  const randomizeSingle = (def) => {
    onChange({ ...params, ...randomPatchForDef(def) });
  };

  const randomizeGroup = (groupDefs) => {
    const newParams = { ...params };
    for (const def of groupDefs) {
      // The randomize checkbox is keyed on the row's (synthetic) key; a checked
      // composite row patches all of its real keys.
      if (keys.includes(def.key)) {
        Object.assign(newParams, randomPatchForDef(def));
      }
    }
    onChange(newParams);
  };

  const resetSingle = (def) => {
    onChange({ ...params, ...defaultPatchForDef(def, defaults) });
  };

  const resetGroup = (groupDefs) => {
    const newParams = { ...params };
    for (const def of groupDefs) {
      Object.assign(newParams, defaultPatchForDef(def, defaults));
    }
    onChange(newParams);
  };

  // Build param items with gate checks
  let nonUniversalIndex = 0;
  const paramItems = defs.map((def) => {
    const isUniversal = UNIVERSAL_PARAM_KEYS.includes(def.key);
    const paramIndex = isUniversal ? -1 : nonUniversalIndex++;
    const gate = check("param", { paramKey: def.key, paramIndex, isUniversal });
    return { def, isUniversal, paramIndex, gate };
  });

  // Featured param: one param pinned above all groups for this pattern type.
  // Only show it featured if its gate allows (else fall back to normal flow —
  // never render a locked slot at the very top).
  const featuredKey = FEATURED_PARAMS[patternType];
  const featuredItem = featuredKey
    ? paramItems.find((item) => item.def.key === featuredKey)
    : null;
  const showFeatured = Boolean(featuredItem && featuredItem.gate.allowed);

  // Group items by PARAM_GROUP_MAP. When a param is shown featured, exclude it
  // from its normal group so it doesn't render twice.
  const grouped = {};
  for (const item of paramItems) {
    if (showFeatured && item.def.key === featuredKey) continue;
    const groupId = PARAM_GROUP_MAP[item.def.key] || "structure";
    if (!grouped[groupId]) grouped[groupId] = [];
    grouped[groupId].push(item);
  }

  // Count total locked params for guest summary
  const lockedCount = paramItems.filter((item) => !item.gate.allowed).length;

  return (
    <div className="space-y-1.5">
      {/* Featured param — pinned above all groups, ungrouped, always visible */}
      {showFeatured && (
        <div className="pl-3 pb-0.5">
          <ParamRow
            def={featuredItem.def}
            params={params}
            defaults={defaults}
            randomizeKeys={randomizeKeys}
            onParamChange={onChange}
            onToggleKey={toggleKey}
            onRandomizeSingle={randomizeSingle}
            onResetSingle={resetSingle}
          />
        </div>
      )}

      {PARAM_GROUPS.map((group) => {
        const items = grouped[group.id];
        if (!items || items.length === 0) return null;

        // For guests, skip groups where ALL items are locked
        if (tier === "guest" && items.every((item) => !item.gate.allowed))
          return null;

        // For guests, only pass allowed items (locked ones are summarized below)
        const visibleItems =
          tier === "guest" ? items.filter((item) => item.gate.allowed) : items;

        if (visibleItems.length === 0) return null;

        return (
          <ParamGroup
            key={group.id}
            group={group}
            items={visibleItems}
            params={params}
            defaults={defaults}
            randomizeKeys={randomizeKeys}
            onParamChange={onChange}
            onToggleKey={toggleKey}
            onToggleGroupKeys={toggleGroupKeys}
            onRandomizeSingle={randomizeSingle}
            onRandomizeGroup={randomizeGroup}
            onResetSingle={resetSingle}
            onResetGroup={resetGroup}
            tier={tier}
          />
        );
      })}

      {/* Guest locked summary */}
      {tier === "guest" && lockedCount > 0 && (
        <div className="flex items-center gap-2 py-2 px-2 rounded bg-paper-warm border border-hairline">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-ink-soft shrink-0"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span className="text-[11px] text-ink-soft">
            {lockedCount} more parameters
          </span>
          <span className="mx-1 text-ink">—</span>
          <UpgradePrompt upgradeTarget="free" compact />
        </div>
      )}
    </div>
  );
}
