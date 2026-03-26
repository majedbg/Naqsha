import { PATTERN_PARAM_DEFS } from '../constants';
import { getDynamicParamDefs } from '../lib/patternRegistry';
import { useGate } from '../lib/useGate';
import { UNIVERSAL_PARAM_KEYS } from '../lib/tierLimits';
import UpgradePrompt from './UpgradePrompt';
import Slider from './ui/Slider';
import Select from './ui/Select';

// Generate a random value for a single param definition
function randomValueForDef(def) {
  if (def.type === 'select') {
    const opts = def.options;
    return opts[Math.floor(Math.random() * opts.length)].value;
  }
  const range = def.max - def.min;
  const raw = def.min + Math.random() * range;
  const snapped = Math.round(raw / def.step) * def.step;
  const decimals = String(def.step).split('.')[1]?.length || 0;
  return parseFloat(Math.max(def.min, Math.min(def.max, snapped)).toFixed(decimals));
}

export default function PatternParams({ patternType, params, onChange, randomizeKeys, onRandomizeKeysChange }) {
  const defs = PATTERN_PARAM_DEFS[patternType] || getDynamicParamDefs(patternType);
  const { check, tier } = useGate();
  if (!defs) return null;

  const keys = randomizeKeys || [];

  const toggleKey = (key) => {
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    onRandomizeKeysChange(next);
  };

  const randomizeSingle = (def) => {
    onChange({ ...params, [def.key]: randomValueForDef(def) });
  };

  // Separate non-universal params from universal ones, track original index
  let nonUniversalIndex = 0;
  const paramItems = defs.map((def) => {
    const isUniversal = UNIVERSAL_PARAM_KEYS.includes(def.key);
    const idx = isUniversal ? -1 : nonUniversalIndex++;
    return { def, isUniversal, paramIndex: idx };
  });

  // Count locked params for guest summary
  const lockedCount = paramItems.filter((item) => {
    const gate = check('param', {
      paramKey: item.def.key,
      paramIndex: item.paramIndex,
      isUniversal: item.isUniversal,
    });
    return !gate.allowed;
  }).length;

  let shownLockedSummary = false;

  return (
    <div className="space-y-2.5">
      {paramItems.map((item) => {
        const { def, isUniversal, paramIndex } = item;
        const gate = check('param', { paramKey: def.key, paramIndex, isUniversal });

        if (!gate.allowed) {
          // For guest: show a single summary block after the last allowed param
          if (tier === 'guest') {
            if (shownLockedSummary) return null;
            shownLockedSummary = true;
            return (
              <div key="__locked_summary" className="flex items-center gap-2 py-2 px-2 rounded bg-[#1e1e1e] border border-[#333]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-500 shrink-0">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
                <span className="text-[11px] text-gray-500">{lockedCount} more parameters</span>
                <span className="mx-1 text-gray-700">—</span>
                <UpgradePrompt upgradeTarget={gate.upgradeTarget} compact />
              </div>
            );
          }

          // For free tier: show individual locked param with Pro badge
          return (
            <div key={def.key} className="flex items-center gap-1.5 py-1 px-2 rounded bg-[#1e1e1e] border border-[#333] opacity-60">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-600 shrink-0">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <span className="text-[11px] text-gray-500 flex-1">{def.label}</span>
              <UpgradePrompt upgradeTarget={gate.upgradeTarget} compact />
            </div>
          );
        }

        return (
          <div key={def.key} className="flex items-start gap-1.5">
            {/* Randomize checkbox */}
            <label className="flex items-center mt-[3px] shrink-0" title="Include in batch randomize">
              <input
                type="checkbox"
                checked={keys.includes(def.key)}
                onChange={() => toggleKey(def.key)}
                className="accent-accent w-3 h-3 cursor-pointer"
              />
            </label>

            {/* The param control */}
            <div className="flex-1 min-w-0">
              {def.type === 'select' ? (
                <Select
                  label={def.label}
                  value={params[def.key] || def.options[0].value}
                  options={def.options}
                  onChange={(v) => onChange({ ...params, [def.key]: v })}
                  tooltip={def.tooltip}
                />
              ) : (
                <Slider
                  label={def.label}
                  value={params[def.key] ?? def.min}
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  onChange={(v) => onChange({ ...params, [def.key]: v })}
                  tooltip={def.tooltip}
                />
              )}
            </div>

            {/* Per-param randomize button */}
            <button
              onClick={() => randomizeSingle(def)}
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
    </div>
  );
}
