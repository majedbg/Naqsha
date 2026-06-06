import { useId, useRef, useState } from "react";

/*
 * ParamPlot — a composite control that plots TWO independently-ranged named
 * params on one labeled plane. Spirograph's Outer Radius (R) and Inner Radius
 * (r) collapse from two sliders into a single marker you drag across a sheet of
 * graph paper.
 *
 * Sibling to Pad2D (the offset joystick), and deliberately NOT the same control:
 *   - Pad2D maps a SPATIAL offset — both axes share one symmetric range, the
 *     centre is the origin (0,0), and screen-DOWN is +Y (the pattern shifts
 *     down). "x"/"y" labels suffice because the directions are self-evident.
 *   - ParamPlot maps two ABSTRACT scalars with DIFFERENT ranges and no origin.
 *     Nothing about position is self-evident, so every axis is named and its
 *     endpoints are printed. Screen-UP = larger, the Cartesian plot convention
 *     a "graph" implies. The labelled endpoints are load-bearing, not decor:
 *     they are what disambiguates up-is-more from Pad2D's down-is-more.
 *
 * Composite def: { type:'plot2d', keys:['R','r'], axes:[axX, axY] } where each
 * axis is { key, label, min, max, step, default }. It reads/writes both keys via
 * the composite patch onChange({ ...params, [kx]:x, [ky]:y }). The synthetic
 * primary key ('radii') drives grouping/gating/reset/randomize upstream.
 *
 * Craft (Naqsha): hairline frame on paper, faint graticule like ruled graph
 * paper, NO shadow. The marker is a painted saffron cell with a violet hairline
 * when focused/active. Readout fields are editable for exact entry (a 1200-wide
 * axis wants typed values, not arrow-stepping) and use tabular figures. Keyboard
 * mirrors Slider's sophistication, split across two named axes:
 *   ← / →           — 1 × step on the horizontal (Outer) axis
 *   ↑ / ↓           — 1 × step on the vertical (Inner) axis, up = larger
 *   Shift + arrow   — 10 × step (coarse)
 *   Home            — return both axes to their defaults
 */
const PLOT_SIZE = 104; // px — 4pt-aligned square, matches Pad2D
const MARK = 12; // px — painted marker cell

export default function ParamPlot({ def, params, onChange }) {
  const { keys, axes, label = "Radii", tooltip } = def;
  const [axX, axY] = axes;
  const [kx, ky] = keys;
  const autoId = useId();
  const groupId = `plot2d-${autoId}`;
  const plotRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const x = params[kx] ?? axX.default ?? axX.min;
  const y = params[ky] ?? axY.default ?? axY.min;

  const decimalsOf = (step) =>
    step < 1 ? String(step).split(".")[1]?.length || 1 : 0;

  // Snap to the axis step grid and clamp to [min, max].
  const snapAxis = (ax, v) => {
    const clamped = Math.max(ax.min, Math.min(ax.max, v));
    const snapped = Math.round(clamped / ax.step) * ax.step;
    const bounded = Math.max(ax.min, Math.min(ax.max, snapped));
    return parseFloat(bounded.toFixed(decimalsOf(ax.step)));
  };

  const commit = (nx, ny) => {
    onChange({ ...params, [kx]: snapAxis(axX, nx), [ky]: snapAxis(axY, ny) });
  };

  // Value -> 0..1 fraction along its axis.
  const fracX = (x - axX.min) / (axX.max - axX.min);
  const fracY = (y - axY.min) / (axY.max - axY.min);
  // Screen position: X right = larger; Y UP = larger, so invert for CSS top.
  const leftPct = fracX * 100;
  const topPct = (1 - fracY) * 100;

  const pointerToValue = (clientX, clientY) => {
    const rect = plotRef.current.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const fyDown = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const fy = 1 - fyDown; // invert: top of plot = max
    return {
      nx: axX.min + fx * (axX.max - axX.min),
      ny: axY.min + fy * (axY.max - axY.min),
    };
  };

  const handlePointerDown = (e) => {
    e.preventDefault();
    plotRef.current?.focus();
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
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        commit(x - axX.step * mult, y);
        break;
      case "ArrowRight":
        e.preventDefault();
        commit(x + axX.step * mult, y);
        break;
      case "ArrowUp":
        e.preventDefault();
        commit(x, y + axY.step * mult); // up = larger
        break;
      case "ArrowDown":
        e.preventDefault();
        commit(x, y - axY.step * mult);
        break;
      case "Home":
        e.preventDefault();
        commit(axX.default ?? axX.min, axY.default ?? axY.min);
        break;
      default:
        break;
    }
  };

  // Editable readout: snap+commit one axis, leave the other untouched.
  const setAxis = (ax, raw) => {
    const v = parseFloat(raw);
    if (Number.isNaN(v)) return;
    if (ax.key === kx) commit(v, y);
    else commit(x, v);
  };

  const fmt = (ax, v) => Number(v).toFixed(decimalsOf(ax.step));

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
              className="absolute bottom-full left-0 mb-1.5 hidden group-hover/tooltip:block z-50 px-xs py-2xs text-xs text-ink bg-paper border border-hairline rounded-sm whitespace-normal w-[240px] leading-snug"
            >
              {tooltip}
            </div>
          </>
        )}
      </div>

      <div className="flex items-start gap-sm">
        {/* Y-axis gutter: max on top, rotated name, min on bottom. Reads
            bottom-to-top, so the printed endpoints anchor up = larger. */}
        <div
          className="flex flex-col items-end justify-between shrink-0 text-[10px] num text-ink-soft select-none"
          style={{ height: PLOT_SIZE }}
          aria-hidden="true"
        >
          <span>{fmt(axY, axY.max)}</span>
          <span className="plot2d-yaxis text-ink-soft/90 tracking-tight">
            {axY.label}
          </span>
          <span>{fmt(axY, axY.min)}</span>
        </div>

        {/* Plot column: the sheet + its X-axis caption underneath. */}
        <div className="flex flex-col gap-2xs shrink-0" style={{ width: PLOT_SIZE }}>
          <div
            ref={plotRef}
            tabIndex={0}
            role="slider"
            aria-labelledby={groupId}
            aria-label={label}
            aria-valuetext={`${axX.label}: ${fmt(axX, x)}, ${axY.label}: ${fmt(axY, y)}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
            className={[
              "plot2d relative rounded-cell border border-hairline bg-paper",
              "cursor-crosshair touch-none select-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet focus-visible:outline-offset-2",
            ].join(" ")}
            style={{ width: PLOT_SIZE, height: PLOT_SIZE }}
            data-dragging={dragging || undefined}
          >
            {/* Graph-paper graticule — even ruling, no privileged origin. */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none text-ink-soft"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {[20, 40, 60, 80].map((p) => (
                <line key={`v${p}`} x1={p} y1="0" x2={p} y2="100" stroke="currentColor" strokeWidth="0.3" opacity="0.18" vectorEffect="non-scaling-stroke" />
              ))}
              {[20, 40, 60, 80].map((p) => (
                <line key={`h${p}`} x1="0" y1={p} x2="100" y2={p} stroke="currentColor" strokeWidth="0.3" opacity="0.18" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>

            {/* Marker. */}
            <div
              className="plot2d-mark absolute rounded-cell pointer-events-none"
              style={{
                width: MARK,
                height: MARK,
                left: `${leftPct}%`,
                top: `${topPct}%`,
              }}
              aria-hidden="true"
            />
          </div>

          {/* X-axis caption: min · name · max, directly under the sheet. */}
          <div
            className="flex items-baseline justify-between text-[10px] num text-ink-soft select-none"
            aria-hidden="true"
          >
            <span>{fmt(axX, axX.min)}</span>
            <span className="text-ink-soft/90 tracking-tight">{axX.label}</span>
            <span>{fmt(axX, axX.max)}</span>
          </div>
        </div>

        {/* Editable readout — names each axis explicitly and accepts exact
            values. This is the unambiguous "what is each axis" answer. */}
        <div className="flex flex-col gap-xs min-w-0">
          {[axX, axY].map((ax) => {
            const val = ax.key === kx ? x : y;
            return (
              <label key={ax.key} className="flex flex-col gap-px min-w-0">
                <span className="text-[10px] text-ink-soft truncate">
                  {ax.short || ax.label}
                </span>
                <input
                  type="number"
                  value={val}
                  min={ax.min}
                  max={ax.max}
                  step={ax.step}
                  onChange={(e) => setAxis(ax, e.target.value)}
                  className="w-[4.5rem] num text-xs text-ink bg-paper px-xs py-px rounded-sm border border-hairline outline-none focus:border-violet"
                />
              </label>
            );
          })}
        </div>
      </div>

      <style>{`
        .plot2d-yaxis {
          writing-mode: vertical-rl;
          transform: rotate(180deg);
        }
        .plot2d-mark {
          transform: translate(-50%, -50%);
          background: var(--ink);
          border: 1px solid transparent;
          transition:
            left var(--motion-medium) var(--ease-out-quart),
            top var(--motion-medium) var(--ease-out-quart),
            background var(--motion-fast) var(--ease-out-quart),
            border-color var(--motion-fast) var(--ease-out-quart);
        }
        .plot2d:focus-within .plot2d-mark {
          background: var(--saffron);
          border-color: var(--violet);
        }
        .plot2d[data-dragging] .plot2d-mark {
          background: var(--saffron);
          border-color: var(--violet);
          transition: background var(--motion-fast) var(--ease-out-quart),
                      border-color var(--motion-fast) var(--ease-out-quart);
        }
        @media (prefers-reduced-motion: reduce) {
          .plot2d-mark { transition: none; }
        }
      `}</style>
    </div>
  );
}
