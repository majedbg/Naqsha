/* eslint-disable react-refresh/only-export-components -- prototype: mixed
   data+component exports are fine here, HMR full-reload is acceptable. */
// ============================================================================
// PROTOTYPE — THROWAWAY CODE. Do not ship, do not test, do not extend.
//
// Question this round answers: what should the ANCHOR-PITCH control graphic
// look like? A wide dots-on-a-line strip that is simultaneously a picture of
// anchor pitch and the unit toggle for the numeral beside it.
//
// Spec of record: docs/pitch-control-graphic-decisions.md (every decision in
// it is locked). Background: docs/pitch-control-graphic-BRIEF.md — note its §2
// is SUPERSEDED by decision 1 (the brief has bracket/rectangle inverted).
//
// The locked semantics, restated because everything below depends on them:
//   BRACKET    = SPACING — spans a gap. The STORED value. Integer, 4..512.
//   RECTANGLE  = DENSITY — a window exactly 100 host units wide; the number
//                counts the dots inside it. density = 100 / spacing.
//   The graphic is a SIBLING of DragNumber, never a wrapper. Three gestures,
//   three targets: drag the thumb = value, click the numeral = type in, click
//   the graphic = flip unit.
//   Exactly ONE rounding, here in the parent: round(100 / d), clamped 4..512.
//   The toggle writes NOTHING — it swaps format/parse and the mark. Which is
//   why the dots must not move a pixel on flip; that stillness IS the proof.
//
// Three variants on the existing studio route, gated by ?pitch=A|B|C (DEV
// builds only, never under vitest; no param = prototype fully inert):
//   A — Ruler / drafting   (dimension line + shaded span on a measuring rule)
//   B — Score / rhythm     (span mark + bar/measure on a staff)
//   C — Aperture / caliper (caliper jaws + fixed viewport on a dot field)
//
// All state is local/mock. Nothing writes to layers, undo, or persistence.
// Tokens only, never a hex literal: var(--saffron) is the ONE load-bearing
// accent, var(--ink)/var(--ink-soft) for ink, var(--hairline) for rules,
// violet for focus only.
// ============================================================================
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import DragNumber from "../../ui/DragNumber";

/* ------------------------------------------------------------ ?pitch param */
// Deliberately NOT PROTO_VARIANTS / readVariant() from prototypeShared.jsx —
// that array drives MotifPrototypeOverlay and extending it would collide. This
// is the same useSyncExternalStore shape on its own param.

export const PITCH_VARIANTS = ["A", "B", "C"];
export const PITCH_VARIANT_NAMES = {
  A: "Ruler / drafting",
  B: "Score / rhythm",
  C: "Aperture / caliper",
};

const pitchListeners = new Set();

function readPitchVariant() {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("pitch");
  return PITCH_VARIANTS.includes(v) ? v : null;
}

export function setPitchVariant(v) {
  const url = new URL(window.location.href);
  if (v) url.searchParams.set("pitch", v);
  else url.searchParams.delete("pitch");
  window.history.replaceState(null, "", url);
  pitchListeners.forEach((fn) => fn());
}

function subscribePitch(cb) {
  pitchListeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    pitchListeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

// Safe outside a Router (reads location directly) so tests that mount without
// a router never notice the prototype exists.
export function usePitchVariant() {
  return useSyncExternalStore(subscribePitch, readPitchVariant, () => null);
}

/* ------------------------------------------------------------------- model */

/** MIN_EDGE_SPACING — anchors.js:20. Shown, never silently applied. */
export const MIN_SPACING = 4;
export const MAX_SPACING = 512;
/** The rectangle is literally this many host units wide. Decision 2. */
export const WINDOW_UNITS = 100;
export const DEFAULT_SPACING = 24; // motifLayer.js:80
export const MIN_DENSITY = WINDOW_UNITS / MAX_SPACING; // 0.1953125
export const MAX_DENSITY = WINDOW_UNITS / MIN_SPACING; // 25

export const clampSpacing = (s) => Math.max(MIN_SPACING, Math.min(MAX_SPACING, s));

/** Display transform. Never stored, re-derived every render. */
export const densityOf = (spacing) => WINDOW_UNITS / spacing;

/** THE ONLY ROUNDING IN THE SYSTEM (decision 8). Lives in the parent. */
export const spacingFromDensity = (d) => clampSpacing(Math.round(WINDOW_UNITS / d));

/** 1dp at d ≥ 1, 2dp below (decision 8). */
export const formatDensity = (d) => (d >= 1 ? d.toFixed(1) : d.toFixed(2));

// DragNumber's DEFAULT_PARSE strips every non-numeric character, which would
// swallow the digits inside a unit suffix ("4.2 /100u" → 4.2100). Both states
// therefore parse the LEADING numeric token only.
export const parseLeading = (s) =>
  parseFloat(String(s).trim().match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/)?.[0] ?? "");

export const isAtFloor = (spacing) => spacing <= MIN_SPACING;

/** Accessible name for the graphic button: current unit AND action. */
export function graphicLabel(unit, spacing) {
  return unit === "spacing"
    ? `Anchor spacing, ${spacing} units. Switch to density.`
    : `Anchor density, ${formatDensity(densityOf(spacing))} anchors per 100 units. Switch to spacing.`;
}

/** What the visually-hidden live region says after a flip. */
export function flipAnnouncement(unit, spacing) {
  return unit === "spacing"
    ? `Now anchor spacing, ${spacing} units.`
    : `Now anchor density, ${formatDensity(densityOf(spacing))} anchors per 100 units.`;
}

/* ---------------------------------------------------------------- geometry */

/** Quiet margin inside the strip, px. */
export const STRIP_PAD = 10;
/** Never draw more than this many dots — a guard, not a design limit. */
const MAX_DOTS = 220;

/**
 * Decision 5. Draw at TRUE canvas scale when the 100-unit window fits the
 * strip; otherwise compress the window to the strip and badge the difference.
 * Note what this is keyed to: the mocked ZOOM and the strip width — never the
 * value. Dragging the number can never move the badge.
 */
export function computeGeometry({ spacing, stripWidth, zoom }) {
  const inner = Math.max(0, stripWidth - STRIP_PAD * 2);
  const measured = inner > 0;
  const toScale = measured && WINDOW_UNITS * zoom <= inner;
  const pxPerUnit = !measured ? 0 : toScale ? zoom : inner / WINDOW_UNITS;
  const windowPx = WINDOW_UNITS * pxPerUnit;
  const windowX = STRIP_PAD + (inner - windowPx) / 2;
  return { measured, toScale, pxPerUnit, windowPx, windowX, stepPx: spacing * pxPerUnit };
}

/**
 * The anchor dots, phase-locked to the window's left edge at a HALF step.
 *
 * IMPLEMENTATION DISCOVERY, not in the spec: decision 2 promises "count the
 * dots inside the rectangle and you get the number in the field". Dots sitting
 * ON the window edges give a fencepost +1 — at spacing 24 you would count 5
 * dots against a numeral of 4.2. Offsetting the field by half a step makes the
 * visible count round(100/spacing) — exactly what the numeral reads — and it
 * is exact whenever 100/spacing is a whole number. Nothing in the spec locks
 * the phase (decision 4 makes the dots schematic), so this serves decision 2
 * rather than bending it. ALL THREE VARIANTS MUST USE THE SAME PHASE LOCK.
 *
 * Keys are the integer index k, stable across spacing changes, so a dot that
 * survives a drag animates rather than being torn down and rebuilt.
 */
export function dotField({ windowX, windowPx, stepPx, stripWidth }) {
  if (!(stepPx > 0)) return [];
  const first = windowX + stepPx / 2;
  // Above ~spacing 144 at the 224px floor the natural range holds fewer than
  // two dots, and the bracket — which grips a PAIR — would stop drawing over
  // the top third of the locked range. Force-include the pair straddling the
  // strip centre; the off-strip one is clipped by the viewBox and the mark
  // draws itself truncated, with the carets it already has.
  const kC = Math.floor((stripWidth / 2 - first) / stepPx);
  const kLo = Math.min(Math.ceil((-STRIP_PAD - first) / stepPx), kC);
  const kHi = Math.min(
    kLo + MAX_DOTS,
    Math.max(Math.floor((stripWidth + STRIP_PAD - first) / stepPx), kC + 1),
  );
  const out = [];
  for (let k = kLo; k <= kHi; k++) {
    const x = first + k * stepPx;
    out.push({ k, x, inWindow: x >= windowX - 0.01 && x < windowX + windowPx - 0.01 });
  }
  return out;
}

/** The adjacent PAIR the bracket grips: the two dots straddling the centre. */
export function gripPair(dots, centreX) {
  if (dots.length < 2) return null;
  let best = 0;
  for (let i = 0; i < dots.length - 1; i++) {
    const mid = (dots[i].x + dots[i + 1].x) / 2;
    if (Math.abs(mid - centreX) < Math.abs((dots[best].x + dots[best + 1].x) / 2 - centreX)) best = i;
  }
  return [dots[best], dots[best + 1]];
}

/* -------------------------------------------------------------- primitives */

/** Width of the strip, honestly measured. `width === 0` means "not yet". */
export function useMeasuredWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => setWidth(el.getBoundingClientRect().width);
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * The numeral. Locked: DragNumber untouched, `geometric` in both states, and
 * in DENSITY state it holds DENSITY as its own `value` with a deliberately
 * transparent step of 0.001 — its quantization must not fight the spacing grid
 * (decision 8). aria-label and aria-valuetext swap with the state for free,
 * because `label` and `format` are what feed them.
 */
export function AnchorDragNumber({ unit, spacing, onSpacing }) {
  // ONE slot width across both states: "512 u" and "0.20 /100u" must not
  // reflow row one, because the flip is the interaction being judged.
  const slotWidth = "9ch";
  if (unit === "spacing") {
    return (
      <DragNumber
        value={spacing}
        min={MIN_SPACING}
        max={MAX_SPACING}
        step={1}
        mapping="geometric"
        label={`Anchor spacing, units between anchors${isAtFloor(spacing) ? ", at minimum" : ""}`}
        format={(v) => `${v} u`}
        parse={parseLeading}
        // No rounding here on purpose. DragNumber's own snap already lands on
        // the integer grid at step 1, and decision 8 allows the system exactly
        // ONE rounding — the 100/d one in the density branch below.
        onChange={onSpacing}
        slotWidth={slotWidth}
        testId="pitch-drag-number"
        title="Drag ↕ · click to type · Shift coarse · Option fine"
      />
    );
  }
  return (
    <DragNumber
      value={densityOf(spacing)}
      min={MIN_DENSITY}
      max={MAX_DENSITY}
      step={0.001}
      mapping="geometric"
      label="Anchor density, anchors per 100 units"
      format={(v) => `${formatDensity(v)} /100u`}
      parse={parseLeading}
      // The only rounding. Every drag frame lands on the spacing grid here.
      onChange={(d) => onSpacing(spacingFromDensity(d))}
      slotWidth={slotWidth}
      testId="pitch-drag-number"
      title="Drag ↕ · click to type · Shift coarse · Option fine"
    />
  );
}

/** Decision 5's badge. Reserves its box before the first measurement so it
 *  cannot say "not to scale" on mount and then flip. */
export function ScaleBadge({ toScale, measured }) {
  return (
    <span
      data-testid="pitch-scale-badge"
      className={[
        "shrink-0 rounded-xs border px-1 py-px text-2xs",
        measured ? "" : "invisible",
        toScale ? "border-hairline text-ink-soft" : "border-hairline bg-muted text-ink-soft",
      ].join(" ")}
      title={
        toScale
          ? "The 100-unit window fits the strip, so the dots are at true canvas scale."
          : "The 100-unit window is wider than the strip at this zoom, so it is compressed to fit."
      }
    >
      {toScale ? "to scale" : "not to scale"}
    </span>
  );
}

/**
 * Row one, locked by decision 10: label + DragNumber + badge. Row two (the
 * graphic) is what the three variants disagree about, so it stays with them.
 * The label says ANCHORS — never glyphs; rests, skips and no-fit rejections
 * leave anchors carrying no glyph.
 */
export function PitchRowOne({ unit, spacing, onSpacing, toScale, measured }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-2xs uppercase tracking-wide text-ink-soft">Anchors</span>
      <AnchorDragNumber unit={unit} spacing={spacing} onSpacing={onSpacing} />
      <span className="flex-1" />
      <ScaleBadge toScale={toScale} measured={measured} />
    </div>
  );
}

/** The click target. A real button whose name carries unit AND action. */
export function GraphicButton({ unit, spacing, onFlip, children, reduced }) {
  return (
    <button
      type="button"
      data-testid="pitch-graphic"
      onClick={onFlip}
      aria-label={graphicLabel(unit, spacing)}
      title={unit === "spacing" ? "Showing spacing — click for density" : "Showing density — click for spacing"}
      data-reduced-motion={reduced ? "true" : undefined}
      className="block w-full rounded-sm outline-none hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-violet"
    >
      {children}
    </button>
  );
}

/** Decision 7 made legible: which way the dots move when you drag UP. */
export function PolarityCaption({ unit }) {
  return (
    <p className="text-2xs text-ink-soft" data-testid="pitch-polarity">
      {unit === "spacing" ? (
        <>
          Drag <span className="text-ink">up</span> → bigger number → gaps <span className="text-ink">widen</span>
        </>
      ) : (
        <>
          Drag <span className="text-ink">up</span> → bigger number → dots <span className="text-ink">crowd</span>
        </>
      )}
    </p>
  );
}

/** Visually-hidden polite announcement of the flip (decision 9). */
export function FlipLiveRegion({ message }) {
  return (
    <span aria-live="polite" className="sr-only" data-testid="pitch-live">
      {message}
    </span>
  );
}

/* ---------------------------------------------------------- shared drawing */

/** Hatched wedge used by every variant to draw the 4-unit floor. */
export function FloorHatch({ id }) {
  return (
    <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink-soft)" strokeWidth="0.8" opacity="0.5" />
    </pattern>
  );
}

/** Dot motion: never tweened under reduced motion — the dots JUMP, and every
 *  variant additionally carries a live numeral ON the mark so the information
 *  never lives in the motion (decision 11). Never keyed to `unit`: flipping
 *  the unit moves no dots at all. */
export function dotTransition(reduced) {
  return reduced ? "none" : "transform var(--motion-medium) var(--ease-out-quint)";
}

export function markTransition(reduced) {
  return reduced ? "none" : "opacity var(--motion-fast) linear";
}
