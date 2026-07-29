// DragNumber — the shared draggable numeral primitive.
//
// A number you grab and pull. The control is an INVISIBLE VERTICAL SLIDER:
// pointer POSITION maps to value, never pointer velocity, so the same travel
// always buys the same change and letting go mid-gesture never overshoots.
// Two mappings (issue #135's live verdict, issue #138's build):
//
//   linear     value += dy × step / pxPerStep       (default — integer counts,
//              and any range that contains or crosses 0)
//   geometric  value ×= 2 ^ (dy / pxPerDoubling)    (100px per doubling: ×2 up
//              and ÷2 down are the same travel — the shape of a multiplier)
//
// Clamping is EDGE RE-ANCHOR (slip), not a dead zone: the raw value is pinned
// inside the range on every move, so reversing direction at an end responds on
// the very next pixel. Under `geometric` the raw additionally floors at
// max(min, step/4) — a range whose min is 0 would otherwise absorb the value
// permanently, since 0 × anything is 0.
//
// SEAM — two callbacks, deliberately different jobs:
//   onChange(next)  live. Every grid crossing during a drag, every arrow key,
//                   the typed value. Drive the preview off this.
//   onCommit(next)  ONCE per gesture — pointer up, Enter, or blur. Create the
//                   undo entry off this and you get exactly one per gesture.
// A gesture that ends where it started emits neither: no no-op undo entries.
//
// The parent owns `value` (controlled); this component holds only the transient
// drag and edit-draft state.
//
// The pointer mechanics themselves live in `useDragValue` — extracted verbatim
// when `DragDial` (#139) needed the identical feel with a different mapping and
// a different meaning for a click. This file supplies the two mappings, the
// readout with its type-in editor, the keyboard, and the split-diamond thumb.
//
// Visual language is the slider system's (.claude/shape-brief-tokens-slider.md):
// ink square at rest; on hover it rotates to a diamond whose halves part into
// up/down pointers — the cell under the hand showing its two directions of
// travel; saffron on drag with the trailing half dimmed so the leading half
// reads direction; violet focus ring; tokens only, never a hex literal.
import { useEffect, useRef, useState } from "react";
import useDragValue, { DEFAULT_GAINS } from "./useDragValue";
import { flashTiming } from "./dragNumberFlash";

// Defaults stay module-private (react-refresh wants this file to export the
// component and nothing else); each is overridable through a prop.
/** px of pointer travel worth one `step`, under `linear`. */
const DEFAULT_PX_PER_STEP = 8;
/** px of pointer travel worth one doubling, under `geometric`. */
const DEFAULT_PX_PER_DOUBLING = 100;

const SPLIT_GAP = 2.2; // px each diamond half parts by when the hand is on it
// The reduced-motion crossfade cannot use --motion-medium: the motion tokens
// collapse to 0ms under `prefers-reduced-motion` (tokens.css), which would
// delete the fade rather than substitute it for the rotation.
//
// `flashSignal`'s timings follow this same precedent for the same reason, and
// live in `./dragNumberFlash` — react-refresh lets this file export the
// component and nothing else, so a testable `flashTiming` cannot live here.
const REDUCED_FADE = "200ms";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Snap to the step grid off `min`, then trim floating-point noise so a 0.01
// step commits 1.31, not 1.3100000000000002.
function snap(v, min, max, step) {
  const snapped = min + Math.round((clamp(v, min, max) - min) / step) * step;
  return clamp(Number(snapped.toFixed(6)), min, max);
}

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// `format` and `parse` are a PAIRED contract. A format that rescales the value —
// the percent readout, say — silently breaks type-in without a matching parse:
// the default strips the "%" and hands back 130, which snaps to max. That failure
// looks like a clamp bug, so DEV shouts about it once per label.
const warnedPairs = new Set();
function warnUnpairedFormat(label) {
  if (!import.meta.env.DEV || warnedPairs.has(label)) return;
  warnedPairs.add(label);
  console.warn(
    `<DragNumber label="${label}"> was given a custom \`format\` but no \`parse\`. ` +
      "They are a paired contract: without `parse`, a typed value is read on the " +
      "raw scale and will snap to the wrong number. Pass the inverse of `format`.",
  );
}

const DEFAULT_FORMAT = (v) => String(v);
// Tolerant of the symbols a format is likely to append (%, ×, units) so the
// default round-trips a plain number. A format that RESCALES the value — the
// percent readout, say — needs a matching `parse`; see the prop's note.
const DEFAULT_PARSE = (s) => parseFloat(String(s).replace(/[^\d.eE+-]/g, ""));

export default function DragNumber({
  value,
  min = 0,
  max = 1,
  step = 1,
  /** Live value, every grid crossing. */
  onChange,
  /** Fires once per gesture (pointer up / Enter / blur) — one undo entry. */
  onCommit,
  /** "linear" (default) or "geometric". */
  mapping = "linear",
  pxPerStep = DEFAULT_PX_PER_STEP,
  pxPerDoubling = DEFAULT_PX_PER_DOUBLING,
  gains = DEFAULT_GAINS,
  label = "Value",
  /** Value → display string. */
  format = DEFAULT_FORMAT,
  /** Display string → value. MUST be supplied whenever `format` rescales the
   *  value, e.g. format=v=>`${v*100}%` pairs with parse=s=>parseFloat(s)/100. */
  parse = DEFAULT_PARSE,
  /** Row height and pointer target. 24px is the spec'd minimum. */
  hitHeight = 24,
  title = "Drag ↕ · click to type · Shift coarse · Option fine",
  testId = "drag-number",
  /** Inert: no drag, no click-to-type, no keyboard, out of the tab order. The
   *  control stays VISIBLE and keeps showing its value — a control that
   *  disappears when it stops applying teaches nothing about why. Pair it with a
   *  `title` that states the reason. */
  disabled = false,
  /**
   * Change this to make the thumb flash once — "the number changed for a reason
   * you didn't cause". ANY changing primitive works, so pass the CAUSE itself
   * and the parent needs no state and no effect:
   *
   *     <DragNumber value={shown} flashSignal={unit} … />   // 'density'|'spacing'
   *
   * `null`/`undefined` never flashes, and the overlay layer is not rendered at
   * all — every existing consumer's DOM is byte-identical. The FIRST value is
   * latched without flashing (mount is not a change). Suppressed while dragging
   * (the user IS the cause), editing (the thumb subtree is unmounted) and
   * disabled; THE LATCH STILL ADVANCES in all three, so a change absorbed
   * during one of them never fires late — open the editor, flip the unit, close
   * the editor, and there is no spurious flash for a change already caused.
   *
   * ⚠️ NOT gated on `value !== prevValue`, deliberately. At `spacing = 10` the
   * reciprocal density is also 10: the numeral is byte-identical across the
   * flip. That is the most confusing state the control can reach, so it is
   * where the flash is most warranted, not least.
   */
  flashSignal = null,
  /** CSS width reserved for the readout, e.g. "4ch". Fixed-width and
   *  LEFT-anchored, so a value whose digit count changes (7% → 100%, 1° → 359°)
   *  cannot resize the row and slide the thumb sideways. Omit for intrinsic
   *  width when the caller knows the digit count never changes. */
  slotWidth,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [hover, setHover] = useState(false);
  // Escape must CANCEL. Removing the focused input fires a native blur, which
  // would otherwise let onBlur commit the very draft we cancelled; this latch
  // makes that trailing blur a no-op.
  const cancelling = useRef(false);
  const [reduced] = useState(prefersReducedMotion);

  if (format !== DEFAULT_FORMAT && parse === DEFAULT_PARSE) warnUnpairedFormat(label);

  const display = format(value);

  const emit = (next) => {
    onChange?.(next);
    onCommit?.(next);
  };

  /* ------------------------------------------------------------- type-in */

  const openEditor = () => {
    setDraft(display);
    setEditing(true);
  };

  const commitEdit = (raw) => {
    setEditing(false);
    const n = parse(raw);
    if (!Number.isFinite(n)) return;
    const next = snap(n, min, max, step);
    if (next !== value) emit(next);
  };

  /* ---------------------------------------------------------------- drag */
  // Mechanics come from the shared hook; this component supplies only the two
  // mappings, the grid, and what a press-without-drag means (open the editor).

  const {
    dragging,
    dir: lastDir,
    handlers,
  } = useDragValue({
    value,
    advance: (raw, dy, gain) =>
      mapping === "geometric"
        ? clamp(raw * Math.pow(2, (dy * gain) / pxPerDoubling), Math.max(min, step / 4), max)
        : clamp(raw + (dy * gain * step) / pxPerStep, min, max),
    quantize: (raw) => snap(raw, min, max, step),
    onChange,
    onCommit,
    onClick: openEditor,
    gains,
    // `disabled` gates onPointerDown, so `drag.current` is never set and endDrag
    // returns before `onClick` — one flag turns off the scrub AND click-to-type.
    disabled: editing || disabled,
  });

  /* ----------------------------------------------------------- the flash */
  // TRIGGER, NOT FLOAT. The parent passes the CAUSE and this owns the motion:
  // zero React re-renders per flash, and a component that needs no rAF loop
  // from its host stays liftable.
  //
  // A dedicated overlay <g> animated with WAAPI, which makes the precedence
  // rule STRUCTURAL rather than ordered. The flash never writes `fill` on
  // anything, so `dragging ? saffron : ink` — React's sole property — cannot be
  // fought. Two owners, two cascade origins, no overlap in time.
  //
  // The layer lives INSIDE `data-thumb-group`, so it inherits the 45° rest
  // rotation and the split geometry for free: a flash while hovering shows a
  // split saffron diamond. Correct, not a conflict.

  const flashRef = useRef(null);
  // Seeded with the mount value, so the first run compares equal and mount is
  // not read as a change.
  const flashPrev = useRef(flashSignal);

  useEffect(() => {
    const prev = flashPrev.current;
    // ADVANCE THE LATCH FIRST AND UNCONDITIONALLY. Every early return below is
    // a reason not to SHOW the flash, never a reason to forget that the signal
    // moved — otherwise a change absorbed while editing fires the moment the
    // editor closes, for something the user already caused.
    flashPrev.current = flashSignal;
    // A null signal is "this consumer does not use the flash"; a null
    // PREDECESSOR is a consumer that has only just started to. Neither is a
    // change worth announcing, and the overlay layer does not even exist for
    // the first of them.
    if (flashSignal == null || prev == null || Object.is(prev, flashSignal)) return undefined;
    if (dragging || editing || disabled) return undefined;
    const el = flashRef.current;
    // jsdom has no Web Animations API; the test setup stubs it, and this guard
    // keeps any other host without WAAPI silently un-flashed rather than broken.
    if (!el || typeof el.animate !== "function") return undefined;
    const { duration, keyframes } = flashTiming(reduced);
    // NO `fill` MODE, so the resting inline `opacity: 0` reclaims the element
    // the instant the animation finishes. No setTimeout anywhere.
    const anim = el.animate(keyframes, { duration, fill: "none" });
    // CANCELLING IN THE CLEANUP, not at the head of the next flash, is what
    // collapses StrictMode's double-invoke to one visible flash — and it is
    // also precedence rule 6: if `dragging` flips true mid-flash this effect
    // re-runs, the cleanup cancels, and the glow disappears the moment the user
    // takes over.
    return () => anim.cancel();
  }, [flashSignal, dragging, editing, disabled, reduced]);

  /* ------------------------------------------------------------ keyboard */

  const onKeyDown = (e) => {
    if (disabled) return;
    if (e.key === "Enter") {
      e.preventDefault();
      openEditor();
      return;
    }
    let next;
    if (e.key === "Home") next = snap(min, min, max, step);
    else if (e.key === "End") next = snap(max, min, max, step);
    else {
      const dir =
        e.key === "ArrowUp" || e.key === "ArrowRight"
          ? 1
          : e.key === "ArrowDown" || e.key === "ArrowLeft"
            ? -1
            : 0;
      if (!dir) return;
      // Gains scale travel, not the grid. On the keyboard a fine gain of ×0.1
      // would land sub-grid and round straight back to the current value — the
      // key would read as dead — so keyboard gain floors at one whole step.
      const gain = e.shiftKey ? gains.coarse : e.altKey ? gains.fine : 1;
      next = snap(value + dir * step * Math.max(1, gain), min, max, step);
    }
    e.preventDefault();
    if (next !== value) emit(next);
  };

  /* --------------------------------------------------------------- thumb */
  // A diamond drawn as two halves sharing the horizontal diagonal. At rest the
  // group is rotated 45° so it reads as an axis-aligned ink SQUARE. With the
  // hand on it the group rotates to 0° and the halves part vertically — the
  // cell showing its two directions of travel. Drag fills saffron; the half
  // facing away from travel dims so the leading half reads direction.
  const split = hover || dragging;
  const gap = split ? SPLIT_GAP : 0;
  const fill = dragging ? "var(--saffron)" : "var(--ink)";
  const transition = reduced
    ? `opacity ${REDUCED_FADE} linear`
    : "transform var(--motion-medium) var(--ease-out-quint), opacity var(--motion-medium) var(--ease-out-quint)";

  if (editing) {
    return (
      <input
        type="text"
        inputMode="decimal"
        autoFocus
        value={draft}
        aria-label={label}
        data-testid={`${testId}-input`}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelling.current) {
            cancelling.current = false;
            return; // Escape already cancelled — ignore the unmount blur.
          }
          commitEdit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit(draft);
          if (e.key === "Escape") {
            cancelling.current = true;
            setEditing(false);
          }
        }}
        className="w-16 rounded-xs border border-violet bg-paper px-1 py-px text-right text-xs text-saffron outline-none num"
        style={{ height: hitHeight }}
      />
    );
  }

  return (
    <span
      role="slider"
      // Out of the tab order when inert, so Tab does not stop on a control that
      // cannot be operated. `aria-disabled` rather than the `disabled` attribute
      // — this is a span with role=slider, not a form control.
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={display}
      data-testid={testId}
      data-dragging={dragging || undefined}
      data-reduced-motion={reduced ? "true" : undefined}
      title={title}
      {...handlers}
      onKeyDown={onKeyDown}
      onPointerEnter={() => !disabled && setHover(true)}
      onPointerLeave={() => setHover(false)}
      // Inert reads as inert: the repo's `disabled:opacity-40` + default cursor,
      // applied directly because this is a span, not a form control that can
      // carry the `:disabled` variant. No hover lift, no focus ring, no
      // ns-resize cursor promising a drag that will not happen.
      className={`inline-flex select-none items-center gap-2xs rounded-xs px-1 outline-none ${
        disabled
          ? "cursor-default opacity-40"
          : "cursor-ns-resize hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-violet"
      }`}
      style={{ height: hitHeight, touchAction: "none" }}
    >
      <svg
        width="18"
        height="24"
        viewBox="0 0 18 24"
        aria-hidden="true"
        className="shrink-0"
        data-testid={`${testId}-thumb`}
      >
        <g
          data-thumb-group=""
          style={{
            transform: `rotate(${split ? 0 : 45}deg)`,
            transformOrigin: "9px 12px",
            transition,
          }}
        >
          <polygon
            points="9,5.4 15.6,12 2.4,12"
            fill={fill}
            style={{
              transform: `translateY(${-gap}px)`,
              opacity: dragging && lastDir === "down" ? 0.45 : 1,
              transition,
            }}
          />
          <polygon
            points="2.4,12 15.6,12 9,18.6"
            fill={fill}
            style={{
              transform: `translateY(${gap}px)`,
              opacity: dragging && lastDir === "up" ? 0.45 : 1,
              transition,
            }}
          />
          {/* THE FLASH LAYER. Rendered ONLY for a consumer that passes a
              `flashSignal`, so every existing consumer's DOM is untouched.

              BRIGHTNESS, NOT BLOOM: the same two cells, repainted saffron and
              then unpainted. No drop-shadow, no blur, no larger translucent
              shape behind the thumb — those are the glow principle 2 forbids.

              Only the SQUARE glows. Not the numeral, not the focus ring: the
              numeral is the thing that changed, the square is the marker
              saying why.

              `opacity: 0` is React's resting value and WAAPI's sole property
              during a flash; because the animation carries no `fill` mode, this
              inline style reclaims the element the moment it finishes. The two
              halves mirror the base geometry above, so the layer parts and
              rotates with the thumb rather than sitting flat over it. */}
          {flashSignal != null && (
            <g ref={flashRef} data-testid={`${testId}-flash`} style={{ opacity: 0 }}>
              <polygon
                points="9,5.4 15.6,12 2.4,12"
                fill="var(--saffron)"
                style={{ transform: `translateY(${-gap}px)`, transition }}
              />
              <polygon
                points="2.4,12 15.6,12 9,18.6"
                fill="var(--saffron)"
                style={{ transform: `translateY(${gap}px)`, transition }}
              />
            </g>
          )}
        </g>
      </svg>
      <span
        data-testid={`${testId}-readout`}
        style={slotWidth ? { width: slotWidth } : undefined}
        className={`text-xs num ${slotWidth ? "shrink-0 text-left" : ""} ${
          dragging ? "text-saffron" : hover ? "text-ink" : "text-ink-soft"
        }`}
      >
        {display}
      </span>
    </span>
  );
}
