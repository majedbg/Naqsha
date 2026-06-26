import { useEffect, useMemo, useState } from 'react';
import {
  PATTERN_TYPES,
  PATTERN_TAXONOMY,
  PATTERN_FAMILIES,
  PATTERN_SYMBOLS,
  GEOM_ORGANIC_BANDS,
  SPATIAL_FORM_ROWS,
} from '../constants';
import { getPatternClass } from '../lib/patterns';
import { getDynamicTypes, onRegistryChange } from '../lib/patternRegistry';
import { getVisiblePatterns } from '../lib/patternCatalog';
import { useGate } from '../lib/useGate';
import usePatternPicker from '../lib/hooks/usePatternPicker';
import PatternCard from './PatternCard';
import PatternTableView from './PatternTableView';
import PatternGalleryView from './PatternGalleryView';

// ── label + readiness helpers ───────────────────────────────────────────────
function labelFor(id, dynamicTypes) {
  const fromStatic = PATTERN_TYPES.find((t) => t.id === id);
  if (fromStatic) return fromStatic.label;
  const fromDynamic = dynamicTypes.find((t) => t.id === id);
  if (fromDynamic) return fromDynamic.label;
  return PATTERN_TAXONOMY[id]?.label || id;
}

const TABS = [
  { view: 'map', label: 'Map' },
  { view: 'grid', label: 'Grid' },
];

export default function PatternPickerModal({ open, onClose, onPick }) {
  const { check } = useGate();
  const [dynamicTypes, setDynamicTypes] = useState(getDynamicTypes());

  useEffect(() => onRegistryChange(() => setDynamicTypes([...getDynamicTypes()])), []);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Single source of truth for "what patterns exist" — drives the Grid view AND
  // the family-key list the picker hook needs for Select-all/Clear-all.
  const visiblePatterns = useMemo(() => getVisiblePatterns(dynamicTypes), [dynamicTypes]);

  // Distinct family keys present, ordered by PATTERN_FAMILIES key order with the
  // synthetic 'custom' family last (so clearAll empties the whole grid).
  const familyKeys = useMemo(() => {
    const present = new Set(visiblePatterns.map((p) => p.familyKey));
    const ordered = Object.keys(PATTERN_FAMILIES).filter((k) => present.has(k));
    if (present.has('custom')) ordered.push('custom');
    return ordered;
  }, [visiblePatterns]);

  // Picker state (view persisted, default 'grid'; filter resets on open). Called
  // UNCONDITIONALLY, before the early return, to keep hook order stable.
  const { view, setView, isOn, toggle, selectAll, clearAll } = usePatternPicker({ open, familyKeys });

  // Place every taxonomy pattern into its (form-row × geom-band) cell for the
  // Map view. Warn on any entry whose form/geom doesn't match a known row/band
  // (typo guard), and collect ready-but-untaxonomied patterns into a Custom bucket.
  const { cells, custom } = useMemo(() => {
    const cells = {}; // `${formKey}|${geomLevel}` -> [{ id, meta }]
    const validForms = new Set(SPATIAL_FORM_ROWS.map((r) => r.key));
    const validGeom = new Set(GEOM_ORGANIC_BANDS.map((b) => b.level));

    for (const [id, meta] of Object.entries(PATTERN_TAXONOMY)) {
      if (meta.pickerHidden) continue;
      if (!validForms.has(meta.form) || !validGeom.has(meta.geom)) {
        console.warn(`[PatternPicker] "${id}" has unknown form/geom (${meta.form}/${meta.geom}) — not placed.`);
        continue;
      }
      const key = `${meta.form}|${meta.geom}`;
      (cells[key] ||= []).push({ id, meta });
    }

    // Ready dynamic/AI patterns with no taxonomy entry → Custom row.
    const taxIds = new Set(Object.keys(PATTERN_TAXONOMY));
    const custom = dynamicTypes
      .filter((t) => !taxIds.has(t.id) && !!getPatternClass(t.id))
      .map((t) => t.id);

    return { cells, custom };
  }, [dynamicTypes]);

  if (!open) return null;

  // Shared card factory — same gate/ready/label/symbol resolution for both the
  // Map (size 92) and Grid (size 140) views, so the two never drift.
  const cardFor = (id, meta, size = 92) => {
    const ready = !!getPatternClass(id);
    const gate = check('pattern', id);
    const label = labelFor(id, dynamicTypes);
    return (
      <PatternCard
        key={id}
        id={id}
        meta={meta}
        symbol={PATTERN_SYMBOLS[id] || label.slice(0, 2)}
        label={label}
        ready={ready}
        locked={ready && !gate.allowed}
        lockReason={gate.reason}
        onPick={onPick}
        size={size}
      />
    );
  };

  // Grid render-prop — reuse cardFor at the larger gallery size.
  const renderCardGallery = (item) => cardFor(item.id, item.meta, 140);

  // Arrow-key roving between the two tabs (nice-to-have over native + aria).
  const onTabKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const idx = TABS.findIndex((t) => t.view === view);
    const next = e.key === 'ArrowRight' ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length;
    setView(TABS[next].view);
  };

  const subtitle = view === 'map'
    ? 'Columns run geometric → organic · rows are spatial form · colour is the pattern family'
    : 'Filter by family · pick a pattern to use it';

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/70 flex items-start justify-center pt-10 px-4"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-card-border rounded-lg w-full max-w-[1120px] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-ink">Choose a pattern</h2>
            <p className="text-[11px] text-ink-soft mt-0.5">
              {view === 'map' ? (
                <>
                  Columns run <span className="text-ink">geometric → organic</span> · rows are spatial form · colour is the pattern family
                </>
              ) : (
                subtitle
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* view tabs */}
            <div role="tablist" aria-label="Pattern picker views" className="flex items-center gap-1">
              {TABS.map((t) => {
                const active = view === t.view;
                return (
                  <button
                    key={t.view}
                    role="tab"
                    id={`picker-tab-${t.view}`}
                    aria-selected={active}
                    aria-controls={`picker-panel-${t.view}`}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setView(t.view)}
                    onKeyDown={onTabKeyDown}
                    className={`rounded-xs border px-2.5 py-1 text-[11px] font-medium transition-colors duration-fast ease-out-quart ${
                      active
                        ? 'border-violet text-violet bg-violet/10'
                        : 'border-hairline text-ink-soft hover:text-ink hover:border-ink-soft'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={onClose}
              className="text-ink-soft hover:text-ink transition-colors text-xl leading-none px-1"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {/* body — the active view */}
        {view === 'map' ? (
          <div
            role="tabpanel"
            id="picker-panel-map"
            aria-labelledby="picker-tab-map"
            className="overflow-auto p-4 flex-1 min-h-0"
          >
            <PatternTableView cells={cells} custom={custom} cardFor={cardFor} />
          </div>
        ) : (
          <div
            role="tabpanel"
            id="picker-panel-grid"
            aria-labelledby="picker-tab-grid"
            className="flex-1 min-h-0 p-4 flex flex-col"
          >
            <PatternGalleryView
              patterns={visiblePatterns}
              isOn={isOn}
              onToggle={toggle}
              onSelectAll={selectAll}
              onClearAll={clearAll}
              renderCard={renderCardGallery}
            />
          </div>
        )}

        {/* legend */}
        <div className="px-4 py-2.5 border-t border-hairline shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-soft">
          {view === 'map' &&
            Object.values(PATTERN_FAMILIES).map((f) => (
              <span key={f.key} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: f.color }} />
                {f.label}
              </span>
            ))}
          <span className="ml-auto flex items-center gap-2">
            <span>● deterministic</span><span>◐ seeded</span><span>○ stochastic</span><span>✦ symmetry</span>
          </span>
        </div>
      </div>
    </div>
  );
}
