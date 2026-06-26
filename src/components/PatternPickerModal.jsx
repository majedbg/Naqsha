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
import { useGate } from '../lib/useGate';
import PatternCard from './PatternCard';

// ── label + readiness helpers ───────────────────────────────────────────────
function labelFor(id, dynamicTypes) {
  const fromStatic = PATTERN_TYPES.find((t) => t.id === id);
  if (fromStatic) return fromStatic.label;
  const fromDynamic = dynamicTypes.find((t) => t.id === id);
  if (fromDynamic) return fromDynamic.label;
  return PATTERN_TAXONOMY[id]?.label || id;
}

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

  // Place every taxonomy pattern into its (form-row × geom-band) cell. Warn on
  // any entry whose form/geom doesn't match a known row/band (typo guard), and
  // collect ready-but-untaxonomied patterns (e.g. AI ones) into a Custom bucket.
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

  const cardFor = (id, meta) => {
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
      />
    );
  };

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
              Columns run <span className="text-ink">geometric → organic</span> · rows are spatial form · colour is the pattern family
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-ink-soft hover:text-ink transition-colors text-xl leading-none px-1"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* body — the periodic table */}
        <div className="overflow-auto p-4">
          <div className="min-w-[640px]">
            {/* column headers */}
            <div
              className="grid gap-1.5 mb-2"
              style={{ gridTemplateColumns: `66px repeat(${GEOM_ORGANIC_BANDS.length}, minmax(104px, 1fr))` }}
            >
              <div />
              {GEOM_ORGANIC_BANDS.map((b) => (
                <div key={b.level} className="px-1">
                  <div className="text-[11px] font-semibold text-ink">{b.label}</div>
                  <div className="text-[10px] text-ink-soft">{b.hint}</div>
                </div>
              ))}
            </div>

            {/* rows */}
            {SPATIAL_FORM_ROWS.map((row) => {
              const rowHasAny = GEOM_ORGANIC_BANDS.some((b) => (cells[`${row.key}|${b.level}`] || []).length);
              if (!rowHasAny) return null; // hide fully-empty rows to save height
              return (
                <div
                  key={row.key}
                  className="grid gap-1.5 mb-1.5 items-start"
                  style={{ gridTemplateColumns: `66px repeat(${GEOM_ORGANIC_BANDS.length}, minmax(104px, 1fr))` }}
                >
                  <div className="text-[10px] text-ink-soft pt-1.5 pr-1 leading-tight">{row.label}</div>
                  {GEOM_ORGANIC_BANDS.map((b) => {
                    const items = cells[`${row.key}|${b.level}`] || [];
                    return (
                      <div key={b.level} className="flex flex-wrap gap-1.5 min-h-[8px]">
                        {items.map(({ id, meta }) => cardFor(id, meta))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* custom / AI patterns with no taxonomy slot */}
            {custom.length > 0 && (
              <div className="mt-4 pt-3 border-t border-hairline">
                <div className="text-[11px] text-ink-soft mb-2">Custom</div>
                <div className="flex flex-wrap gap-1.5">
                  {custom.map((id) =>
                    cardFor(id, { family: 'C', det: 'seeded', mark: 'line', sym: false, blurb: 'Custom pattern' })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* legend */}
        <div className="px-4 py-2.5 border-t border-hairline shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-ink-soft">
          {Object.values(PATTERN_FAMILIES).map((f) => (
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
