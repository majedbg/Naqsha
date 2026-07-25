// ScrubNumeral — a draggable + typeable numeric value, the Figma/Blender idiom
// rendered Naqsha-native (currentColor ink, no skeuomorphic knob). Drag
// horizontally to scrub at CONSTANT sensitivity (one step every PX_PER_STEP
// pixels, range-independent); click without moving to type; a hairline value-fill
// underline reads the value's position in [min,max]. Keyboard: the control is a
// slider (role="slider", focusable) where ArrowUp/Right and ArrowDown/Left step
// and commit, and Enter opens the type input.
//
// SEAM: every committed change — scrub tick, arrow step, or typed Enter/blur —
// flows through the single `onCommit(nextValue)` callback with a value snapped to
// the step grid and clamped to [min,max]. The parent owns the value (controlled);
// this component holds only the transient drag + edit-draft state.
import { useRef, useState } from "react";

const PX_PER_STEP = 8; // constant scrub sensitivity (px of travel per step)
const MOVE_THRESHOLD = 3; // px before a pointer-down counts as a drag, not a click

// Snap to the step grid off `min`, then trim floating-point noise so a 0.05 step
// commits 0.55, not 0.5500000000000001.
function snap(v, min, max, step) {
  const clamped = Math.max(min, Math.min(max, v));
  const snapped = min + Math.round((clamped - min) / step) * step;
  const trimmed = Number(snapped.toFixed(6));
  return Math.max(min, Math.min(max, trimmed));
}

export default function ScrubNumeral({
  value,
  min = 0,
  max = 1,
  step = 1,
  onCommit,
  label = "Value",
  format,
  testId = "scrub-numeral",
  width = 52,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const drag = useRef(null);
  // Escape must CANCEL. Removing the focused input fires a native blur in the
  // browser, which would otherwise let onBlur commit the very draft we cancelled;
  // this latch makes that trailing blur a no-op.
  const cancelling = useRef(false);

  const frac = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
  const display = format ? format(value) : String(value);

  const commit = (raw) => {
    const n = Number(raw);
    if (Number.isFinite(n)) onCommit?.(snap(n, min, max, step));
    setEditing(false);
  };

  const onPointerDown = (e) => {
    if (editing) return;
    drag.current = { x: e.clientX, v: value, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / non-pointer env */
    }
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > MOVE_THRESHOLD) d.moved = true;
    const nextSteps = Math.round(dx / PX_PER_STEP);
    const next = snap(d.v + nextSteps * step, min, max, step);
    if (next !== value) onCommit?.(next);
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (d && !d.moved) {
      setDraft(display);
      setEditing(true);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onCommit?.(snap(value + step, min, max, step));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onCommit?.(snap(value - step, min, max, step));
    } else if (e.key === "Enter") {
      e.preventDefault();
      setDraft(display);
      setEditing(true);
    }
  };

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelling.current) {
            cancelling.current = false;
            return; // Escape already cancelled — ignore the unmount blur.
          }
          commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") {
            cancelling.current = true;
            setEditing(false);
          }
        }}
        className="rounded-xs border border-violet bg-paper px-1 py-px text-2xs tabular-nums text-ink outline-none num"
        style={{ width }}
        data-testid={`${testId}-input`}
      />
    );
  }

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      data-testid={testId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      title="Drag to scrub · click to type"
      className="relative inline-flex cursor-ew-resize select-none items-baseline justify-center rounded-xs px-1 py-px text-2xs tabular-nums text-ink outline-none hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-violet num"
      style={{ width }}
    >
      {display}
      {/* hairline value-fill rule — ink over a hairline track (not saffron) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1 bottom-0 h-px bg-hairline"
      />
      <span
        aria-hidden="true"
        data-scrub-fill
        className="pointer-events-none absolute bottom-0 left-1 h-px bg-ink"
        style={{ width: `calc(${frac} * (100% - 0.5rem))` }}
      />
    </span>
  );
}
