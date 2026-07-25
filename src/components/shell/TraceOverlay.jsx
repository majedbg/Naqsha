// TraceOverlay — the accumulating "toolpath rehearsal" marks for the Trace sweep
// (issue #91). When a motif is being traced, this lights a saffron ring on the
// REAL canvas at each placed instance, in placement order, growing to
// `progressIndex` (the sweep's lit count) — ink laid down and left lit.
//
// COORDINATES — no conversion, by design. It mounts as a sibling INSIDE
// RightPanel's CSS-scaled canvas box (viewBox `0 0 canvasW canvasH`), exactly like
// AnchorGhostOverlay / PlotOverlay / FieldOverlay, so the box's
// transform: scale·translate handles zoom / pan / DPI for free and a
// `<circle cx={pos.x} cy={pos.y}>` lands on the drawn instance. (This is why Trace
// is NOT mounted as a Studio sibling next to MotifDropLayer — that layer does no
// canvas→screen mapping; alignment is load-bearing, so it lives where the artwork
// coordinate space already exists.)
//
// House rules: saffron is the load-bearing accent WHILE tracing (the sweep IS the
// subject). Pure SVG, tinted via `currentColor` off the SVG's `text-saffron` so no
// hard-coded hex leaks in. aria-hidden decorative — the canvas is the source of
// truth; the marks never capture pointer events.
import { memo } from "react";

// Marks are cheap SVG circles, up to MAX_PLACEMENTS (2000). React reconciles a
// growing PREFIX of a stable key list, so each step adds a handful of nodes rather
// than rebuilding — measured smooth at that ceiling, so no single-<path> batching
// is needed here (documented choice: readability + per-mark radius win over the
// micro-optimisation). The component is memoized so an unrelated Studio re-render
// (with an unchanged positions reference — the useCanvas churn guard keeps it
// stable) never re-renders the marks.
function TraceOverlay({ positions, progressIndex, canvasW, canvasH }) {
  const count = Array.isArray(positions) ? positions.length : 0;
  // Nothing to light: no trace active, empty motif, or the sweep sits at 0.
  const lit = Math.max(0, Math.min(count, progressIndex || 0));
  if (!count || lit <= 0) return null;

  return (
    <svg
      data-testid="trace-overlay"
      className="pointer-events-none absolute inset-0 text-saffron"
      width={canvasW}
      height={canvasH}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
      aria-hidden="true"
    >
      {positions.slice(0, lit).map((p, i) => {
        // Radius-aware, with a small floor so a tiny footprint is still visible;
        // capped so a huge proportional placement doesn't blanket the canvas.
        const r = Math.max(2.5, Math.min(p.radius ?? 0, Math.min(canvasW, canvasH) * 0.04));
        return (
          <circle
            key={i}
            data-trace-index={i}
            cx={p.x}
            cy={p.y}
            r={r}
            fill="currentColor"
            fillOpacity={0.18}
            stroke="currentColor"
            strokeOpacity={0.95}
            strokeWidth={Math.max(1, r * 0.28)}
          />
        );
      })}
    </svg>
  );
}

export default memo(TraceOverlay);
