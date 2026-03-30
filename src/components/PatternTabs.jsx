import { useState, useEffect } from 'react';
import { PATTERN_TYPES } from '../constants';
import { useGate } from '../lib/useGate';
import { useAuth } from '../lib/AuthContext';
import { getDynamicTypes, onRegistryChange } from '../lib/patternRegistry';

export default function PatternTabs({ active, onChange, onOpenAIChat }) {
  const { check, tier } = useGate();
  const { profile } = useAuth();
  const [dynamicTypes, setDynamicTypes] = useState(getDynamicTypes());

  // Re-render when dynamic patterns change
  useEffect(() => {
    return onRegistryChange(() => setDynamicTypes([...getDynamicTypes()]));
  }, []);

  const allTypes = [...PATTERN_TYPES, ...dynamicTypes];
  const isPro = tier === 'pro' || tier === 'studio';

  return (
    <div className="flex flex-wrap gap-1">
      {allTypes.map((pt) => {
        const gate = check('pattern', pt.id);
        const isActive = active === pt.id;

        if (!gate.allowed && !pt.isAI) {
          return (
            <span
              key={pt.id}
              className="relative group/locked px-2 py-1 text-[11px] rounded bg-[#2a2a2a] text-gray-600 cursor-not-allowed flex items-center gap-1"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-50">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              {pt.label}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/locked:block z-50 px-2.5 py-1.5 text-[10px] text-gray-200 bg-[#222] border border-[#444] rounded-lg shadow-xl whitespace-nowrap">
                {gate.reason || 'Upgrade to unlock'}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#222] border-r border-b border-[#444] rotate-45 -mt-1" />
              </div>
            </span>
          );
        }

        return (
          <button
            key={pt.id}
            onClick={() => onChange(pt.id)}
            className={`px-2 py-1 text-[11px] rounded transition-colors ${
              isActive
                ? pt.isAI ? 'bg-purple-500 text-white font-medium' : 'bg-accent text-black font-medium'
                : pt.isAI ? 'bg-purple-500/20 text-purple-300 hover:text-purple-200 hover:bg-purple-500/30' : 'bg-[#333] text-gray-400 hover:text-gray-200 hover:bg-[#3a3a3a]'
            }`}
          >
            {pt.isAI && <span className="mr-0.5">*</span>}
            {pt.label}
          </button>
        );
      })}

      {/* + New Pattern button */}
      <button
        onClick={onOpenAIChat}
        disabled={!isPro}
        className={`px-2 py-1 text-[11px] rounded border border-dashed transition-colors flex items-center gap-1 ${
          isPro
            ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:border-purple-400'
            : 'border-[#444] text-gray-600 cursor-not-allowed'
        }`}
        title={isPro
          ? 'Describe a pattern and have AI create it'
          : 'Pro feature: AI pattern generation'
        }
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Pattern
        {!isPro && (
          <span className="text-[8px] bg-purple-500/20 text-purple-400 px-1 rounded ml-0.5">PRO</span>
        )}
      </button>
    </div>
  );
}
