import { useEffect, useRef } from 'react';

const TABS = [
  { id: 'design',  label: 'Design',  shortcut: '⌘1' },
  { id: 'prepare', label: 'Prepare', shortcut: '⌘2' },
  { id: 'export',  label: 'Export',  shortcut: '⌘3' },
];

export default function SidebarTabs({ activeTab, onChange, prepareStale = false, prepareConfigured = false }) {
  const tablistRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '1') { e.preventDefault(); onChange('design'); }
      else if (e.key === '2') { e.preventDefault(); onChange('prepare'); }
      else if (e.key === '3') { e.preventDefault(); onChange('export'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange]);

  return (
    <div
      role="tablist"
      aria-label="Workflow stage"
      ref={tablistRef}
      className="flex items-center bg-[#141414] border border-[#2e2e2e] rounded-lg p-1 gap-1"
    >
      {TABS.map((t) => {
        const active = activeTab === t.id;
        const showStale = t.id === 'prepare' && prepareStale && prepareConfigured;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            aria-controls={`tabpanel-${t.id}`}
            id={`tab-${t.id}`}
            onClick={() => onChange(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-all ${
              active
                ? 'bg-[#2a2a2a] text-gray-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
            title={`${t.label} (${t.shortcut})`}
          >
            <span>{t.label}</span>
            {showStale && (
              <span
                aria-label="Design changed — re-prepare to update"
                title="Design changed — re-prepare to update"
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
