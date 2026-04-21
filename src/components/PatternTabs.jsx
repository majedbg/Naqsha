import { useState, useEffect, useRef } from 'react';
import { PATTERN_TYPES } from '../constants';
import { useGate } from '../lib/useGate';

import { getDynamicTypes, onRegistryChange } from '../lib/patternRegistry';

export default function PatternTabs({ active, onChange, onOpenAIChat }) {
  const { check } = useGate();
  const [dynamicTypes, setDynamicTypes] = useState(getDynamicTypes());
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef(null);

  // Re-render when dynamic patterns change
  useEffect(() => {
    return onRegistryChange(() => setDynamicTypes([...getDynamicTypes()]));
  }, []);

  const allTypes = [...PATTERN_TYPES, ...dynamicTypes];
  // AI pattern generation is allowed for anyone whose tier enables it
  // (now Free + Pro + Studio — Guest still locked behind sign-in).
  const aiAllowed = check('aiCredits').allowed;

  // Sort: active first, then unlocked, then locked
  const sorted = [...allTypes].sort((a, b) => {
    const aActive = a.id === active ? 0 : 1;
    const bActive = b.id === active ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;

    const aAllowed = check('pattern', a.id).allowed ? 0 : 1;
    const bAllowed = check('pattern', b.id).allowed ? 0 : 1;
    return aAllowed - bAllowed;
  });

  const renderTab = (pt) => {
    const gate = check('pattern', pt.id);
    const isActive = active === pt.id;

    if (!gate.allowed && !pt.isAI) {
      return (
        <span
          key={pt.id}
          className="relative group/locked px-2 py-1 text-[11px] rounded bg-paper-warm text-ink-soft cursor-not-allowed flex items-center gap-1"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-50">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          {pt.label}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/locked:block z-50 px-2.5 py-1.5 text-[10px] text-ink bg-paper-warm border border-hairline rounded-lg shadow-xl whitespace-nowrap">
            {gate.reason || 'Upgrade to unlock'}
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-paper-warm border-r border-b border-hairline rotate-45 -mt-1" />
          </div>
        </span>
      );
    }

    // AI-generated patterns get a small violet dot before the label
    // instead of an all-over purple fill. AI is just another pattern —
    // differentiated by origin, not by saturation.
    return (
      <button
        key={pt.id}
        onClick={() => { onChange(pt.id); setExpanded(false); }}
        className={`px-2 py-1 text-xs rounded-xs transition-colors duration-fast ease-out-quart flex items-center gap-1 ${
          isActive
            ? 'bg-saffron text-ink font-medium'
            : 'bg-paper-warm text-ink-soft hover:text-ink hover:bg-muted'
        }`}
      >
        {pt.isAI && (
          <span
            aria-hidden="true"
            className={`inline-block w-1.5 h-1.5 rounded-xs ${
              isActive ? 'bg-ink' : 'bg-violet'
            }`}
          />
        )}
        {pt.label}
      </button>
    );
  };

  return (
    <div>
      {/* Collapsed: single row with overflow hidden + More button */}
      <div className="flex items-center gap-1">
        <div
          ref={rowRef}
          className={`flex flex-wrap gap-1 flex-1 ${expanded ? '' : 'max-h-[26px] overflow-hidden'}`}
        >
          {sorted.map(renderTab)}

          {/* + New Pattern button — dashed violet outline on paper marks
              this as the "invent something new" affordance. */}
          <button
            onClick={onOpenAIChat}
            disabled={!aiAllowed}
            className={`px-2 py-1 text-xs rounded-xs border border-dashed transition-colors duration-fast ease-out-quart flex items-center gap-1 ${
              aiAllowed
                ? 'border-violet text-violet hover:bg-violet/10 hover:border-violet-hover'
                : 'border-hairline text-ink-soft cursor-not-allowed'
            }`}
            title={aiAllowed
              ? 'Describe a pattern and have AI create it'
              : 'Sign in to generate an AI pattern'
            }
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New
          </button>
        </div>

        {/* More / Less toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 px-1.5 py-1 text-[10px] text-ink-soft hover:text-ink transition-colors"
          title={expanded ? 'Show less' : 'Show all patterns'}
        >
          {expanded ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
