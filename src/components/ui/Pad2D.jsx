import { useId, useRef, useState } from "react";

/*
 * Pad2D — a composite control collapsing offsetX + offsetY into one draggable
 * nub inside a framed square. Replaces the two Offset sliders.
 *
 * It is a composite def ({ type:'pad2d', keys:['offsetX','offsetY'] }): it
 * reads BOTH params and writes BOTH on every change via the composite patch
 * `onChange({ ...params, [keyX]: x, [keyY]: y })`. ParamControl passes
 * `def / params / onChange` straight through.
 *
 * Screen-Y convention: screen-down = +offsetY (the value "shifts the pattern
 * down"). The nub's vertical position increases with offsetY, ArrowDown
 * increases offsetY, ArrowUp decreases it. X is the natural screen-right = +X.
 * Center of the pad = (0, 0).
 *
 * Craft: hairline frame on paper, faint 4pt graticule, NO shadow (P1/P3). The
 * nub is a painted saffron cell when focused/active (P2). Numeric readout uses
 * tabular figures with the real minus glyph (P7). Keyboard mirrors Slider's
 * sophistication, split across two axes (P5):
 *   Arrow           — 1 × step on its axis (Left/Right = X, Up/Down = Y)
 *   Shift + Arrow   — 10 × step (coarse)
 *   Home            — recenter to (0, 0)
 * Visible violet focus-visible ring; saffron active/selected fill.
 */
const PAD_SIZE = 104; // px — 4pt-aligned square
const NUB = 12; // px — painted nub cell

export default function Pad2D({ def, params, onChange }) {
  const { keys, min, max, step = 1, label = "Offset", tooltip } = def;
  const [kx, ky] = keys;
  const autoId = useId();
  const groupId = `pad2d-${autoId}`;
  const padRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const x = params[kx] ?? 0;
  const y = params[ky] ?? 0;

  const decimals = step < 1 ? String(step).split(".")[1]?.length || 1 : 0;

  // Snap a value to the step grid and clamp to [min, max]. Mirrors Slider so
  // center round-trips to exactly 0 (reset-to-default detection rides on this).
  const snap = (v) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = Math.round(clamped / step) * step;
    const bounded = Math.max(min, Math.min(max, snapped));
    return parseFloat(bounded.toFixed(decimals));
  };

  const commit = (nx, ny) => {
    onChange({ ...params, [kx]: snap(nx), [ky]: snap(ny) });
  };

  // Map value -> 0..1 position fraction. Value `min` -> 0, `max` -> 1.
  const fracX = (x - min) / (max - min);
  const fracY = (y - min) / (max - min); // screen-down = +offsetY: larger y -> lower

  // Convert a pointer position within the pad to (x, y) values.
  const pointerToValue = (clientX, clientY) => {
    const rect = padRef.current.getBoundingClientRect();
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const cfx = Math.max(0, Math.min(1, fx));
    const cfy = Math.max(0, Math.min(1, fy));
    return {
      nx: min + cfx * (max - min),
      ny: min + cfy * (max - min),
    };
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    padRef.current?.focus();
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { nx, ny } = pointerToValue(e.clientX, e.clientY);
    commit(nx, ny);
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    const { nx, ny } = pointerToValue(e.clientX, e.clientY);
    commit(nx, ny);
  };

  const handlePointerUp = (e) => {
    if (!dragging) return;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const handleKeyDown = (e) => {
    const mult = e.shiftKey ? 10 : 1;
    const d = step * mult;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        commit(x - d, y);
        break;
      case "ArrowRight":
        e.preventDefault();
        commit(x + d, y);
        break;
      case "ArrowUp":
        e.preventDefault();
        commit(x, y - d);
        break;
      case "ArrowDown":
        e.preventDefault();
        commit(x, y + d);
        break;
      case "Home":
        e.preventDefault();
        commit(0, 0);
        break;
      default:
        break;
    }
  };

  // Format with explicit sign and the real minus glyph for the readout.
  const fmt = (v) => {
    const n = Number(v);
    const sign = n > 0 ? "+" : n < 0 ? "−" : " ";
    return `${sign}${Math.abs(n).toFixed(decimals)}`;
  };

  return (
    <div className="flex flex-col gap-2xs">
      {/* Label row — mirrors Slider / IconSelect. */}
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
        {/* The pad — hairline frame on paper, no shadow. */}
        <div
          ref={padRef}
          tabIndex={0}
          role="slider"
          aria-labelledby={groupId}
          aria-label={label}
          aria-valuetext={`x: ${fmt(x)}, y: ${fmt(y)}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
          className={[
            "pad2d relative shrink-0 rounded-cell border border-hairline bg-paper",
            "cursor-crosshair touch-none select-none",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet focus-visible:outline-offset-2",
          ].join(" ")}
          style={{ width: PAD_SIZE, height: PAD_SIZE }}
          data-dragging={dragging || undefined}
        >
          {/* Graticule — center crosshair + faint quarter lines (4pt substrate). */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none text-ink-soft"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* Quarter graticule */}
            <line x1="25" y1="0" x2="25" y2="100" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
            <line x1="75" y1="0" x2="75" y2="100" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" strokeWidth="0.3" opacity="0.25" vectorEffect="non-scaling-stroke" />
            {/* Center crosshair — the origin (0,0) */}
            <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="0.5" opacity="0.45" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.5" opacity="0.45" vectorEffect="non-scaling-stroke" />
          </svg>

          {/* The painted nub. */}
          <div
            className="pad2d-nub absolute rounded-cell pointer-events-none"
            style={{
              width: NUB,
              height: NUB,
              left: `${fracX * 100}%`,
              top: `${fracY * 100}%`,
            }}
            aria-hidden="true"
          />
        </div>

        {/* Numeric readout — tabular figures, real minus. */}
        <div className="flex flex-col gap-2xs text-xs num leading-tight">
          <span className="text-ink-soft">
            x <span className="text-ink">{fmt(x)}</span>
          </span>
          <span className="text-ink-soft">
            y <span className="text-ink">{fmt(y)}</span>
          </span>
        </div>
      </div>

      <style>{`
        .pad2d-nub {
          transform: translate(-50%, -50%);
          background: var(--ink);
          border: 1px solid transparent;
          transition:
            left var(--motion-medium) var(--ease-out-quart),
            top var(--motion-medium) var(--ease-out-quart),
            background var(--motion-fast) var(--ease-out-quart),
            border-color var(--motion-fast) var(--ease-out-quart);
        }
        /* Focused / active: painted saffron cell with a violet hairline. */
        .pad2d:focus-within .pad2d-nub {
          background: var(--saffron);
          border-color: var(--violet);
        }
        .pad2d[data-dragging] .pad2d-nub {
          background: var(--saffron);
          border-color: var(--violet);
          /* No easing while dragging — the nub tracks the pointer 1:1. */
          transition: background var(--motion-fast) var(--ease-out-quart),
                      border-color var(--motion-fast) var(--ease-out-quart);
        }
        @media (prefers-reduced-motion: reduce) {
          .pad2d-nub { transition: none; }
        }
      `}</style>
    </div>
  );
}
