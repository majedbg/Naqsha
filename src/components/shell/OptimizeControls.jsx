// OptimizeControls — the pro shell's compact home for the path-optimization
// controls (#16 AC2 re-home). The legacy Prepare tab's OptimizeSection let the
// user enable/configure simplify / merge / reorder; those optimizations flow into
// the SVG export (via appliedOptimizations) and the plot overlay. When the
// two-pane layout was decommissioned (#16) those controls lost their home; this
// re-homes them into the shell.
//
// Presentational + controlled: the optimization state lives in Studio's
// useOptimizations hook; this panel reads it in (`optimizations`) and reports
// every change OUT through the SAME surviving API the legacy section used —
//   - onUpdate(key, { tolerance })  → updateOptimization (slider drift, preview)
//   - onApply(key)                  → applyOptimization   (commit to export)
//   - onRevert(key)                 → revertOptimization  (disable)
// so export reads identical applied state. The heavy before/after fabrication
// stats the legacy OptimizeSection rendered are intentionally NOT reproduced here
// — they require the live pattern instances + the fabrication pipeline and are a
// preview nicety, not the AC2-load-bearing control. The controls themselves
// (enable + tolerance + apply/revert) are what had no home.
//
// Match the OperationsPanel's row/header chrome so it sits naturally in the same
// shell region (Studio portals it as a sibling of OperationsPanel).
//
// Collapsible: optimization is a set-once, rarely-touched step, so the panel
// collapses to a single header bar (collapsed by DEFAULT) — that lets the layer
// tree above fill the column and keeps the operations panel compact at the
// bottom. When collapsed, the header shows how many optimizations are applied so
// the state isn't hidden silently.

import { useState } from "react";

const ROWS = [
  {
    key: "simplify",
    title: "Simplify paths",
    description: "Reduce point count (RDP). Typical 0.2–0.5 mm.",
    slider: { min: 0, max: 2, step: 0.05 },
  },
  {
    key: "merge",
    title: "Merge lines",
    description: "Join paths whose endpoints are within tolerance.",
    slider: { min: 0, max: 5, step: 0.1 },
  },
  {
    key: "reorder",
    title: "Reorder for min travel",
    description: "Greedy nearest-neighbor draw order. No geometry change.",
    slider: null,
  },
];

function OptimizeRow({ def, opt, onUpdate, onApply, onRevert }) {
  const enabled = !!opt.enabled;
  // "Stale" = applied, then the slider moved away from the applied value, so a
  // re-apply is needed for export to pick up the new tolerance.
  const stale =
    enabled &&
    def.slider &&
    opt.appliedTolerance != null &&
    opt.tolerance !== opt.appliedTolerance;
  const applyLabel = stale ? "Re-apply" : enabled ? "Applied" : "Apply";

  return (
    <div
      data-testid={`optimize-row-${def.key}`}
      className="space-y-1.5 rounded-xs border border-hairline bg-paper px-2 py-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink">{def.title}</span>
        <div className="flex items-center gap-1.5">
          {enabled && (
            <button
              type="button"
              onClick={() => onRevert(def.key)}
              className="text-[10px] text-ink-soft hover:text-red-500 transition-colors"
            >
              Revert
            </button>
          )}
          <button
            type="button"
            onClick={() => onApply(def.key)}
            disabled={enabled && !stale}
            className={`rounded-xs px-2 py-0.5 text-[10px] font-medium transition-colors ${
              enabled && !stale
                ? "bg-tone-ok/10 text-tone-ok cursor-default"
                : stale
                  ? "bg-tone-mild/10 text-tone-mild hover:bg-tone-mild/20"
                  : "bg-saffron text-ink hover:bg-saffron-hover"
            }`}
          >
            {applyLabel}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-ink-soft leading-snug">{def.description}</p>

      {def.slider && (
        <label className="flex items-center gap-2 text-[10px] text-ink-soft">
          <span className="whitespace-nowrap">Tolerance (mm)</span>
          <input
            type="number"
            aria-label="Tolerance (mm)"
            value={opt.tolerance ?? ""}
            min={def.slider.min}
            max={def.slider.max}
            step={def.slider.step}
            onChange={(e) => {
              const raw = e.target.value;
              onUpdate(def.key, { tolerance: raw === "" ? "" : Number(raw) });
            }}
            className="w-16 rounded-xs border border-hairline bg-paper-warm px-1 py-0.5 text-[10px] text-ink outline-none focus:border-violet num"
          />
        </label>
      )}
    </div>
  );
}

export default function OptimizeControls({
  optimizations,
  onUpdate = () => {},
  onApply = () => {},
  onRevert = () => {},
}) {
  // Collapsed by default (see header note). Local state — not persisted, matching
  // the other shell panels.
  const [open, setOpen] = useState(false);
  const appliedCount = ROWS.reduce(
    (n, def) => n + (optimizations?.[def.key]?.enabled ? 1 : 0),
    0
  );

  return (
    <div
      className="flex flex-col border-t border-hairline"
      data-testid="optimize-controls"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="optimize-body"
        onClick={() => setOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1.5 border-b border-hairline px-2 py-1 text-left hover:bg-paper-warm transition-colors"
      >
        {/* Disclosure chevron: points right when collapsed, down when open. */}
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={`shrink-0 text-ink-soft transition-transform duration-fast ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
          Optimize
        </span>
        {!open && appliedCount > 0 && (
          <span className="ml-auto rounded-xs bg-tone-ok/10 px-1.5 py-0.5 text-[9px] font-medium text-tone-ok">
            {appliedCount} applied
          </span>
        )}
      </button>
      {open && (
        <div id="optimize-body" className="space-y-1 overflow-auto p-1.5">
          {ROWS.map((def) => (
            <OptimizeRow
              key={def.key}
              def={def}
              opt={optimizations?.[def.key] ?? {}}
              onUpdate={onUpdate}
              onApply={onApply}
              onRevert={onRevert}
            />
          ))}
        </div>
      )}
    </div>
  );
}
