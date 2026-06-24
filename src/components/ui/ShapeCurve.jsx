import { useId, useRef, useState } from "react";
import { shapeEase } from "../../lib/fields/modulation";

/*
 * ShapeCurve — a generic single-scalar curve input, sibling to CurveEditor but
 * NOT tied to the recursive engine. It plots the LIVE response curve that
 * `shapeEase(x, shape)` produces over x ∈ [-1, 1] and lets you drag vertically
 * to set the `shape` scalar in [-1, 1]. There are NO editable control points:
 * the plotted curve is an honest readout of the scalar; dragging changes the
 * scalar, which redraws the curve.
 *
 * Used by the Modulator device panel (Inspector) as its Shape control. The
 * interaction shell (snap / pointer drag / keyboard / aria role="slider") is
 * mirrored from CurveEditor.jsx so it feels identical; only the curve-building
 * block differs — it samples shapeEase directly rather than the recursion.
 *
 * shape = 0  → shapeEase is the identity → the plotted curve is the diagonal.
 * shape > 0  → eases in (slow start); shape < 0 → eases out (fast start).
 *
 * Craft mirrors CurveEditor: hairline frame on paper, faint graticule, no
 * shadow; ink at rest, saffron painted accent when focused/dragging; reduced-
 * motion safe via --motion-* vars. Keyboard mirrors Slider:
 *   Arrow         — ±1 × step
 *   Shift + Arrow — ±10 × step (coarse)
 *   Home / End    — min / max
 */
const SIZE = 104; // px — 4pt-aligned square viewport
const PLOT = 100; // viewBox units (square)
const SAMPLES = 33; // x samples across [-1, 1] for the plotted polyline

export default function ShapeCurve({
  label = "Shape",
  value,
  min = -1,
  max = 1,
  step = 0.05,
  onChange,
  tooltip,
}) {
  const autoId = useId();
  const groupId = `shape-${autoId}`;
  const panelRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const decimals = step < 1 ? String(step).split(".")[1]?.length || 1 : 0;

  // Snap a value to the step grid and clamp to [min, max]. Mirrors Slider /
  // CurveEditor so the value round-trips onto the grid (0 stays exactly 0).
  const snap = (v) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = Math.round(clamped / step) * step;
    const bounded = Math.max(min, Math.min(max, snapped));
    return parseFloat(bounded.toFixed(decimals));
  };

  // Vertical drag sets the value: top of panel = max (+1), bottom = min (-1).
  const pointerToValue = (clientY) => {
    const rect = panelRef.current.getBoundingClientRect();
    const fy = (clientY - rect.top) / rect.height;
    const cfy = Math.max(0, Math.min(1, fy));
    return min + (1 - cfy) * (max - min);
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    panelRef.current?.focus();
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onChange(snap(pointerToValue(e.clientY)));
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    onChange(snap(pointerToValue(e.clientY)));
  };

  const handlePointerUp = (e) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Keyboard mirrors Slider (P5).
  const handleKeyDown = (e) => {
    const isDown = e.key === "ArrowLeft" || e.key === "ArrowDown";
    const isUp = e.key === "ArrowRight" || e.key === "ArrowUp";
    if (!isDown && !isUp && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    if (e.key === "Home") return onChange(snap(min));
    if (e.key === "End") return onChange(snap(max));
    const delta = step * (e.shiftKey ? 10 : 1) * (isUp ? 1 : -1);
    onChange(snap(value + delta));
  };

  // --- Build the honest response polyline from shapeEase over x ∈ [-1, 1] ---
  // Sample x across [-1, 1]; y = shapeEase(x, value), also in [-1, 1]. Map both
  // to viewBox coords: x → width, y → height with +1 at top, -1 at bottom.
  const PAD = 6; // inner margin in viewBox units so the line never kisses frame
  const usable = PLOT - PAD * 2;
  // Domain [-1,1] → [0,1] fraction.
  const xAt = (x) => PAD + ((x + 1) / 2) * usable;
  // Range [-1,1] → top..bottom (y=+1 at top).
  const yAt = (y) => PAD + (1 - (Math.max(-1, Math.min(1, y)) + 1) / 2) * usable;
  const pts = [];
  for (let i = 0; i < SAMPLES; i++) {
    const x = -1 + (2 * i) / (SAMPLES - 1);
    pts.push({ x, y: shapeEase(x, value) });
  }
  const polyline = pts
    .map((p) => `${xAt(p.x).toFixed(2)},${yAt(p.y).toFixed(2)}`)
    .join(" ");

  // Display value with explicit sign and the real minus glyph (P7).
  const display = (() => {
    const n = Number(value);
    const sign = n > 0 ? "+" : n < 0 ? "−" : " ";
    return `${sign}${Math.abs(n).toFixed(decimals)}`;
  })();

  const bend =
    value > 0 ? "ease in (slow start)" : value < 0 ? "ease out (fast start)" : "linear";
  const valuetext = `${display}, ${bend}`;

  return (
    <div className="flex flex-col gap-2xs">
      {/* Label row — mirrors Slider / CurveEditor. */}
      <div className="group/tooltip relative flex items-center gap-2xs min-w-0">
        <span id={groupId} className="text-xs text-ink-soft truncate cursor-default">
          {label}
        </span>
        {tooltip && (
          <>
            <span
              aria-hidden="true"
              className="inline-flex items-center justify-center w-3 h-3 text-[10px] text-ink-soft/70 cursor-help"
            >
              ?
            </span>
            <div
              role="tooltip"
              className="absolute bottom-full left-0 mb-1.5 hidden group-hover/tooltip:block z-50 px-xs py-2xs text-xs text-ink bg-paper border border-hairline rounded-sm whitespace-nowrap max-w-[240px]"
            >
              {tooltip}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-sm">
        {/* The panel — hairline frame on paper, no shadow. */}
        <div
          ref={panelRef}
          tabIndex={0}
          role="slider"
          aria-labelledby={groupId}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={valuetext}
          data-testid="shape-curve"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className={[
            "shape-curve relative shrink-0 rounded-cell border border-hairline bg-paper",
            "cursor-ns-resize touch-none select-none",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet focus-visible:outline-offset-2",
          ].join(" ")}
          style={{ width: SIZE, height: SIZE }}
          data-dragging={dragging || undefined}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Graticule — faint quarter lines (4pt substrate, P3). */}
            <g className="text-ink-soft">
              <line x1="25" y1="0" x2="25" y2="100" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
              <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
              <line x1="75" y1="0" x2="75" y2="100" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
              <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
            </g>

            {/* The honest response curve. Ink at rest, saffron when active. */}
            <polyline
              className="shape-curve-line"
              points={polyline}
              fill="none"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        {/* Numeric readout — tabular figures, real minus (P7). */}
        <div className="flex flex-col gap-2xs text-xs num leading-tight">
          <span className="text-ink-soft">
            <span className="text-ink">{display}</span>
          </span>
          <span className="text-ink-soft text-[10px]">{bend}</span>
        </div>
      </div>

      <style>{`
        .shape-curve-line {
          stroke: var(--ink);
          transition: stroke var(--motion-fast) var(--ease-out-quart);
        }
        /* Focused / active / dragging: saffron painted accent (P2). */
        .shape-curve:focus-within .shape-curve-line,
        .shape-curve[data-dragging] .shape-curve-line {
          stroke: var(--saffron);
        }
        @media (prefers-reduced-motion: reduce) {
          .shape-curve-line { transition: none; }
        }
      `}</style>
    </div>
  );
}
