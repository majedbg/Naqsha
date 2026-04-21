import { useId, useRef, useState } from 'react';

/*
 * Slider — the primitive numeric input for Naqsha.
 *
 * The thumb is a painted cell that rotates into a diamond when the user's
 * hand is on it. At rest, an axis-aligned square on a hairline track. On
 * hover or focus, the cell rotates 0° → 45° and a faint graticule fades in
 * along the track. On active drag the diamond fills with saffron and a
 * short run of grid ticks near the thumb brightens. Release, and the cell
 * settles back to a square — the decision committed to the grid.
 *
 * The native <input type="range"> handles keyboard, pointer, and screen
 * reader semantics. The visible thumb and track are rendered separately,
 * synchronized to `value` via CSS custom properties so we can animate the
 * thumb's transform (which doesn't work reliably on ::-webkit-slider-thumb).
 *
 * Keyboard map (implemented here, not delegated to the native input):
 *   Arrow           — 1 × step
 *   Shift + Arrow   — 10 × step (motif-scale coarse jump)
 *   Option + Arrow  — 0.1 × step (sub-cell fine adjust)
 *   Home / End      — min / max
 */
export default function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  tooltip,
  disabled = false,
  id: providedId,
}) {
  const autoId = useId();
  const id = providedId ?? `slider-${autoId}`;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const valueRef = useRef(null);

  const decimals =
    step < 1 ? String(step).split('.')[1]?.length || 1 : 0;
  const displayValue = Number(value).toFixed(decimals);
  const percent = ((value - min) / (max - min)) * 100;

  const snapToStep = (v, useStep = step) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = Math.round(clamped / useStep) * useStep;
    // Re-clamp post-rounding in case rounding pushed us out of bounds.
    const bounded = Math.max(min, Math.min(max, snapped));
    return parseFloat(bounded.toFixed(decimals));
  };

  const startEditing = () => {
    if (disabled) return;
    setEditValue(displayValue);
    setEditing(true);
    requestAnimationFrame(() => valueRef.current?.select());
  };

  const commitEdit = () => {
    setEditing(false);
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) onChange(snapToStep(parsed));
  };

  /**
   * Keyboard modifiers expand the step size — Shift for coarse
   * (motif-scale), Option for fine (sub-cell). Without modifiers the slider
   * walks cell-by-cell. Home and End jump to the range edges.
   */
  const handleKeyDown = (e) => {
    if (disabled || editing) return;
    const isLeft = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
    const isRight = e.key === 'ArrowRight' || e.key === 'ArrowUp';
    if (!isLeft && !isRight && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();

    if (e.key === 'Home') {
      onChange(snapToStep(min));
      return;
    }
    if (e.key === 'End') {
      onChange(snapToStep(max));
      return;
    }

    // Modifier stacking: Shift = ×10, Alt/Option = ÷10. If both, they
    // cancel, leaving the baseline step.
    let multiplier = 1;
    if (e.shiftKey) multiplier *= 10;
    if (e.altKey) multiplier *= 0.1;
    const delta = step * multiplier * (isLeft ? -1 : 1);
    onChange(snapToStep(value + delta, Math.min(step, Math.abs(delta)) || step));
  };

  return (
    <div
      className="slider-root flex flex-col gap-2xs"
      data-disabled={disabled || undefined}
      style={{ '--slider-percent': `${percent}%` }}
    >
      {/* Label row — left label + right value readout. */}
      <div className="flex items-center justify-between gap-sm">
        <div className="group/tooltip relative flex items-center gap-2xs min-w-0">
          <label
            htmlFor={id}
            className="text-xs text-ink-soft truncate cursor-default"
          >
            {label}
          </label>
          {tooltip && (
            <>
              <span
                aria-hidden="true"
                className="
                  inline-flex items-center justify-center
                  w-3 h-3 text-[10px] text-ink-soft/70
                  cursor-help
                "
              >
                ?
              </span>
              <div
                role="tooltip"
                className="
                  absolute bottom-full left-0 mb-1.5
                  hidden group-hover/tooltip:block
                  z-50
                  px-xs py-2xs
                  text-xs text-ink bg-paper border border-hairline
                  rounded-sm
                  whitespace-nowrap max-w-[240px]
                "
              >
                {tooltip}
              </div>
            </>
          )}
        </div>

        {editing ? (
          <input
            ref={valueRef}
            type="number"
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            className="
              text-xs text-saffron num
              w-16 text-right
              bg-paper-warm border border-violet rounded-xs
              px-1.5 py-0 outline-none
              [appearance:textfield]
              [&::-webkit-inner-spin-button]:appearance-none
              [&::-webkit-outer-spin-button]:appearance-none
            "
            value={editValue}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
            autoFocus
          />
        ) : (
          <button
            type="button"
            className="
              slider-value
              text-xs text-ink num
              w-16 text-right cursor-text
              px-1.5 py-0 rounded-xs
              transition-colors duration-fast ease-out-quart
              hover:bg-paper-warm
              focus-visible:outline focus-visible:outline-1
              focus-visible:outline-violet focus-visible:outline-offset-1
              disabled:cursor-not-allowed disabled:text-ink-soft
            "
            onClick={startEditing}
            disabled={disabled}
            title="Click to type a value"
            aria-label={`${label}: ${displayValue}, click to edit`}
          >
            {displayValue}
          </button>
        )}
      </div>

      {/* Track region — visual layers rendered first (all pointer-events:
          none), then the native input LAST so it unambiguously captures
          every pointer event. The native thumb is styled generous-and-
          invisible so clicks anywhere near the painted cell start a drag. */}
      <div className="slider-track-region relative h-[22px] flex items-center">
        {/* Graticule — 9 ticks marking 8 even subdivisions of the range.
            Fades in on hover / focus. */}
        <svg
          className="slider-graticule absolute inset-x-0 top-1/2 -translate-y-1/2 h-2.5 pointer-events-none"
          viewBox="0 0 100 10"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={i}
              x1={i * 12.5}
              y1="0"
              x2={i * 12.5}
              y2="10"
              stroke="currentColor"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Visual track — a hairline line that thickens on hover. */}
        <div
          className="slider-track absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />

        {/* The painted cell. Square at rest. Diamond when the hand is on it.
            pointer-events:none (applied below) — purely visual; the native
            input beneath handles all interaction. */}
        <div
          className="slider-thumb"
          style={{ left: `var(--slider-percent)` }}
          aria-hidden="true"
        />

        {/* Native input — LAST in DOM so it sits above the visuals and
            captures every pointer event. Opacity-0 but fully interactive.
            The invisible native thumb is widened to ~24px so the drag
            gesture still starts when the cursor lands near the painted
            cell, even if pixel-perfect registration drifts by a few pixels. */}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(snapToStep(parseFloat(e.target.value)))}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className="slider-input absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ touchAction: 'manipulation' }}
          aria-label={label}
          title={tooltip ? undefined : 'Arrow: step · Shift: coarse · Option: fine'}
        />
      </div>

      <style>{`
        /* Native input sits on top and is fully invisible, but its native
           thumb is generous (24×22px) so clicks near the painted cell
           reliably start a drag. Without this, clicking the painted cell
           can land on the native track (jump, don't drag) on some browsers. */
        .slider-root .slider-input {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          margin: 0;
        }
        .slider-root .slider-input::-webkit-slider-runnable-track {
          background: transparent;
          height: 22px;
          border: none;
        }
        .slider-root .slider-input::-moz-range-track {
          background: transparent;
          height: 22px;
          border: none;
        }
        .slider-root .slider-input::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 24px;
          height: 22px;
          background: transparent;
          border: none;
          cursor: grab;
          margin-top: 0;
        }
        .slider-root .slider-input:active::-webkit-slider-thumb { cursor: grabbing; }
        .slider-root .slider-input::-moz-range-thumb {
          width: 24px;
          height: 22px;
          background: transparent;
          border: none;
          cursor: grab;
        }
        .slider-root .slider-input:active::-moz-range-thumb { cursor: grabbing; }

        .slider-root .slider-graticule {
          color: var(--ink-soft);
          opacity: 0;
          transition: opacity var(--motion-medium) var(--ease-out-quart);
        }
        .slider-root:hover .slider-graticule,
        .slider-root:focus-within .slider-graticule {
          opacity: 0.35;
        }
        .slider-root:has(.slider-input:active) .slider-graticule {
          opacity: 0.5;
        }

        .slider-root .slider-track {
          height: 1px;
          background: var(--hairline);
          transition: height var(--motion-medium) var(--ease-out-quart),
                      background var(--motion-medium) var(--ease-out-quart);
        }
        .slider-root:hover .slider-track,
        .slider-root:focus-within .slider-track {
          height: 2px;
          background: var(--ink-soft);
        }

        .slider-root .slider-thumb {
          position: absolute;
          top: 50%;
          width: 10px;
          height: 10px;
          background: var(--ink);
          border: 1px solid transparent;
          border-radius: var(--radius-cell);
          transform: translate(-50%, -50%) rotate(0deg);
          transition:
            transform var(--motion-medium) var(--ease-out-quint),
            background var(--motion-fast) var(--ease-out-quart),
            border-color var(--motion-fast) var(--ease-out-quart);
          pointer-events: none;
        }

        .slider-root:hover .slider-thumb,
        .slider-root:focus-within .slider-thumb {
          transform: translate(-50%, -50%) rotate(45deg);
          border-color: var(--violet);
        }

        .slider-root:has(.slider-input:active) .slider-thumb {
          background: var(--saffron);
          border-color: var(--violet);
          border-width: 1.5px;
        }

        /* Keyboard focus — explicit outline at 2px offset per brief, so the
           ring survives on a paper ground regardless of the thumb's fill. */
        .slider-root:has(.slider-input:focus-visible) .slider-thumb {
          outline: 1.5px solid var(--violet);
          outline-offset: 2px;
        }

        .slider-root[data-disabled] {
          opacity: 0.5;
        }
        .slider-root[data-disabled] .slider-thumb {
          background: var(--muted);
          border-color: transparent;
        }
      `}</style>
    </div>
  );
}
