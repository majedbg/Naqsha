import {
  DEFAULT_PARAMS,
  PATTERN_PARAM_DEFS,
  PARAM_GROUPS,
  PARAM_GROUP_MAP,
} from "../constants";
import {
  getDynamicParamDefs,
  getDynamicDefaults,
} from "../lib/patternRegistry";
import { useGate } from "../lib/useGate";
import { UNIVERSAL_PARAM_KEYS } from "../lib/tierLimits";
import UpgradePrompt from "./UpgradePrompt";
import ParamGroup from "./ParamGroup";

// Generate a random value for a single param definition.
// Supports optional randomMin/randomMax to cap randomization range.
function randomValueForDef(def) {
  if (def.type === "select") {
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
    onChange({ ...params, [def.key]: randomValueForDef(def) });
  };

  const randomizeGroup = (groupDefs) => {
    const newParams = { ...params };
    for (const def of groupDefs) {
      if (keys.includes(def.key)) {
        newParams[def.key] = randomValueForDef(def);
      }
    }
    onChange(newParams);
  };

  const resetSingle = (def) => {
    onChange({ ...params, [def.key]: defaults[def.key] ?? def.min });
  };

  const resetGroup = (groupDefs) => {
    const newParams = { ...params };
    for (const def of groupDefs) {
      newParams[def.key] = defaults[def.key] ?? def.min;
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

  // Group items by PARAM_GROUP_MAP
  const grouped = {};
  for (const item of paramItems) {
    const groupId = PARAM_GROUP_MAP[item.def.key] || "structure";
    if (!grouped[groupId]) grouped[groupId] = [];
    grouped[groupId].push(item);
  }

  // Count total locked params for guest summary
  const lockedCount = paramItems.filter((item) => !item.gate.allowed).length;

  return (
    <div className="space-y-1.5">
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
