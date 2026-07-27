// DragDial — a compact bearing cell that is three controls at once.
//
// Approved as variant D of the #139 popover prototype. In one 24px row it is:
//
//   1. a LIVE READOUT — a dial face whose needle tracks the bearing however it
//      changes (drag, the big radial, paste, reset, the keyboard);
//   2. a DRAG CONTROL — the same absolute position→value law as `DragNumber`,
//      LINEAR at 1px = 1°, wrapping through 0/360;
//   3. a DISCLOSURE — a press without a drag opens the full radial.
//
// It shares `useDragValue` with DragNumber, so the two feel identical by
// construction: same 3px click-vs-scrub threshold, same Shift(×2)/Option(×0.1)
// travel gains, same one-commit-per-gesture rule. What differs is only what has
// to: degrees instead of steps, wrapping instead of clamping, and a click that
// opens a flyout instead of a type-in.
//
// ACCESSIBILITY NOTE. The prototype carried `aria-expanded` on the `role=
// "slider"`, which is not a valid pairing — a slider is not a disclosure. The
// approved gesture is deliberately one element doing both, so rather than split
// the flyout onto a separate button (which would change what was approved) the
// invalid attribute is simply gone: the slider stays a clean slider,
// `aria-keyshortcuts` advertises Enter, and the disclosure relationship is
// carried by the flyout itself — a labelled `role="dialog"` that takes focus on
// open and returns it on close.
import { useState } from "react";
import useDragValue, { wrap360 } from "./useDragValue";

/** 1 px of pointer travel = 1 DEGREE. A full revolution costs 360px, roughly a
 *  screen-height, the same order as DragNumber's 100px per doubling across a
 *  0.25–4× range. Shift turns a full circle in 180px; Option gives 10px per
 *  degree for a precise bearing. */
const PX_PER_DEGREE = 1;

/** Arrow-key step, and its Shift multiplier — AngleDial's convention, kept
 *  deliberately distinct from the drag's ×2 travel gain (Majed's call: ×10 per
 *  press is the right size for degrees, ×2 travel is the right feel for a
 *  scrub). */
const KEY_STEP = 1;
const KEY_COARSE = 10;

/* -- geometry -------------------------------------------------------------- */
// A 28-unit box for a 22px render: an SVG root clips at its viewBox, and the
// rotation cue's arrowhead reaches r≈12.94. Swept over all 360 bearings in both
// directions — worst reach 12.939 against a half-box of 14.
const F = 14; // face centre
const RIM = 8.6;
const NEEDLE = 7;
const CUE_R = 10.2;
const CUE_SPAN = 62; // degrees of arc swept away from the needle
const HEAD_LEN = 4.4;
const HEAD_HALF = 2.7;
const HEAD_BACK = 1;

const polar = (deg, r) => ({
  x: F + r * Math.sin((deg * Math.PI) / 180),
  y: F - r * Math.cos((deg * Math.PI) / 180),
});

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Drag feedback for a DIAL is rotational, not vertical. The arc STARTS AT THE
// NEEDLE and sweeps away from it, so reversing direction does not merely move an
// arrowhead between ends — the whole arc jumps to the other side of the needle,
// and the needle reads as being pushed back and forth by the hand.
//
// The sign is READ OFF the drag law rather than restated: `advance` adds dy (up
// = positive) to a bearing that increases CLOCKWISE, so an upward drag turns the
// needle clockwise. Change the drag law and the cue follows.
function RotationCue({ angle, dir }) {
  const cw = dir === "up";
  const to = angle + (cw ? CUE_SPAN : -CUE_SPAN);
  const a = polar(angle, CUE_R);
  const b = polar(to, CUE_R);

  const t = (to * Math.PI) / 180;
  const s = cw ? 1 : -1;
  const tan = { x: s * Math.cos(t), y: s * Math.sin(t) };
  const rad = { x: Math.sin(t), y: -Math.cos(t) };
  const tip = { x: b.x + tan.x * HEAD_LEN, y: b.y + tan.y * HEAD_LEN };
  const c1 = {
    x: b.x - tan.x * HEAD_BACK + rad.x * HEAD_HALF,
    y: b.y - tan.y * HEAD_BACK + rad.y * HEAD_HALF,
  };
  const c2 = {
    x: b.x - tan.x * HEAD_BACK - rad.x * HEAD_HALF,
    y: b.y - tan.y * HEAD_BACK - rad.y * HEAD_HALF,
  };

  return (
    <g data-testid="dial-cue" data-dir={cw ? "cw" : "ccw"}>
      <path
        d={`M ${a.x} ${a.y} A ${CUE_R} ${CUE_R} 0 0 ${cw ? 1 : 0} ${b.x} ${b.y}`}
        fill="none"
        stroke="var(--saffron)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <polygon points={`${tip.x},${tip.y} ${c1.x},${c1.y} ${c2.x},${c2.y}`} fill="var(--saffron)" />
    </g>
  );
}

export default function DragDial({
  /** Absolute bearing in degrees, 0 = up, increasing clockwise. */
  value,
  /** Live, on every degree crossed. */
  onChange,
  /** ONCE per gesture — pointer-up or a single key press. */
  onCommit,
  /** Press-without-drag, or Enter. */
  onOpen,
  /** Whether the flyout this cell discloses is currently open (styling only). */
  open = false,
  label = "Angle",
  title = "Drag ↕ to turn · click for the dial · Shift coarse · Option fine",
  testId = "drag-dial",
}) {
  const [hover, setHover] = useState(false);
  const [reduced] = useState(prefersReducedMotion);

  const { dragging, dir, handlers } = useDragValue({
    value,
    // Raw runs FREE (unwrapped) across the gesture; wrapping happens in
    // quantize, so dragging past 360 rolls through 0 with no discontinuity and
    // no accumulated float drift in the raw.
    advance: (raw, dy, gain) => raw + (dy * gain) / PX_PER_DEGREE,
    quantize: wrap360,
    onChange,
    onCommit,
    onClick: onOpen,
  });

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.();
      return;
    }
    const d =
      e.key === "ArrowUp" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowDown" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!d) return;
    e.preventDefault();
    const next = wrap360(value + d * KEY_STEP * (e.shiftKey ? KEY_COARSE : 1));
    if (next === value) return;
    onChange?.(next);
    onCommit?.(next);
  };

  const lit = hover || dragging || open;
  const stroke = dragging ? "var(--saffron)" : "var(--ink)";
  // House motion: 240ms cubic-bezier(0.22,1,0.36,1), both as live tokens. Under
  // reduced motion those tokens collapse to 0ms, which would delete the cue
  // rather than substitute one — so the fade is spelled out and the transform is
  // dropped from the transition entirely.
  const transition = reduced
    ? "opacity 200ms linear"
    : "transform var(--motion-medium) var(--ease-out-quint), opacity var(--motion-medium) var(--ease-out-quint)";

  const needle = polar(value, NEEDLE);

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={value}
      aria-valuetext={`${value}°`}
      aria-keyshortcuts="Enter"
      data-testid={testId}
      data-dragging={dragging || undefined}
      data-reduced-motion={reduced ? "true" : undefined}
      title={title}
      {...handlers}
      onKeyDown={onKeyDown}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      className="inline-flex h-6 cursor-ns-resize select-none items-center gap-2xs rounded-xs px-1 outline-none hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-violet"
      style={{ touchAction: "none" }}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 28 28"
        aria-hidden="true"
        className="shrink-0"
        data-testid={`${testId}-face`}
        style={{
          // The hover affordance: the face swells and comes fully opaque.
          transform: reduced ? undefined : `scale(${lit ? 1.15 : 1})`,
          transformOrigin: "50% 50%",
          opacity: lit ? 1 : 0.7,
          transition,
        }}
      >
        <circle cx={F} cy={F} r={RIM} fill="none" stroke="var(--hairline)" strokeWidth="1" />
        {/* 12 o'clock reference — absolute bearings are read from here */}
        <line x1={F} y1={F - 9.2} x2={F} y2={F - 7} stroke="var(--ink-soft)" strokeWidth="1" />
        <line
          x1={F}
          y1={F}
          x2={needle.x}
          y2={needle.y}
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <circle cx={F} cy={F} r="1.5" fill={stroke} />
        {dragging && dir && <RotationCue angle={value} dir={dir} />}
      </svg>
      {/* FIXED-WIDTH, LEFT-ANCHORED slot. Crossing 0 ↔ 359 changes the digit
          count, which would otherwise resize the cell and slide the whole row
          sideways. Digits grow rightward into reserved space: the "1" of 1°
          lands exactly where the "3" of 359° lands. 4ch reserves four DIGIT
          advances and "°" is narrower than a digit, so the slack sits at the
          right end where it cannot move anything. */}
      <span
        data-testid={`${testId}-readout`}
        className={`shrink-0 text-left text-xs num ${
          dragging ? "text-saffron" : lit ? "text-ink" : "text-ink-soft"
        }`}
        style={{ width: "4ch" }}
      >
        {value}°
      </span>
    </span>
  );
}
