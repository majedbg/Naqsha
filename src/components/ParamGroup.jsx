import { useState, useRef, useEffect } from "react";
import { COLLAPSED_GROUPS } from "../constants";
import { isRowDefault } from "../lib/params/paramOps";
import ParamRow from "./ui/ParamRow";
import UpgradePrompt from "./UpgradePrompt";

// Reusable reset icon (circular refresh arrows)
function ResetIcon({ size = 10 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 4v6h6" />
      <path d="M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10" />
      <path d="M3.51 15A9 9 0 0 0 18.36 18.36L23 14" />
    </svg>
  );
}

export default function ParamGroup({
  group,
  items,
  params,
  defaults,
  randomizeKeys,
  onParamChange,
  onToggleKey,
  onToggleGroupKeys,
  onRandomizeSingle,
  onRandomizeGroup,
  onResetSingle,
  onResetGroup,
  tier,
}) {
  const [collapsed, setCollapsed] = useState(
    COLLAPSED_GROUPS.includes(group.id)
  );
  const cbRef = useRef(null);
  const keys = randomizeKeys || [];

  // Separate allowed vs locked items
  const allowedItems = items.filter((item) => item.gate.allowed);
  const lockedItems = items.filter((item) => !item.gate.allowed);

  const groupKeys = allowedItems.map((item) => item.def.key);
  const checkedCount = groupKeys.filter((k) => keys.includes(k)).length;
  const allChecked = checkedCount === groupKeys.length && groupKeys.length > 0;
  const noneChecked = checkedCount === 0;
  const isIndeterminate = !allChecked && !noneChecked;

  // Set indeterminate via ref (React doesn't support it as a prop)
  useEffect(() => {
    if (cbRef.current) cbRef.current.indeterminate = isIndeterminate;
  }, [isIndeterminate]);

  const hasCheckedInGroup = checkedCount > 0;

  // Check if any param in the group differs from its default
  const hasChanges = allowedItems.some(
    (item) => !isRowDefault(item.def, params, defaults)
  );

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded bg-paper-warm hover:bg-paper-warm transition-colors group/hdr"
      >
        {/* Chevron */}
        <svg
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={`text-ink-soft shrink-0 transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>

        {/* Group label */}
        <span className="text-[10px] uppercase tracking-wider text-ink-soft font-medium flex-1 text-left">
          {group.label}
        </span>

        {/* Group reset button */}
        {groupKeys.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onResetGroup(allowedItems.map((i) => i.def));
            }}
            disabled={!hasChanges}
            className="shrink-0 p-0.5 rounded text-ink-soft hover:text-tone-mild transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            title={
              hasChanges
                ? `Reset ${group.label} to defaults`
                : `${group.label} is at defaults`
            }
          >
            <ResetIcon size={10} />
          </button>
        )}

        {/* Group checkbox */}
        {groupKeys.length > 0 && (
          <label
            className="flex items-center shrink-0"
            title={allChecked ? "Deselect all in group" : "Select all in group"}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={cbRef}
              type="checkbox"
              checked={allChecked}
              onChange={() => onToggleGroupKeys(groupKeys, allChecked)}
              className="accent-saffron w-3 h-3 cursor-pointer"
            />
          </label>
        )}

        {/* Group randomize button */}
        {groupKeys.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRandomizeGroup(allowedItems.map((i) => i.def));
            }}
            disabled={!hasCheckedInGroup}
            className="shrink-0 p-0.5 rounded text-ink-soft hover:text-saffron transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={
              hasCheckedInGroup
                ? `Randomize ${group.label}`
                : `No checked params in ${group.label}`
            }
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M16 3h5v5" />
              <path d="M4 20L21 3" />
              <path d="M21 16v5h-5" />
              <path d="M15 15l6 6" />
              <path d="M4 4l5 5" />
            </svg>
          </button>
        )}
      </button>

      {/* Group body */}
      {!collapsed && (
        <div className="pl-3 pt-1.5 space-y-2">
          {allowedItems.map((item) => (
            <ParamRow
              key={item.def.key}
              def={item.def}
              params={params}
              defaults={defaults}
              randomizeKeys={randomizeKeys}
              onParamChange={onParamChange}
              onToggleKey={onToggleKey}
              onRandomizeSingle={onRandomizeSingle}
              onResetSingle={onResetSingle}
            />
          ))}

          {/* Free-tier locked params within this group */}
          {tier !== "guest" &&
            lockedItems.map((item) => (
              <div
                key={item.def.key}
                className="flex items-center gap-1.5 py-1 px-2 rounded bg-paper-warm border border-hairline opacity-60"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-ink-soft shrink-0"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span className="text-[11px] text-ink-soft flex-1">
                  {item.def.label}
                </span>
                <UpgradePrompt
                  upgradeTarget={item.gate.upgradeTarget}
                  compact
                />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
