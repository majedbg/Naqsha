// RunPlanPanel — the Run Plan's pre-flight face (Wave-3 Lane F, PRD #73).
//
// The maker, typically with the laptop at the machine, opens the Run Plan to see
// exactly what the machine will do: the machine-qualified title, the Sheet and
// Bed it works on, the estimated run time, the per-Operation breakdown in machine
// execution order, the moved-in Optimize stack, any warnings to locate, and the
// single "Export run" action. Export does not REQUIRE passing through here (see
// Export Receipt) — this is the deliberate commit-to-the-machine step where
// upstream-live editing gives way to preview → apply → export.
//
// Presentational + decoupled: this component talks ONLY through props/callbacks.
// Lane I (Studio) owns all wiring and conforms to this contract.
//
// Colour discipline (.impeccable principle 2): saffron is the single load-bearing
// accent across this lane, reserved for the "Export run" action — nothing else
// here uses it. The Optimize stack's Apply is a quiet violet (see OptimizeRows).

import { useEffect, useState } from "react";
import { OptimizeRows } from "./OptimizeControls";

// Calm, specific, action-phrased warning copy (.impeccable principle 7): name
// what happened and offer the locate verb — no exclamation marks, no alarm
// glyphs. Clicking the row locates the affected geometry on the canvas.
const WARNING_COPY = {
  "sheet-exceeds-bed": "The Sheet reaches past the bed. Show the area.",
  "cropped-paths": "Some paths fall outside the Sheet and will be cropped. Show them.",
  overlaps: "Some paths overlap. Show where.",
  "unresolved-layer": "A layer has no Operation assigned. Show it.",
};

function warningLine(warning) {
  // Sampled overlap check: `truncated` means the checker hit its sampling cap,
  // so `count` is a LOWER BOUND, not a total. Say so — and when the sweep was
  // too dense to count anything (count 0 + truncated), say THAT; never render
  // "0 overlaps" and never suppress the row (principle 7: specific and calm).
  if (warning.type === "overlaps" && warning.truncated) {
    return typeof warning.count === "number" && warning.count > 0
      ? `${WARNING_COPY.overlaps} (at least ${warning.count} overlaps · sampled)`
      : "Paths are too dense to fully check for overlaps. Show the area.";
  }
  const base = WARNING_COPY[warning.type] ?? "Something needs a look. Show it.";
  return typeof warning.count === "number" ? `${base} (${warning.count})` : base;
}

// Format a duration in seconds as m:ss for the per-Operation rows.
function formatDuration(sec) {
  const total = Math.max(0, Math.round(sec ?? 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// A metric slot: a tabular-lining value over a quiet caption, so the breakdown
// reads as a scannable table (.impeccable principle 5 — precision you can see).
function Metric({ label, value }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="num text-sm text-ink">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-ink-soft">{label}</span>
    </div>
  );
}

export default function RunPlanPanel({
  runPlan,
  profileLabel,
  sheetLine,
  onLocate = () => {},
  optimizations,
  onUpdateOptimization = () => {},
  onApplyOptimization = () => {},
  onRevertOptimization = () => {},
  optimizeDeltas,
  onExportRun = () => {},
  onClose = () => {},
}) {
  const opRows = runPlan?.opRows ?? [];
  const warnings = runPlan?.warnings ?? [];
  const totalSec = runPlan?.estimate?.totalSec ?? 0;
  const headlineMin = Math.round(totalSec / 60);

  return (
    <section
      data-testid="run-plan-panel"
      aria-label="Run Plan"
      className="flex h-full flex-col overflow-auto bg-paper text-ink"
    >
      {/* Header: a calm exit back to the design surface, then the machine-
          qualified title and the Sheet + Bed line. */}
      <header className="relative shrink-0 border-b border-hairline px-lg py-md">
        {/* The panel's own close affordance. Distinct accessible name from the
            shell's "Back to design" chrome (AppShell) so the two exits never
            collide when Lane I composes shell + panel. */}
        <button
          type="button"
          aria-label="Close Run Plan"
          onClick={onClose}
          className="absolute right-sm top-sm inline-flex size-6 items-center justify-center rounded-xs text-ink-soft transition-colors duration-fast hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="font-display text-md text-ink">Run Plan: {profileLabel}</h2>
        <p className="num mt-2xs text-sm text-ink-soft">{sheetLine}</p>

        {/* Headline display face — the estimated run time. Always spells out
            "Estimated" so the number reads as a projection, not a promise. */}
        <p
          data-testid="run-plan-headline"
          className="num mt-md text-lg text-ink"
        >
          Estimated · {headlineMin} min
        </p>
      </header>

      {/* Per-Operation breakdown, in machine execution order. Each row locates
          its Operation on the canvas. */}
      <div className="shrink-0 px-lg py-md">
        <h3 className="mb-sm text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Operations
        </h3>
        <ul className="space-y-1">
          {opRows.map((op) => (
            <li key={op.opId}>
              <button
                type="button"
                data-testid="run-plan-op-row"
                onClick={() => onLocate({ opId: op.opId })}
                className="flex w-full items-center gap-sm rounded-xs border border-hairline bg-paper px-sm py-2xs text-left transition-colors duration-fast hover:bg-paper-warm focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet"
              >
                {/* Colour swatch — the Operation's own drawn colour (user
                    content), never chrome. */}
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-xs border border-hairline"
                  style={{ backgroundColor: op.color }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{op.name}</span>
                  <span className="block truncate text-[10px] capitalize text-ink-soft">
                    {op.process} · {op.layerCount} {op.layerCount === 1 ? "layer" : "layers"}
                  </span>
                </span>
                <Metric label="draw" value={`${Math.round(op.drawMm)} mm`} />
                <Metric label="passes" value={`×${op.passes}`} />
                <Metric label="est" value={formatDuration(op.sec)} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Optimize stack, moved in from the operations shelf. Same controls, same
          out-routing; a live before→after readout when the model supplies it. */}
      <div className="shrink-0 border-t border-hairline px-lg py-md">
        <h3 className="mb-sm text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Optimize
        </h3>
        {optimizeDeltas && (
          <p className="num mb-sm text-xs text-ink-soft">
            <span className="block">
              Travel {optimizeDeltas.travelBeforeM} m → {optimizeDeltas.travelAfterM} m
            </span>
            {optimizeDeltas.timeBeforeSec != null && optimizeDeltas.timeAfterSec != null && (
              <span className="block">
                Time {formatDuration(optimizeDeltas.timeBeforeSec)} → {formatDuration(optimizeDeltas.timeAfterSec)}
              </span>
            )}
          </p>
        )}
        <div className="space-y-1">
          <OptimizeRows
            optimizations={optimizations}
            onUpdate={onUpdateOptimization}
            onApply={onApplyOptimization}
            onRevert={onRevertOptimization}
          />
        </div>
      </div>

      {/* Warnings — calm, action-phrased; each row locates its geometry. Absent
          entirely when there are none, so the plan reads clean. */}
      {warnings.length > 0 && (
        <div className="shrink-0 border-t border-hairline px-lg py-md">
          <h3 className="mb-sm text-xs font-semibold uppercase tracking-wider text-ink-soft">
            Before you run
          </h3>
          <ul className="space-y-1">
            {warnings.map((warning, i) => (
              <li key={`${warning.type}-${i}`}>
                <button
                  type="button"
                  data-testid="run-plan-warning"
                  onClick={() => onLocate(warning.locate)}
                  className="flex w-full items-center gap-sm rounded-xs border border-hairline bg-paper px-sm py-2xs text-left text-sm text-ink transition-colors duration-fast hover:bg-paper-warm focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-tone-mild"
                  />
                  {warningLine(warning)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The commit. The single saffron element in the lane. */}
      <footer className="mt-auto shrink-0 border-t border-hairline px-lg py-md">
        <button
          type="button"
          onClick={onExportRun}
          className="w-full rounded-xs bg-saffron px-md py-sm text-base font-medium text-ink transition-colors duration-fast hover:bg-saffron-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet"
        >
          Export run
        </button>
      </footer>
    </section>
  );
}
