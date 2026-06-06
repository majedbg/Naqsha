import { useId, useRef, useState } from "react";

/*
 * AngleDial — a circular drag knob for angular parameters. Single-key control:
 * reads `value`, writes `onChange(v)` (ParamControl maps the key, mirroring the
 * default Slider case).
 *
 * The swept angle from a 12 o'clock reference, clockwise, maps to the value.
 * One mapping convention is used everywhere — handle, arc endpoints, and the
 * detent tick all ride the same `valueToPoint`, so they can never disagree:
 *
 *   θ = value · π/180   (0° = top, 90° = 3 o'clock, 180° = bottom, clockwise)
 *   x = cx + r·sin(θ),  y = cy − r·cos(θ)
 *
 * Two modes (driven by `wrap`):
 *   wrap=true  (startAngle 0–360) — a full hairline ring. Pointer angle maps
 *              absolutely via atan2, so 359°→0° is continuous with no clamp or
 *              wrap-tracking state. Home → 0.
 *   wrap=false (phyllotaxis divergence 100–170) — clamped to [min,max] and
 *              drawn as an ARC of the live range, not a full circle.
 *
 * `detent` (phyllotaxis 137.508° "Golden"): a marked rim tick + a soft magnetic
 * snap within ±SNAP° on drag. The snap yields the EXACT detent value (so it
 * equals DEFAULT_PARAMS and reset-to-default keeps working) and is a value-
 * nudge, not a motion bounce (P4). Holding Alt bypasses it for fine control.
 *
 * Craft: hairline ring on paper, no shadow (P1). Ink-soft ticks. The handle is
 * a painted saffron cell when focused/active (P2). Center readout in tabular
 * figures with the degree glyph (P7). Keyboard mirrors Slider (P5):
 *   Arrow         — ±1 × step
 *   Shift + Arrow — ±10 × step (coarse)
 *   Home / End    — min / max  (Home → 0 when wrapping)
 * Visible violet focus-visible ring; reduced-motion safe via --motion-* vars.
 */
const SIZE = 104; // px — 4pt-aligned square viewport
const CX = 50;
const CY = 50;
const R = 38; // ring radius in the 0..100 viewBox
const HANDLE = 7; // handle radius in viewBox units
const SNAP = 1; // detent magnetic radius in degrees

// value (deg) -> point on the ring. Clockwise from 12 o'clock.
const valueToPoint = (deg) => {
  const t = (deg * Math.PI) / 180;
  return { x: CX + R * Math.sin(t), y: CY - R * Math.cos(t) };
};

export default function AngleDial({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  tooltip,
  wrap = false,
  detent,
  detentLabel,
}) {
  const autoId = useId();
  const groupId = `dial-${autoId}`;
  const dialRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const decimals = step < 1 ? String(step).split(".")[1]?.length || 1 : 0;
  const display = Number(value).toFixed(decimals);

  // Clamp + step-snap for keyboard and non-detented drag. Mirrors Slider so
  // values round-trip onto the grid for reset-to-default detection.
  const snapToStep = (v) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = Math.round(clamped / step) * step;
    const bounded = Math.max(min, Math.min(max, snapped));
    return parseFloat(bounded.toFixed(decimals));
  };

  // Convert a pointer position to a raw angle in degrees, clockwise from 12.
  const pointerToDeg = (clientX, clientY) => {
    const rect = dialRef.current.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * 100;
    const py = ((clientY - rect.top) / rect.height) * 100;
    // atan2(dx, -dy): 0 at top, increasing clockwise.
    const t = Math.atan2(px - CX, -(py - CY));
    return ((t * 180) / Math.PI + 360) % 360;
  };

  // Resolve a raw pointer angle to a committed value, honoring wrap / clamp and
  // the magnetic detent (drag-only; Alt bypasses).
  const resolveDrag = (rawDeg, altKey) => {
    if (wrap) {
      // Continuous: snap raw to the step grid in 0..360, no clamp.
      const snapped = Math.round(rawDeg / step) * step;
      return parseFloat((((snapped % 360) + 360) % 360).toFixed(decimals));
    }
    // Non-wrap: the dial only spans [min,max] of the clock; clamp the reading.
    const clamped = Math.max(min, Math.min(max, rawDeg));
    if (detent != null && !altKey && Math.abs(clamped - detent) <= SNAP) {
      return detent; // EXACT — keeps equality with DEFAULT_PARAMS.
    }
    return snapToStep(clamped);
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    dialRef.current?.focus();
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    onChange(resolveDrag(pointerToDeg(e.clientX, e.clientY), e.altKey));
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    onChange(resolveDrag(pointerToDeg(e.clientX, e.clientY), e.altKey));
  };

  const handlePointerUp = (e) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Keyboard mirrors Slider (no Alt-fine here — Alt is the detent bypass).
  const handleKeyDown = (e) => {
    const isLeft = e.key === "ArrowLeft" || e.key === "ArrowDown";
    const isRight = e.key === "ArrowRight" || e.key === "ArrowUp";
    if (!isLeft && !isRight && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();

    if (e.key === "Home") {
      onChange(wrap ? 0 : snapToStep(min));
      return;
    }
    if (e.key === "End") {
      onChange(snapToStep(max));
      return;
    }

    const delta = step * (e.shiftKey ? 10 : 1) * (isLeft ? -1 : 1);
    if (wrap) {
      const next = (((value + delta) % 360) + 360) % 360;
      onChange(parseFloat(next.toFixed(decimals)));
    } else {
      onChange(snapToStep(value + delta));
    }
  };

  // --- SVG geometry, all from the single valueToPoint convention ---
  const handlePt = valueToPoint(wrap ? ((value % 360) + 360) % 360 : value);

  // Non-wrap: draw the arc from min to max as an SVG path.
  let arcPath = null;
  if (!wrap) {
    const a = valueToPoint(min);
    const b = valueToPoint(max);
    const largeArc = max - min > 180 ? 1 : 0;
    // sweep=1 → clockwise, matching our clockwise value convention.
    arcPath = `M ${a.x} ${a.y} A ${R} ${R} 0 ${largeArc} 1 ${b.x} ${b.y}`;
  }

  // A short rim tick at the detent: from just inside the ring to just outside.
  const detentInner = detent != null ? pointAt(detent, R - 5) : null;
  const detentOuter = detent != null ? pointAt(detent, R + 3) : null;

  const valuetext =
    detent != null && value === detent
      ? `${display}°, ${detentLabel ?? "detent"}`
      : `${display}°`;

  return (
    <div className="flex flex-col gap-2xs">
      {/* Label row — mirrors Slider / Pad2D. */}
      <div className="group/tooltip relative flex items-center gap-2xs min-w-0">
        <span
          id={groupId}
          className="text-xs text-ink-soft truncate cursor-default"
        >
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
        <div
          ref={dialRef}
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
            "angle-dial relative shrink-0 rounded-cell",
            "cursor-grab touch-none select-none outline-none",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet focus-visible:outline-offset-2",
          ].join(" ")}
          style={{ width: SIZE, height: SIZE }}
          data-dragging={dragging || undefined}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            {/* Ring / arc — hairline. Full circle when wrapping, arc otherwise. */}
            {wrap ? (
              <circle
                cx={CX}
                cy={CY}
                r={R}
                fill="none"
                className="text-hairline"
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : (
              <path
                d={arcPath}
                fill="none"
                className="text-hairline"
                stroke="currentColor"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
              />
            )}

            {/* 12 o'clock reference tick (ink-soft) — only meaningful when the
                ring passes through the top (wrap mode). */}
            {wrap && (
              <line
                x1={CX}
                y1={CY - R - 3}
                x2={CX}
                y2={CY - R + 5}
                className="text-ink-soft"
                stroke="currentColor"
                strokeWidth="0.6"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Detent rim tick — the Golden angle marker. */}
            {detentInner && detentOuter && (
              <line
                x1={detentInner.x}
                y1={detentInner.y}
                x2={detentOuter.x}
                y2={detentOuter.y}
                className="text-saffron"
                stroke="currentColor"
                strokeWidth="1.2"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* Spoke from center to handle — ink-soft hairline. */}
            <line
              x1={CX}
              y1={CY}
              x2={handlePt.x}
              y2={handlePt.y}
              className="text-ink-soft"
              stroke="currentColor"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />

            {/* The painted handle cell on the rim. */}
            <circle
              className="angle-dial-handle"
              cx={handlePt.x}
              cy={handlePt.y}
              r={HANDLE}
            />
          </svg>

          {/* Center readout — tabular figures, degree glyph. */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs num text-ink">{display}°</span>
          </div>
        </div>

        {/* Side readout / detent label, mirroring Pad2D's adjacent readout. */}
        <div className="flex flex-col gap-2xs text-xs leading-tight">
          <span className="num text-ink-soft">
            <span className="text-ink">{display}</span>°
          </span>
          {detent != null && (
            <span
              className={[
                "inline-flex items-center gap-1",
                value === detent ? "text-saffron" : "text-ink-soft",
              ].join(" ")}
            >
              <span aria-hidden="true">◉</span>
              {detentLabel ?? "Detent"}
            </span>
          )}
        </div>
      </div>

      <style>{`
        .angle-dial-handle {
          fill: var(--ink);
          stroke: transparent;
          stroke-width: 1;
          transition:
            cx var(--motion-medium) var(--ease-out-quart),
            cy var(--motion-medium) var(--ease-out-quart),
            fill var(--motion-fast) var(--ease-out-quart),
            stroke var(--motion-fast) var(--ease-out-quart);
        }
        /* Focused / active: painted saffron cell with a violet hairline. */
        .angle-dial:focus-within .angle-dial-handle {
          fill: var(--saffron);
          stroke: var(--violet);
        }
        .angle-dial[data-dragging] {
          cursor: grabbing;
        }
        .angle-dial[data-dragging] .angle-dial-handle {
          fill: var(--saffron);
          stroke: var(--violet);
          /* Track the pointer 1:1 — no positional easing while dragging. */
          transition: fill var(--motion-fast) var(--ease-out-quart),
                      stroke var(--motion-fast) var(--ease-out-quart);
        }
        @media (prefers-reduced-motion: reduce) {
          .angle-dial-handle { transition: none; }
        }
      `}</style>
    </div>
  );
}

// Point on a circle of arbitrary radius at the given clockwise-from-12 angle.
function pointAt(deg, radius) {
  const t = (deg * Math.PI) / 180;
  return { x: CX + radius * Math.sin(t), y: CY - radius * Math.cos(t) };
}
