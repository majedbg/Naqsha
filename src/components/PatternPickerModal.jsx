import { useEffect, useMemo, useState } from 'react';
import {
  PATTERN_TYPES,
  PATTERN_TAXONOMY,
  PATTERN_FAMILIES,
  GEOM_ORGANIC_BANDS,
  SPATIAL_FORM_ROWS,
} from '../constants';
import { getPatternClass } from '../lib/patterns';
import { getDynamicTypes, onRegistryChange } from '../lib/patternRegistry';
import { makePatternThumbnailSVG } from '../lib/patternThumbnail';
import { useGate } from '../lib/useGate';

// ── label + readiness helpers ───────────────────────────────────────────────
function labelFor(id, dynamicTypes) {
  const fromStatic = PATTERN_TYPES.find((t) => t.id === id);
  if (fromStatic) return fromStatic.label;
  const fromDynamic = dynamicTypes.find((t) => t.id === id);
  if (fromDynamic) return fromDynamic.label;
  return PATTERN_TAXONOMY[id]?.label || id;
}

// Determinism badge dot. deterministic ● · seeded ◐ · stochastic ○.
function DetBadge({ det }) {
  const map = {
    deterministic: { ch: '●', title: 'Deterministic — same every time' },
    seeded: { ch: '◐', title: 'Seeded — varies with the random seed' },
    stochastic: { ch: '○', title: 'Stochastic — emergent / simulated' },
  };
  const m = map[det] || map.deterministic;
  return <span title={m.title} className="text-ink-soft leading-none">{m.ch}</span>;
}

// Mark-type badge — what the pattern lays down (matters for cut/score/engrave).
function MarkBadge({ mark }) {
  const map = {
    line: { ch: '╱', title: 'Continuous line' },
    dash: { ch: '┊', title: 'Dashes / stipple' },
    fill: { ch: '▣', title: 'Filled regions' },
  };
  const m = map[mark] || map.line;
  return <span title={m.title} className="text-ink-soft leading-none">{m.ch}</span>;
}

// ── one card ────────────────────────────────────────────────────────────────
function PatternCard({ id, meta, label, ready, locked, lockReason, onPick }) {
  const fam = PATTERN_FAMILIES[meta.family] || { color: '#888', tint: 'rgba(136,136,136,0.08)' };
  const [svg, setSvg] = useState(null);
  const disabled = !ready || locked;

  // Lazily generate the thumbnail AFTER first paint so the grid renders fast.
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const t = setTimeout(() => {
      const out = makePatternThumbnailSVG(id, { color: fam.color });
      if (alive) setSvg(out);
    }, 0);
    return () => { alive = false; clearTimeout(t); };
  }, [id, ready, fam.color]);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onPick(id)}
      title={locked ? (lockReason || 'Locked') : (meta.blurb || label)}
      className={`group relative flex flex-col w-[150px] rounded-md border overflow-hidden text-left transition-all duration-fast ${
        disabled
          ? 'border-hairline cursor-not-allowed opacity-60'
          : 'border-card-border hover:-translate-y-0.5 hover:shadow-md cursor-pointer'
      }`}
      style={{ background: fam.tint, borderColor: disabled ? undefined : fam.color }}
    >
      {/* preview */}
      <div className="relative h-[92px] bg-paper flex items-center justify-center overflow-hidden">
        {ready && svg ? (
          <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          // placeholder / not-yet-rendered: family-coloured glyph
          <div
            className="w-7 h-7 rounded-full opacity-40"
            style={{ background: fam.color }}
            aria-hidden="true"
          />
        )}
        {!ready && (
          <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[9px] font-medium rounded bg-ink/70 text-paper">
            Soon
          </span>
        )}
        {ready && locked && (
          <span className="absolute top-1 right-1 px-1 py-0.5 rounded bg-ink/70 text-paper" aria-hidden="true">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </span>
        )}
      </div>

      {/* footer: family tab + label + badges */}
      <div className="px-2 py-1.5 bg-panel/80 border-t" style={{ borderColor: fam.color }}>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: fam.color }} />
          <span className="text-[11px] font-medium text-ink truncate flex-1">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
          <DetBadge det={meta.det} />
          <MarkBadge mark={meta.mark} />
          {meta.sym && <span title="Supports radial symmetry" className="text-ink-soft leading-none">✦</span>}
          {meta.bridge && PATTERN_FAMILIES[meta.bridge] && (
            <span
              title={`Bridges into ${PATTERN_FAMILIES[meta.bridge].label}`}
              className="w-1.5 h-1.5 rounded-full ml-auto"
              style={{ background: PATTERN_FAMILIES[meta.bridge].color, opacity: 0.7 }}
            />
          )}
        </div>
      </div>
    </button>
  );
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
    return (
      <PatternCard
        key={id}
        id={id}
        meta={meta}
        label={labelFor(id, dynamicTypes)}
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
          <div className="min-w-[760px]">
            {/* column headers */}
            <div
              className="grid gap-2 mb-2"
              style={{ gridTemplateColumns: `96px repeat(${GEOM_ORGANIC_BANDS.length}, minmax(160px, 1fr))` }}
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
                  className="grid gap-2 mb-2 items-start"
                  style={{ gridTemplateColumns: `96px repeat(${GEOM_ORGANIC_BANDS.length}, minmax(160px, 1fr))` }}
                >
                  <div className="text-[11px] text-ink-soft pt-2 pr-1 leading-tight">{row.label}</div>
                  {GEOM_ORGANIC_BANDS.map((b) => {
                    const items = cells[`${row.key}|${b.level}`] || [];
                    return (
                      <div key={b.level} className="flex flex-wrap gap-2 min-h-[8px]">
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
                <div className="flex flex-wrap gap-2">
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
