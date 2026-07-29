// PitchRuler — the anchor-pitch graphic, variant A "Ruler / drafting"
// (decision 13). Production rewrite of the prototype on
// `proto/pitch-control-graphic`; its geometry and its measured findings carry
// across, its prototype liberties do not.
//
// ── THE BET ────────────────────────────────────────────────────────────────
// This is a plotter/laser tool, so the strip reads as a TECHNICAL DRAWING and
// borrows the authority of the conventions its users already read. The baseline
// is a literal measuring rule with a decade-stepping unit scale; the density
// mark is a shaded span across that rule; the spacing mark is a proper
// dimension line — extension lines, slanted end serifs, a value on a leader.
// The `MIN_EDGE_SPACING` floor is drawn the way a drawing draws a limit: a
// hatched ghost dimension of the smallest legal gap beside the live one.
//
// ── NOT A CONTROL ──────────────────────────────────────────────────────────
// Ruling B. `aria-hidden`, no role, no accessible name, no hover or focus
// affordance. It illustrates a value that the toggle and the numeral both state
// in text; exposing it to the accessibility tree would only duplicate them.
//
// ── THE NUMERAL ON THE MARK IS LOAD-BEARING TWICE ──────────────────────────
// Decision 11 (reduced motion: the information must never live in the motion)
// and decision 14 (above spacing ~100 the window holds ZERO dots, and the mark
// reads "0.20 / in 100 u" over empty ground — a true sentence you can act on).
// ⚠️ MOVE THE NUMERAL OFF THE MARK AND BOTH BREAK, SILENTLY.
//
// ── THE DOTS ARE SCHEMATIC ─────────────────────────────────────────────────
// Decision 4. No `resolvePlacements`, no host read, no per-frame resample —
// this control never touches a placement. `sampleEdgeAnchors` arc-length-
// resamples, so on any single host path the real anchors are pixel-identical to
// these; "real" would only buy the rest/skip story, which the footprint overlay
// already draws on the canvas at real size.
import { useEffect, useId, useState } from "react";
import {
  MIN_SPACING,
  WINDOW_UNITS,
  computeStripGeometry,
  densityOf,
  dotField,
  formatDensity,
  gripPair,
  isAtFloor,
  tickUnit,
  STRIP_PAD,
} from "../../lib/motif/pitchUnits";

/* --------------------------------------------------------------- drawing */

const H = 54; // svg height
const BASE = 34; // the rule, and the line the dots sit on
const DIM_Y = 17; // the dimension line
const TICK_MINOR = 38;
const TICK_MAJOR = 41;
const NUM_Y = 50;
/** Majors every fifth minor; numerals only when the majors are ≥30px apart. */
const MAJOR_EVERY = 5;
const NUMERAL_MIN_PX = 30;
/** Below this the window is too narrow to hold the numeral and its unit line. */
const NUMERAL_INSIDE_MIN_PX = 46;
/** Below this the dimension value sits beside the line rather than over it. */
const INLINE_LABEL_MAX_PX = 40;
/** Hard cap on the tick loop — a guard, not a design limit. */
const MAX_TICKS = 240;

/**
 * Read once per mount and kept live. `DragNumber` reads the same query only at
 * mount (a known inherited limitation there); this one subscribes, because the
 * graphic has no other reason to re-render and the subscription is free.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return undefined;
    }
    const on = () => setReduced(mq.matches);
    on();
    if (mq.addEventListener) {
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }
    if (mq.addListener) {
      mq.addListener(on);
      return () => mq.removeListener(on);
    }
    return undefined;
  }, []);
  return reduced;
}

/** Dots JUMP under reduced motion (decision 11) — never keyed to `unit`, so a
 *  unit flip moves no dot at all. That stillness IS the proof that the toggle
 *  writes nothing. */
const dotTransition = (reduced) =>
  reduced ? "none" : "transform var(--motion-medium) var(--ease-out-quint)";

/** The two marks cross-fade. Opacity only — nothing moves, nothing resizes. */
const markTransition = (reduced) => (reduced ? "none" : "opacity var(--motion-fast) linear");

/**
 * @param {object} props
 * @param {'density'|'spacing'} props.unit  which mark is live.
 * @param {number} props.spacing            the stored value.
 * @param {number} props.stripWidth         measured px. 0 ⇒ draw nothing yet.
 */
export default function PitchRuler({ unit, spacing, stripWidth }) {
  const reduced = usePrefersReducedMotion();
  const hatchId = `pitch-floor-hatch-${useId()}`;

  const width = Number.isFinite(stripWidth) ? stripWidth : 0;
  const geo = computeStripGeometry({ spacing, stripWidth: width });
  const dots = dotField({ ...geo, stripWidth: width });
  const pair = gripPair(dots, width / 2);
  const density = densityOf(spacing);
  const atFloor = isAtFloor(spacing);

  const left = STRIP_PAD;
  const right = Math.max(STRIP_PAD, width - STRIP_PAD);

  /* ------------------------------------------------------------- ticks */
  const minor = tickUnit(geo.pxPerUnit);
  const minorPx = minor * geo.pxPerUnit;
  const showNumerals = minorPx * MAJOR_EVERY >= NUMERAL_MIN_PX;
  const ticks = [];
  if (geo.measured && minorPx > 0) {
    // Zeroed on the WINDOW's left edge, so the scale reads against the thing
    // being measured rather than against the strip's arbitrary padding.
    const kLo = Math.ceil((left - geo.windowX) / minorPx);
    const kHi = Math.floor((right - geo.windowX) / minorPx);
    for (let k = kLo; k <= kHi && ticks.length < MAX_TICKS; k++) {
      ticks.push({ k, x: geo.windowX + k * minorPx, major: k % MAJOR_EVERY === 0 });
    }
  }

  /* ------------------------------------------- the dimension line's span */
  // The gripped gap can be wider than the whole strip at the sparse end. The
  // drawing never rescales to make a value fit (decision 5's surviving rule):
  // it clamps the line to the strip and puts a caret on the edge it runs off,
  // which is the notation a drawing already uses for "continues past here".
  const a = pair ? Math.max(pair[0].x, left) : 0;
  const b = pair ? Math.min(pair[1].x, right) : 0;
  const runsOffL = pair ? pair[0].x < left - 0.5 : false;
  const runsOffR = pair ? pair[1].x > right + 0.5 : false;
  const labelInline = b - a < INLINE_LABEL_MAX_PX;
  const markInk = atFloor ? "var(--saffron)" : "var(--ink)";

  const floorPx = Math.max(3, MIN_SPACING * geo.pxPerUnit);
  const numeralInside = geo.windowPx >= NUMERAL_INSIDE_MIN_PX;

  // Nothing honest to draw before the strip has been laid out. A guessed width
  // would put the marks somewhere they would then jump away from.
  if (!geo.measured) {
    return <div data-testid="motif-pitch-graphic" data-measured="false" aria-hidden="true" />;
  }

  return (
    <div
      data-testid="motif-pitch-graphic"
      data-measured="true"
      data-unit={unit}
      data-reduced-motion={reduced ? "true" : undefined}
      aria-hidden="true"
      className="block w-full"
    >
      <svg width="100%" height={H} viewBox={`0 0 ${Math.max(1, width)} ${H}`} focusable="false">
        <defs>
          <pattern
            id={hatchId}
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--ink-soft)" strokeWidth="0.8" opacity="0.5" />
          </pattern>
        </defs>

        {/* ------------------------------------------------- the rule */}
        <line x1={left} y1={BASE} x2={right} y2={BASE} stroke="var(--hairline)" strokeWidth="1" />
        {ticks.map((t) => (
          <line
            key={t.k}
            x1={t.x}
            y1={BASE}
            x2={t.x}
            y2={t.major ? TICK_MAJOR : TICK_MINOR}
            stroke="var(--hairline)"
            strokeWidth={t.major ? 1 : 0.7}
          />
        ))}
        {showNumerals &&
          ticks
            .filter((t) => t.major)
            .map((t) => (
              <text
                key={`n${t.k}`}
                x={t.x}
                y={NUM_Y}
                textAnchor="middle"
                fontSize="8"
                fill="var(--ink-soft)"
                className="num"
              >
                {t.k * minor}
              </text>
            ))}

        {/* ---------------------------------- DENSITY — the shaded span */}
        {/* A window exactly WINDOW_UNITS wide, at every value, forever
            (decision 2). The number in the field counts the dots inside it. */}
        <g
          data-testid="motif-pitch-density-mark"
          style={{ opacity: unit === "density" ? 1 : 0, transition: markTransition(reduced) }}
        >
          <rect
            x={geo.windowX}
            y={12}
            width={geo.windowPx}
            height={BASE - 12}
            fill="var(--saffron)"
            opacity="0.14"
          />
          <line x1={geo.windowX} y1={12} x2={geo.windowX} y2={BASE} stroke="var(--saffron)" strokeWidth="1" />
          <line
            x1={geo.windowX + geo.windowPx}
            y1={12}
            x2={geo.windowX + geo.windowPx}
            y2={BASE}
            stroke="var(--saffron)"
            strokeWidth="1"
          />
          <line
            x1={geo.windowX}
            y1={12}
            x2={geo.windowX + geo.windowPx}
            y2={12}
            stroke="var(--saffron)"
            strokeWidth="1"
          />
          {/* ⚠️ THE LIVE COUNT, ON THE MARK. Load-bearing twice — see the file
              header. Do not move it off the mark. */}
          <text
            data-testid="motif-pitch-density-numeral"
            x={geo.windowX + geo.windowPx / 2}
            y={numeralInside ? 25 : 9}
            textAnchor="middle"
            fontSize="10"
            fill="var(--ink)"
            className="num"
          >
            {formatDensity(density)}
          </text>
          {numeralInside && (
            <text
              x={geo.windowX + geo.windowPx / 2}
              y={9}
              textAnchor="middle"
              fontSize="7.5"
              fill="var(--ink-soft)"
            >
              in {WINDOW_UNITS} u
            </text>
          )}
          {/* The floor is a SPACING limit, so in density state it has to be
              said out loud — otherwise the numeral just stops at 25.0 and the
              control has silently clamped, which is the thing §4e forbids. */}
          {atFloor && (
            <text
              x={geo.windowX + geo.windowPx - 3}
              y={BASE - 3}
              textAnchor="end"
              fontSize="7.5"
              fill="var(--saffron)"
              className="num"
            >
              at min gap {MIN_SPACING} u
            </text>
          )}
        </g>

        {/* --------------------------------- SPACING — the dimension line */}
        <g
          data-testid="motif-pitch-spacing-mark"
          style={{ opacity: unit === "spacing" ? 1 : 0, transition: markTransition(reduced) }}
        >
          {pair && (
            <>
              <line x1={a} y1={BASE - 5} x2={a} y2={DIM_Y - 4} stroke="var(--hairline)" strokeWidth="0.8" />
              <line x1={b} y1={BASE - 5} x2={b} y2={DIM_Y - 4} stroke="var(--hairline)" strokeWidth="0.8" />
              <line x1={a} y1={DIM_Y} x2={b} y2={DIM_Y} stroke={markInk} strokeWidth="1" />
              {/* Slanted end serifs — the drafting convention. Replaced by a
                  caret on whichever edge the gap runs off (§7c). */}
              {!runsOffL && (
                <line x1={a - 3} y1={DIM_Y + 3.5} x2={a + 3} y2={DIM_Y - 3.5} stroke={markInk} strokeWidth="1" />
              )}
              {!runsOffR && (
                <line x1={b - 3} y1={DIM_Y + 3.5} x2={b + 3} y2={DIM_Y - 3.5} stroke={markInk} strokeWidth="1" />
              )}
              {runsOffL && (
                <path
                  data-testid="motif-pitch-caret-left"
                  d={`M${a + 7},${DIM_Y - 4} L${a},${DIM_Y} L${a + 7},${DIM_Y + 4}`}
                  fill="none"
                  stroke="var(--ink-soft)"
                  strokeWidth="1"
                />
              )}
              {runsOffR && (
                <path
                  data-testid="motif-pitch-caret-right"
                  d={`M${b - 7},${DIM_Y - 4} L${b},${DIM_Y} L${b - 7},${DIM_Y + 4}`}
                  fill="none"
                  stroke="var(--ink-soft)"
                  strokeWidth="1"
                />
              )}
              {/* The value on its leader — the same "numeral on the mark"
                  construct the density span uses, for the same two reasons. */}
              <text
                data-testid="motif-pitch-spacing-numeral"
                x={labelInline ? b + 5 : (a + b) / 2}
                y={labelInline ? DIM_Y + 3 : DIM_Y - 4}
                textAnchor={labelInline ? "start" : "middle"}
                fontSize="10"
                fill={markInk}
                className="num"
              >
                {spacing} u
              </text>
            </>
          )}
          {/* THE FLOOR, DRAWN THE WAY A DRAWING DRAWS A LIMIT: a hatched ghost
              dimension of the smallest legal gap, sitting beside the live one.
              Shown always, lit when the value is on it — the control must SHOW
              MIN_EDGE_SPACING rather than silently clamp and let the number
              lie (hold-doc §4e). */}
          <g data-testid="motif-pitch-floor" data-at-floor={atFloor ? "true" : "false"}>
            <rect x={left} y={DIM_Y + 6} width={floorPx} height={5} fill={`url(#${hatchId})`} />
            <line
              x1={left}
              y1={DIM_Y + 5}
              x2={left + floorPx}
              y2={DIM_Y + 5}
              stroke={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
              strokeWidth={atFloor ? 1.2 : 0.8}
              opacity={atFloor ? 1 : 0.55}
            />
            <text
              x={left + floorPx + 3}
              y={DIM_Y + 9}
              fontSize="7.5"
              fill={atFloor ? "var(--saffron)" : "var(--ink-soft)"}
              opacity={atFloor ? 1 : 0.7}
              className="num"
            >
              {atFloor ? `at min ${MIN_SPACING} u` : `min ${MIN_SPACING}`}
            </text>
          </g>
        </g>

        {/* ------------------------------------------------ anchor dots */}
        {/* Keyed by the integer index, so a dot that survives a spacing change
            animates instead of being torn down and rebuilt. */}
        {dots.map((d) => {
          const lit =
            unit === "density" ? d.inWindow : pair != null && (d.k === pair[0].k || d.k === pair[1].k);
          return (
            <g key={d.k} style={{ transform: `translateX(${d.x}px)`, transition: dotTransition(reduced) }}>
              <circle
                cx={0}
                cy={BASE}
                r={lit ? 2.6 : 2}
                fill={lit ? "var(--saffron)" : "var(--ink)"}
                opacity={lit ? 1 : 0.55}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
