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
  return (
    <div
      className="flex flex-col border-t border-hairline"
      data-testid="optimize-controls"
    >
      <div className="flex shrink-0 items-center border-b border-hairline px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
          Optimize
        </span>
      </div>
      <div className="space-y-1 overflow-auto p-1.5">
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
    </div>
  );
}
