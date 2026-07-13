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

import { Fragment, useCallback, useEffect, useState } from "react";
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

// Minutes for the deltas readout — same rounding as the headline (a projection,
// not a promise, so whole minutes).
function minutes(sec) {
  return Math.round((sec ?? 0) / 60);
}

// The applied Optimize stack is "current" when at least one row is enabled and
// no enabled row's preview tolerance has drifted from its applied value —
// i.e. there is nothing pending to preview, so before→after collapses to the
// single figure the machine will actually pay.
function appliedStackIsCurrent(optimizations) {
  const rows = Object.values(optimizations ?? {}).filter((o) => o?.enabled);
  if (rows.length === 0) return false;
  return rows.every(
    (o) => o.tolerance === undefined || o.tolerance === o.appliedTolerance
  );
}

export default function RunPlanPanel({
  runPlan,
  profileLabel,
  sheetLine,
  // Two-way locate (PRD story 25): the shared target arrives as `locate` (set
  // from the canvas side) and leaves through onLocate (row clicks / clear).
  locate,
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
  const penSwaps = runPlan?.estimate?.penSwaps ?? 0;

  // Locate ring state. The prop is the shared target (canvas → panel); a row
  // click echoes locally so the ring paints even before the parent round-trips.
  // Sentinel: undefined = defer to the prop, null = explicitly cleared.
  const [localLocate, setLocalLocate] = useState(undefined);
  useEffect(() => {
    setLocalLocate(undefined); // a new shared target wins over a stale echo
  }, [locate]);
  const effectiveLocate = localLocate === undefined ? locate ?? null : localLocate;

  const clearLocate = useCallback(() => {
    setLocalLocate(null);
    onLocate(null);
  }, [onLocate]);

  // Ephemeral: clicking the located row again toggles it off; Esc clears.
  const locateOp = (opId) => {
    if (effectiveLocate?.opId === opId) return clearLocate();
    setLocalLocate({ opId });
    onLocate({ opId });
  };

  useEffect(() => {
    if (!effectiveLocate) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") clearLocate();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [effectiveLocate, clearLocate]);

  // Live before→after readout: preview figures until the applied stack is
  // current, then the single current figure (no arrow — nothing is pending).
  const deltasLine = (() => {
    if (!optimizeDeltas) return null;
    const { travelBeforeM, travelAfterM, timeBeforeSec, timeAfterSec } = optimizeDeltas;
    const collapsed = appliedStackIsCurrent(optimizations);
    const travel = collapsed
      ? `Travel ${Number(travelAfterM).toFixed(1)} m`
      : `Travel ${Number(travelBeforeM).toFixed(1)} m → ${Number(travelAfterM).toFixed(1)} m`;
    if (timeBeforeSec == null || timeAfterSec == null) return travel;
    const time = collapsed
      ? `Estimated ${minutes(timeAfterSec)} min`
      : `Estimated ${minutes(timeBeforeSec)} → ${minutes(timeAfterSec)} min`;
    return `${travel} · ${time}`;
  })();

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
        <h3 className="mb-sm flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Operations
          {/* Pen Swap count (story 27, plotter only) — the estimate already
              pays PEN_SWAP_SEC per swap; this says HOW MANY, the markers below
              say WHERE. Quiet: part of the header, never an alarm. */}
          {penSwaps > 0 && (
            <span data-testid="pen-swap-count" className="num font-normal normal-case">
              {penSwaps} Pen {penSwaps === 1 ? "Swap" : "Swaps"}
            </span>
          )}
        </h3>
        <ul className="space-y-1">
          {opRows.map((op, i) => {
            const prev = opRows[i - 1];
            // A Pen change happens between adjacent groups whose pen differs —
            // pen slots only exist on plotter rows, so laser/drag plans never
            // render a marker.
            const swapBefore =
              i > 0 &&
              prev?.penSlot != null &&
              op.penSlot != null &&
              prev.penSlot !== op.penSlot;
            const located = effectiveLocate?.opId === op.opId;
            return (
            <Fragment key={op.opId}>
            {swapBefore && (
              <li
                data-testid="pen-swap-marker"
                aria-hidden="true"
                className="px-sm py-3xs text-center text-[10px] uppercase tracking-wide text-ink-soft"
              >
                Pen change
              </li>
            )}
            <li>
              <button
                type="button"
                data-testid="run-plan-op-row"
                aria-current={located ? "true" : undefined}
                onClick={() => locateOp(op.opId)}
                className={`flex w-full items-center gap-sm rounded-xs border bg-paper px-sm py-2xs text-left transition-colors duration-fast hover:bg-paper-warm focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet ${
                  located
                    ? "border-violet ring-1 ring-violet"
                    : "border-hairline"
                }`}
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
                    {/* Raster annotation (S8, #87): an engrave Operation that carries
                        an Etch scans a bitmap area×DPI, not a path — say so, and at
                        what DPI, so its `est` reads as a scan figure. "DPI" survives
                        the capitalize transform (already uppercase). */}
                    {op.raster && (
                      <span data-testid="run-plan-raster-note">
                        {" · "}raster {op.raster.dpi ? `${op.raster.dpi} DPI` : "mixed DPI"}
                      </span>
                    )}
                  </span>
                </span>
                <Metric label="draw" value={`${Math.round(op.drawMm)} mm`} />
                <Metric label="passes" value={`×${op.passes}`} />
                <Metric label="est" value={formatDuration(op.sec)} />
              </button>
            </li>
            </Fragment>
            );
          })}
        </ul>
      </div>

      {/* Optimize stack, moved in from the operations shelf. Same controls, same
          out-routing; a live before→after readout when the model supplies it. */}
      <div className="shrink-0 border-t border-hairline px-lg py-md">
        <h3 className="mb-sm text-xs font-semibold uppercase tracking-wider text-ink-soft">
          Optimize
        </h3>
        {deltasLine && (
          <p data-testid="optimize-deltas" className="num mb-sm text-xs text-ink-soft">
            {deltasLine}
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
