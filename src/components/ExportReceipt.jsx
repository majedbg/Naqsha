// ExportReceipt — the Export Receipt surface (Wave-3 Lane H).
//
// CONTEXT.md: "the calm one-line summary that accompanies every export —
// estimated run time, anything cropped, warning count — linking into the Run
// Plan. Export always succeeds; the receipt makes it never silent." ADR 0001
// makes this the close on the silent-failure hole for the quick-export path.
//
// Presentational + transient. It takes the already-built receipt view-model
// (buildExportReceipt output) plus callbacks, renders the single line, offers a
// "Run plan" affordance that links into the Run Plan, and auto-dismisses after a
// calm delay. It does NOT run the pipeline, read app state, or import sibling
// Wave-3 lanes — values and callbacks arrive as props; Lane I wires them.
//
// Idiom note: this is PAPER, not a stock toast. A hairline frame on paper ground,
// entering with the shared `anim-rise` (which collapses to 0ms under
// prefers-reduced-motion via the motion tokens — see tokens.css), sitting quietly
// rather than sliding/flashing. Principle 7: the copy is an action taken, so no
// alarm color and no --saffron (saffron is reserved for the plan's "Export run").

import { useEffect, useRef } from "react";

// A calm, readable default: long enough to finish reading the line and reach for
// the Run Plan affordance, short enough to clear itself without nagging.
const DEFAULT_AUTO_DISMISS_MS = 6000;

export default function ExportReceipt({
  receipt,
  onOpenPlan,
  onDismiss,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
}) {
  // Keep the latest onDismiss without resetting the timer when the parent passes
  // a fresh callback identity on re-render (the timer should track the receipt,
  // not every render).
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  // Hooks run before any early return (hooks-order). The timer restarts only when
  // a new receipt appears or the delay changes.
  useEffect(() => {
    if (!receipt) return undefined;
    const id = window.setTimeout(() => dismissRef.current?.(), autoDismissMs);
    return () => window.clearTimeout(id);
  }, [receipt, autoDismissMs]);

  if (!receipt) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="anim-rise flex items-center gap-sm max-w-[520px] bg-paper border border-hairline rounded-sm px-md py-2xs text-sm text-ink shadow-[0_8px_32px_-16px_oklch(0.24_0.05_270_/_0.30)]"
    >
      {/* The one line — an action taken, stated plainly. */}
      <span className="flex-1 leading-snug text-ink-soft">{receipt.line}</span>

      {/* Affordance into the Run Plan — a quiet violet link, never saffron. */}
      <button
        type="button"
        onClick={() => onOpenPlan?.()}
        className="shrink-0 rounded-xs px-2xs py-[2px] text-sm font-medium text-violet hover:text-violet-hover transition-colors duration-fast ease-out-quart outline-none focus-visible:ring-1 focus-visible:ring-violet"
      >
        → Run plan
      </button>
    </div>
  );
}
