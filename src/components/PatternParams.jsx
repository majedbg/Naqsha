import {
  PARAM_GROUPS,
  PARAM_GROUP_MAP,
  FEATURED_PARAMS,
} from "../constants";
import { useGate } from "../lib/useGate";
import { UNIVERSAL_PARAM_KEYS } from "../lib/tierLimits";
import { useLayerParams } from "../lib/useLayerParams";
import UpgradePrompt from "./UpgradePrompt";
import ParamGroup from "./ParamGroup";
import ParamRow from "./ui/ParamRow";
import InspectorShelf from "./shell/InspectorShelf";
import { useInspectorDockContext } from "./shell/inspectorDockContext";

// PatternParams (AR-3B): reads live params + the toggle/randomize/reset handlers
// from the LayerParams context (provided at LayerCard) instead of receiving them
// as props. It owns ONLY the gate-counting loop + featured/grouping layout.
//
// CRITICAL — divergent gate loop preserved verbatim. The loop below increments
// `nonUniversalIndex` for EVERY non-universal def (including RANDOMIZE_EXCLUDED
// ones). usePatternCache's fresh-defaults loop increments only after skipping
// RANDOMIZE_EXCLUDED_KEYS. AR-1A deliberately did NOT unify these; unifying would
// shift which params are gated for guests. Do not touch this loop's counting.
export default function PatternParams() {
  const { patternType, defs, params, defaults, randomizeKeys } =
    useLayerParams();
  const { check, tier } = useGate();
  // Dock state flows through the portal (WI-4). When docked to the bottom shelf,
  // the param GROUPS columnize via InspectorShelf (WI-4b). null (legacy / no
  // provider) ⇒ isBottom=false ⇒ byte-unchanged vertical stack. Hook stays above
  // the early return so hook order is stable.
  const dock = useInspectorDockContext();
  const isBottom = dock?.dockPosition === "bottom";
  if (!defs) return null;

  // Build param items with gate checks
  let nonUniversalIndex = 0;
  const paramItems = defs.map((def) => {
    const isUniversal = UNIVERSAL_PARAM_KEYS.includes(def.key);
    const paramIndex = isUniversal ? -1 : nonUniversalIndex++;
    const gate = check("param", { paramKey: def.key, paramIndex, isUniversal, patternType });
    return { def, isUniversal, paramIndex, gate };
  });

  // Featured param: one param pinned above all groups for this pattern type.
  // Only show it featured if its gate allows (else fall back to normal flow —
  // never render a locked slot at the very top).
  // Conditional visibility (presentation-only): a def may carry
  // showIf(params) => boolean. When it returns false the row is dropped at the
  // render/grouping step ONLY — the gate loop above and lockedCount below still
  // iterate the FULL def list, so guest gating is identical whether or not a
  // param is hidden. Absent showIf = always shown.
  const isVisible = (def) => def.showIf?.(params) !== false;

  const featuredKey = FEATURED_PARAMS[patternType];
  const featuredItem = featuredKey
    ? paramItems.find((item) => item.def.key === featuredKey)
    : null;
  const showFeatured = Boolean(
    featuredItem && featuredItem.gate.allowed && isVisible(featuredItem.def)
  );

  // Group items by PARAM_GROUP_MAP. When a param is shown featured, exclude it
  // from its normal group so it doesn't render twice. Hidden (showIf=false)
  // items are dropped here so empty groups simply don't render (lines below).
  const grouped = {};
  for (const item of paramItems) {
    if (showFeatured && item.def.key === featuredKey) continue;
    if (!isVisible(item.def)) continue;
    const groupId = PARAM_GROUP_MAP[item.def.key] || "structure";
    if (!grouped[groupId]) grouped[groupId] = [];
    grouped[groupId].push(item);
  }

  // Count total locked params for guest summary — over the FULL list, so
  // showIf (presentation-only) never changes the locked count.
  const lockedCount = paramItems.filter((item) => !item.gate.allowed).length;

  // Group elements — byte-identical gate/guest/visibleItems logic to before;
  // only extracted into an array so it can be conditionally wrapped below.
  const groupEls = PARAM_GROUPS.map((group) => {
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
        randomizeKeys={randomizeKeys}
        defaults={defaults}
        params={params}
        tier={tier}
      />
    );
  });

  return (
    <div className="space-y-1.5">
      {/* Featured param — pinned above all groups, ungrouped, always visible */}
      {showFeatured && (
        <div className="pl-3 pb-0.5">
          <ParamRow def={featuredItem.def} />
        </div>
      )}

      {/* Groups — when docked to the bottom shelf they columnize into a
          fit-to-width grid (InspectorShelf drops the null group-els via
          React.Children.toArray, making each ParamGroup an atomic grid item).
          Otherwise: byte-unchanged vertical stack inside this space-y-1.5. */}
      {isBottom ? <InspectorShelf>{groupEls}</InspectorShelf> : groupEls}

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
