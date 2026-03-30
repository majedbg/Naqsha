import { useState, useRef, useEffect } from 'react';
import { COLLAPSED_GROUPS } from '../constants';
import Slider from './ui/Slider';
import Select from './ui/Select';
import UpgradePrompt from './UpgradePrompt';

export default function ParamGroup({
  group,
  items,
  params,
  randomizeKeys,
  onParamChange,
  onToggleKey,
  onToggleGroupKeys,
  onRandomizeSingle,
  onRandomizeGroup,
  tier,
}) {
  const [collapsed, setCollapsed] = useState(COLLAPSED_GROUPS.includes(group.id));
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

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded bg-[#1a1a1a] hover:bg-[#1e1e1e] transition-colors group/hdr"
      >
        {/* Chevron */}
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
          className={`text-gray-600 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>

        {/* Group label */}
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium flex-1 text-left">
          {group.label}
        </span>

        {/* Group checkbox */}
        {groupKeys.length > 0 && (
          <label
            className="flex items-center shrink-0"
            title={allChecked ? 'Deselect all in group' : 'Select all in group'}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={cbRef}
              type="checkbox"
              checked={allChecked}
              onChange={() => onToggleGroupKeys(groupKeys, allChecked)}
              className="accent-accent w-3 h-3 cursor-pointer"
            />
          </label>
        )}

        {/* Group randomize button */}
        {groupKeys.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); onRandomizeGroup(allowedItems.map((i) => i.def)); }}
            disabled={!hasCheckedInGroup}
            className="shrink-0 p-0.5 rounded text-gray-600 hover:text-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title={hasCheckedInGroup ? `Randomize ${group.label}` : `No checked params in ${group.label}`}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
          {allowedItems.map((item) => {
            const { def } = item;
            return (
              <div key={def.key} className="flex items-start gap-1.5">
                {/* Randomize checkbox */}
                <label className="flex items-center mt-[3px] shrink-0" title="Include in randomize">
                  <input
                    type="checkbox"
                    checked={keys.includes(def.key)}
                    onChange={() => onToggleKey(def.key)}
                    className="accent-accent w-3 h-3 cursor-pointer"
                  />
                </label>

                {/* Param control */}
                <div className="flex-1 min-w-0">
                  {def.type === 'select' ? (
                    <Select
                      label={def.label}
                      value={params[def.key] || def.options[0].value}
                      options={def.options}
                      onChange={(v) => onParamChange({ ...params, [def.key]: v })}
                      tooltip={def.tooltip}
                    />
                  ) : (
                    <Slider
                      label={def.label}
                      value={params[def.key] ?? def.min}
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      onChange={(v) => onParamChange({ ...params, [def.key]: v })}
                      tooltip={def.tooltip}
                    />
                  )}
                </div>

                {/* Per-param randomize */}
                <button
                  onClick={() => onRandomizeSingle(def)}
                  className="mt-[3px] shrink-0 p-0.5 rounded text-gray-600 hover:text-accent transition-colors"
                  title={`Randomize ${def.label}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 3h5v5" />
                    <path d="M4 20L21 3" />
                    <path d="M21 16v5h-5" />
                    <path d="M15 15l6 6" />
                    <path d="M4 4l5 5" />
                  </svg>
                </button>
              </div>
            );
          })}

          {/* Free-tier locked params within this group */}
          {tier !== 'guest' && lockedItems.map((item) => (
            <div key={item.def.key} className="flex items-center gap-1.5 py-1 px-2 rounded bg-[#1e1e1e] border border-[#333] opacity-60">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600 shrink-0">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <span className="text-[11px] text-gray-500 flex-1">{item.def.label}</span>
              <UpgradePrompt upgradeTarget={item.gate.upgradeTarget} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
