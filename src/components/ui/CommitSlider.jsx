import { useId, useRef, useState } from 'react';

/*
 * CommitSlider — the Slider primitive with a second, ghost thumb drawn at
 * `committedValue`. Used in the Optimize section of the Prepare tab, where
 * the slider's preview value and the applied-to-export value diverge.
 *
 * When value === committedValue the component renders identically to the
 * primitive Slider. When they diverge, a small outlined square sits at
 * the committed position and a dashed hairline ties the two positions
 * together — literally drawing the preview → apply distinction.
 *
 * The ghost thumb never rotates. It's the stable memory of what's currently
 * exported. Only the live thumb rotates and fills under the hand.
 *
 * This component copies the Slider primitive's visual layer rather than
 * wrapping it, because we need pixel-precise synchronization between the
 * two thumb positions and the tie-line. Composing by wrapping would either
 * require the primitive to expose refs for its internals or force the
 * variant to re-measure on every render. Duplicating ~70 lines of template
 * is the cheaper and more robust tradeoff here.
 */
export default function CommitSlider({
  label,
  value,
  committedValue,
  min,
  max,
  step = 1,
  onChange,
  tooltip,
  disabled = false,
  id: providedId,
}) {
  const autoId = useId();
  const id = providedId ?? `commit-slider-${autoId}`;
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const valueRef = useRef(null);

  const decimals =
    step < 1 ? String(step).split('.')[1]?.length || 1 : 0;
  const displayValue = Number(value).toFixed(decimals);
  const percent = ((value - min) / (max - min)) * 100;
  const hasCommitted =
    committedValue !== null &&
    committedValue !== undefined &&
    Number.isFinite(committedValue);
  const committedPercent = hasCommitted
    ? ((committedValue - min) / (max - min)) * 100
    : percent;
  const diverged = hasCommitted && committedValue !== value;

  const snapToStep = (v, useStep = step) => {
    const clamped = Math.max(min, Math.min(max, v));
    const snapped = Math.round(clamped / useStep) * useStep;
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

  const handleKeyDown = (e) => {
    if (disabled || editing) return;
    const isLeft = e.key === 'ArrowLeft' || e.key === 'ArrowDown';
    const isRight = e.key === 'ArrowRight' || e.key === 'ArrowUp';
    if (!isLeft && !isRight && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    if (e.key === 'Home') return onChange(snapToStep(min));
    if (e.key === 'End') return onChange(snapToStep(max));
    let multiplier = 1;
    if (e.shiftKey) multiplier *= 10;
    if (e.altKey) multiplier *= 0.1;
    const delta = step * multiplier * (isLeft ? -1 : 1);
    onChange(snapToStep(value + delta, Math.min(step, Math.abs(delta)) || step));
  };

  // The tie-line spans from the smaller of (committed, live) to the larger.
  const tieStart = Math.min(percent, committedPercent);
  const tieEnd = Math.max(percent, committedPercent);

  return (
    <div
      className="slider-root flex flex-col gap-2xs"
      data-disabled={disabled || undefined}
      data-diverged={diverged || undefined}
      style={{
        '--slider-percent': `${percent}%`,
        '--slider-committed-percent': `${committedPercent}%`,
      }}
    >
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

        {editing ? (
          <input
            ref={valueRef}
            type="number"
            inputMode={decimals > 0 ? 'decimal' : 'numeric'}
            className="text-xs text-saffron num w-16 text-right bg-paper-warm border border-violet rounded-xs px-1.5 py-0 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
            className="slider-value text-xs num w-16 text-right cursor-text px-1.5 py-0 rounded-xs transition-colors duration-fast ease-out-quart hover:bg-paper-warm focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:text-ink-soft"
            style={{ color: diverged ? 'var(--violet)' : 'var(--ink)' }}
            onClick={startEditing}
            disabled={disabled}
            title={
              diverged
                ? `Preview: ${displayValue} · Applied: ${Number(committedValue).toFixed(decimals)}`
                : 'Click to type a value'
            }
            aria-label={`${label}: ${displayValue}${
              diverged
                ? `, applied value ${Number(committedValue).toFixed(decimals)}`
                : ''
            }, click to edit`}
          >
            {displayValue}
          </button>
        )}
      </div>

      <div className="slider-track-region relative h-[22px] flex items-center">
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
          aria-label={label}
          title={tooltip ? undefined : 'Arrow: step · Shift: coarse · Option: fine'}
        />

        <div
          className="slider-track absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />

        {/* Tie-line between committed ghost and live thumb (only when diverged). */}
        {diverged && (
          <div
            className="slider-tie-line absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              left: `${tieStart}%`,
              width: `${tieEnd - tieStart}%`,
            }}
            aria-hidden="true"
          />
        )}

        {/* Ghost thumb at committed position. Does NOT rotate. */}
        {diverged && (
          <div
            className="slider-ghost-thumb"
            style={{ left: `var(--slider-committed-percent)` }}
            aria-label={`Applied value indicator at ${committedValue}`}
            role="img"
          />
        )}

        {/* Live thumb — same behavior as the primitive. */}
        <div
          className="slider-thumb"
          style={{ left: `var(--slider-percent)` }}
          aria-hidden="true"
        />
      </div>

      <style>{`
        .slider-root .slider-graticule {
          color: var(--ink-soft);
          opacity: 0;
          transition: opacity var(--motion-medium) var(--ease-out-quart);
        }
        .slider-root:hover .slider-graticule,
        .slider-root:focus-within .slider-graticule {
          opacity: 0.35;
        }
        .slider-root:has(.slider-input:active) .slider-graticule { opacity: 0.5; }

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
          z-index: 2;
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

        .slider-root:has(.slider-input:focus-visible) .slider-thumb {
          outline: 1.5px solid var(--violet);
          outline-offset: 2px;
        }

        /* Ghost thumb — a small outlined square at the committed position.
           Does NOT rotate. Stays calm while the live thumb animates. */
        .slider-root .slider-ghost-thumb {
          position: absolute;
          top: 50%;
          width: 9px;
          height: 9px;
          background: transparent;
          border: 1px solid var(--ink-soft);
          border-radius: var(--radius-cell);
          transform: translate(-50%, -50%);
          opacity: 0.7;
          pointer-events: none;
          z-index: 1;
        }

        /* Tie-line between committed and live. Dashed hairline by default,
           becomes solid on hover (signaling the relationship). */
        .slider-root .slider-tie-line {
          height: 1px;
          background-image: linear-gradient(
            to right,
            var(--ink-soft) 0,
            var(--ink-soft) 2px,
            transparent 2px,
            transparent 5px
          );
          background-size: 5px 1px;
          background-repeat: repeat-x;
          opacity: 0.6;
          transition: opacity var(--motion-medium) var(--ease-out-quart);
        }
        .slider-root:hover .slider-tie-line {
          opacity: 1;
        }

        .slider-root[data-disabled] { opacity: 0.5; }
        .slider-root[data-disabled] .slider-thumb {
          background: var(--muted);
          border-color: transparent;
        }
      `}</style>
    </div>
  );
}
