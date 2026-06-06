import { useId, useRef, useState } from "react";

/*
 * CurveEditor — a small framed panel that plots the LIVE falloff curve the
 * recursive pattern's `scaleNonLinearity` scalar produces, and lets you drag
 * vertically to set that one value in [-1, 1]. It is a SINGLE-SCALAR input,
 * NOT a multi-point curve editor: there are NO editable control points. The
 * plotted curve is a faithful *readout* of the scalar; dragging changes the
 * scalar, which redraws the curve.
 *
 * It reads `value` (= scaleNonLinearity) and writes a one-key patch via
 * onChange (ParamControl maps the key). It ALSO reads the sibling params
 * `scaleFactor` and `depth` (passed straight through, mirroring Pad2D's
 * params pass-through) because the engine's bend depends on both — the curve
 * cannot be honest from the scalar alone.
 *
 * --- HONEST PREVIEW: mirrors RecursiveGeometry.js exactly ---
 * The engine builds the main recursive spine (RecursiveGeometry.js:94-99):
 *   recurse(level=clampedDepth, radius=startRadius); each step does
 *   radius *= getEffectiveScale(level); recurse(level-1) ... down to level 0.
 * with (RecursiveGeometry.js:58-63):
 *   clampedDepth = Math.max(1, Math.min(8, depth))            // line 31
 *   getEffectiveScale(level):
 *     if (scaleNonLinearity === 0 || clampedDepth <= 1) return scaleFactor;
 *     progress = 1 - level / clampedDepth;
 *     eased = Math.pow(scaleFactor, 1 + scaleNonLinearity * progress * 2);
 *     return Math.max(0.1, Math.min(0.98, eased));
 * We replicate getEffectiveScale verbatim and plot the NORMALIZED cumulative
 * radius (radius / startRadius) at each recursion step 0..clampedDepth — i.e.
 * the actual relative size the spine reaches at each nested level. This is
 * EXACT, not approximate. Note: the engine clamps depth at 8 for this math
 * (param max is 12), so levels 9-12 look identical to 8 — faithful to engine.
 *
 * Craft: hairline frame on paper, faint graticule, NO shadow (P1/P3). The
 * curve line at rest = ink; active/focused/dragging = saffron painted accent
 * (P2, the single load-bearing accent). Numeric readout in tabular figures
 * with the real minus glyph (P7). Keyboard mirrors Slider (P5):
 *   Arrow         — ±1 × step
 *   Shift + Arrow — ±10 × step (coarse)
 *   Home / End    — min / max
 * Visible violet focus-visible ring; reduced-motion safe via --motion-* vars.
 */
const SIZE = 104; // px — 4pt-aligned square viewport
const PLOT = 100; // viewBox units (square)

// Verbatim mirror of RecursiveGeometry.js getEffectiveScale (lines 58-63).
const effectiveScale = (level, scaleFactor, scaleNonLinearity, clampedDepth) => {
  if (scaleNonLinearity === 0 || clampedDepth <= 1) return scaleFactor;
  const progress = 1 - level / clampedDepth;
  const eased = Math.pow(scaleFactor, 1 + scaleNonLinearity * progress * 2);
  return Math.max(0.1, Math.min(0.98, eased));
};

export default function CurveEditor({
  label,
  value,
  min,
  max,
  step = 0.05,
  onChange,
  tooltip,
  scaleFactor = 0.7,
  depth = 5,
}) {
  const autoId = useId();
  const groupId = `curve-${autoId}`;
  const panelRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const decimals = step < 1 ? String(step).split(".")[1]?.length || 1 : 0;

  // Snap a value to the step grid and clamp to [min, max]. Mirrors Slider so
  // the value round-trips onto the grid (reset-to-default detection rides on
  // this — 0 stays exactly 0).
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

  // --- Build the honest falloff polyline from the engine recurrence ---
  // clampedDepth mirrors RecursiveGeometry.js line 31.
  const clampedDepth = Math.max(1, Math.min(8, Math.round(depth)));
  // Cumulative normalized radius along the main spine: start at 1 (= startRadius),
  // then radius *= effectiveScale(level) for level = clampedDepth .. 1.
  const pts = [{ step: 0, r: 1 }];
  let r = 1;
  for (let i = 0; i < clampedDepth; i++) {
    const level = clampedDepth - i;
    r *= effectiveScale(level, scaleFactor, value, clampedDepth);
    pts.push({ step: i + 1, r });
  }

  // Map (step index, normalized radius) -> viewBox coords. x spreads steps
  // across the width; y: r=1 at top, r=0 at bottom (radius shrinks downward).
  const PAD = 6; // inner margin in viewBox units so the line never kisses frame
  const usable = PLOT - PAD * 2;
  const xAt = (i) => PAD + (clampedDepth <= 1 ? usable / 2 : (i / clampedDepth) * usable);
  const yAt = (rr) => PAD + (1 - Math.max(0, Math.min(1, rr))) * usable;
  const polyline = pts.map((p) => `${xAt(p.step).toFixed(2)},${yAt(p.r).toFixed(2)}`).join(" ");

  // Display value with explicit sign and the real minus glyph (P7).
  const display = (() => {
    const n = Number(value);
    const sign = n > 0 ? "+" : n < 0 ? "−" : " ";
    return `${sign}${Math.abs(n).toFixed(decimals)}`;
  })();

  const bend =
    value > 0 ? "faster start, slower end" : value < 0 ? "slower start, faster end" : "geometric";
  const valuetext = `${display}, ${bend}`;

  return (
    <div className="flex flex-col gap-2xs">
      {/* Label row — mirrors Slider / Pad2D / AngleDial. */}
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
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className={[
            "curve-editor relative shrink-0 rounded-cell border border-hairline bg-paper",
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

            {/* The honest falloff curve. Ink at rest, saffron when active. */}
            <polyline
              className="curve-editor-line"
              points={polyline}
              fill="none"
              strokeWidth="1.6"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Sample dots at each recursion level — ink-soft, ride the curve. */}
            {pts.map((p) => (
              <circle
                key={p.step}
                className="curve-editor-dot"
                cx={xAt(p.step)}
                cy={yAt(p.r)}
                r="1.4"
                vectorEffect="non-scaling-stroke"
              />
            ))}
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
        .curve-editor-line {
          stroke: var(--ink);
          transition: stroke var(--motion-fast) var(--ease-out-quart);
        }
        .curve-editor-dot {
          fill: var(--ink-soft);
          transition: fill var(--motion-fast) var(--ease-out-quart);
        }
        /* Focused / active / dragging: saffron painted accent (P2). */
        .curve-editor:focus-within .curve-editor-line,
        .curve-editor[data-dragging] .curve-editor-line {
          stroke: var(--saffron);
        }
        .curve-editor:focus-within .curve-editor-dot,
        .curve-editor[data-dragging] .curve-editor-dot {
          fill: var(--saffron);
        }
        @media (prefers-reduced-motion: reduce) {
          .curve-editor-line, .curve-editor-dot { transition: none; }
        }
      `}</style>
    </div>
  );
}
