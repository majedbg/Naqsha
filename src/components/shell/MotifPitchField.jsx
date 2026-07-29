// MotifPitchField — the ANCHOR-PITCH control (PRD #184, PR 2). Spec of record
// `docs/pitch-control-BUILD-SPEC.md`, over `docs/pitch-control-graphic-
// decisions.md` and `docs/motif-hold-and-pitch-decisions.md` §8b.
//
// Writes `motif.params.edgeOpts.spacing` — the one number in the placement
// pipeline that had no writer anywhere until now. Two units apart to the eye
// pixel, one number on disk.
//
//   ┌─ 224px rail floor ───────────────┐
//   │ ◆ 24          Density | Spacing  │  row 1: DragNumber + UnitToggle
//   │ ┌────────────────────────────┐   │  row 2: the ruler graphic
//   │ │ • • • • • │ • • • • • • •  │   │
//   │ └────────────────────────────┘   │
//   │ → anchor gaps widen              │  caption
//   └──────────────────────────────────┘
//
// ── THE THREE GESTURES, THREE TARGETS ──────────────────────────────────────
// `useDragValue` exposes exactly ONE `onClick` slot and `DragNumber` already
// spends it on type-in, so the graphic cannot also be the switch. Sibling
// resolves it: drag the thumb → change the value; click the numeral → type it
// in; pick a radio → change the unit. `DragNumber` and `useDragValue` are
// untouched by this file except through props (decision 3).
//
// ── THE GRAPHIC IS NOT A CONTROL ───────────────────────────────────────────
// Ruling B. A plain `aria-hidden` illustration: no click, no button role, no
// accessible name, no `aria-live` flip announcement. The toggle is a real
// radiogroup and carries all of it natively, which is a straight upgrade on a
// `<button>` whose accessible name had to narrate its own state.
//
// ── THE 9ch SLOT IS LOAD-BEARING ───────────────────────────────────────────
// "512 u" and "0.20 /100u" must not reflow row one, because the stillness of
// the flip is the proof that the toggle writes nothing. The eyebrow label that
// used to sit on this row is GONE for the same arithmetic (ruling D): at the
// 224px floor, eyebrow 49 + gaps 11 + numeral 88 leaves 76px against a
// ~101px toggle, and "Density"/"Spacing" are 37 and 40px of bare glyphs. The
// three terms are jointly unsatisfiable, so decision 4's "say ANCHORS, never
// glyphs" requirement moved down into the caption.
//
// ── WHAT IS NOT WIRED, AND WHY ─────────────────────────────────────────────
// ⚠️ THE FOOTPRINT REVEAL TRIGGER IS ABSENT. Decision 18 lists spacing/density
// as the fifth trigger and `useFootprintRevealTrigger` is ready for it, but
// issue #196 — "what should a LAYER-scope footprint reveal draw?" — is still
// open, and the build spec gates this part on it explicitly: "if #196 is still
// open, ship without the trigger rather than guessing". Wiring it is
// `useFootprintRevealTrigger({ kind: 'layer', layerId })` with BOTH
// `pointerProps` (on the row) and `focusProps` (on the field, or the control is
// unreachable by keyboard). Nothing else in this file has to change.
import { useEffect, useRef, useState } from "react";
import DragNumber from "../ui/DragNumber";
import UnitToggle from "../ui/UnitToggle";
import useGestureFlush from "./gestureFlush";
import {
  DENSITY_STEP,
  MAX_DENSITY,
  MAX_SPACING,
  MIN_DENSITY,
  MIN_SPACING,
  UNIT_OPTIONS,
  densityOf,
  formatDensity,
  isAtFloor,
  parseLeading,
  spacingFromDensity,
} from "../../lib/motif/pitchUnits";
import PitchRuler from "./PitchRuler";

/** One slot width across both states — see the note above. */
const SLOT_WIDTH = "9ch";

const DRAG_TITLE = "Drag ↕ · click to type · Shift coarse · Option fine";
const SEMANTIC_TITLE =
  "Off on this host · its anchors are count-based, so it owns its own spacing";

/**
 * The numeral. `DragNumber` holds SPACING in spacing state and DENSITY in
 * density state — decision 7 locked "up-drag raises the number in BOTH", and
 * `useDragValue` always increases its own `value` on an up-drag with no
 * inversion prop, so the held quantity has to be whichever one is shown.
 *
 * `aria-label` and `aria-valuetext` swap with the state for free, because
 * `label` and `format` are what feed them.
 */
// ⚠️ BOTH BRANCHES MUST RETURN A BARE `<DragNumber>` AT THIS SAME POSITION.
// React then reconciles them as ONE instance across a unit flip, which is what
// lets `flashSignal` see a change at all. Wrap either branch and the instance
// remounts, the flash latch re-seeds from the new value, and the glow silently
// stops happening — the one signal that covers the spacing-10 case, where the
// numeral is byte-identical across the flip. A test pins it.
function PitchNumeral({ unit, spacing, disabled, onLive, onCommit }) {
  const atFloor = isAtFloor(spacing);
  const title = disabled ? SEMANTIC_TITLE : DRAG_TITLE;

  if (unit === "spacing") {
    return (
      <DragNumber
        value={spacing}
        min={MIN_SPACING}
        max={MAX_SPACING}
        step={1}
        mapping="geometric"
        label={`Anchor spacing, units between anchors${atFloor ? ", at minimum" : ""}`}
        format={(v) => `${v} u`}
        parse={parseLeading}
        // NO ROUNDING HERE, on purpose. DragNumber's own snap already lands on
        // the integer grid at step 1, and decision 8 allows the system exactly
        // ONE rounding — the 100/d one in the density branch below.
        onChange={onLive}
        onCommit={onCommit}
        flashSignal={unit}
        disabled={disabled}
        slotWidth={SLOT_WIDTH}
        testId="motif-pitch-number"
        title={title}
      />
    );
  }
  return (
    <DragNumber
      value={densityOf(spacing)}
      min={MIN_DENSITY}
      max={MAX_DENSITY}
      // Deliberately transparent: if this quantized on the DENSITY scale it
      // would fight the spacing grid — the number would jump to one value, the
      // parent snap it to another, and the readout show a third.
      step={DENSITY_STEP}
      mapping="geometric"
      // ⚠️ THE FLOOR MUST BE ANNOUNCED IN THIS STATE TOO. It is a SPACING
      // limit, so in density state the numeral simply stops at 25.0 with no
      // reason given. The graphic says "at min gap 4 u" — but the graphic is
      // `aria-hidden`, so without this suffix the control clamps silently for
      // anyone not looking at it, which is the "let the number lie" failure
      // hold-doc §4e forbids, arriving through the a11y channel instead.
      label={`Anchor density, anchors per 100 units${atFloor ? ", at maximum — the 4 unit minimum gap" : ""}`}
      format={(v) => `${formatDensity(v)} /100u`}
      parse={parseLeading}
      // THE ONLY ROUNDING. Every drag frame lands on the spacing grid here.
      onChange={(d) => onLive(spacingFromDensity(d))}
      onCommit={(d) => onCommit(spacingFromDensity(d))}
      flashSignal={unit}
      disabled={disabled}
      slotWidth={SLOT_WIDTH}
      testId="motif-pitch-number"
      title={title}
    />
  );
}

/**
 * Decision 7 made legible: which way the dots move when you drag UP.
 *
 * Also the row that says ANCHORS — never glyphs (decision 4), since the eyebrow
 * gave up its place on row one to the toggle. Rests, weighted deals,
 * junction-skips and `no-fit` rejections all leave anchors carrying no glyph,
 * so at Spacing 24 with a two-slot sequence where one is a Rest the real
 * glyph-to-glyph distance is 48. The label must not promise otherwise.
 */
function PolarityCaption({ unit }) {
  return (
    <p className="text-2xs text-ink-soft" data-testid="motif-pitch-caption">
      {unit === "spacing" ? (
        <>
          Drag <span className="text-ink">up</span> → bigger number → anchor gaps{" "}
          <span className="text-ink">widen</span>
        </>
      ) : (
        <>
          Drag <span className="text-ink">up</span> → bigger number → anchors{" "}
          <span className="text-ink">crowd</span>
        </>
      )}
    </p>
  );
}

/**
 * @param {object} props
 * @param {number} props.spacing       the stored `edgeOpts.spacing`.
 * @param {(next:number) => void} props.onChangeSpacing  live, every grid crossing.
 * @param {() => void} [props.onFlushHistory]  closes the undo-coalescing window.
 * @param {boolean} [props.disabled]   semantic host — inert, and says so.
 * @param {number} [props.stripWidth]  explicit graphic width. The measurement
 *   seam, same shape as `InspectorShelf`: production measures, tests pass a
 *   width and bypass the observer entirely.
 */
export default function MotifPitchField({
  spacing,
  onChangeSpacing,
  onFlushHistory = () => {},
  disabled = false,
  stripWidth,
}) {
  // THE UNIT IS LOCAL, EPHEMERAL STATE. It is a reading preference, not a
  // property of the document: persisting it would put a chrome concern into the
  // layer params, where undo, serialization and the plotter pipeline would all
  // need an opinion about it.
  const [unit, setUnit] = useState("spacing");

  // Production measurement seam. Guarded so jsdom (no ResizeObserver) never
  // crashes; an explicit `stripWidth` wins and needs no observer at all.
  const stripRef = useRef(null);
  const [measured, setMeasured] = useState(0);
  useEffect(() => {
    if (stripWidth != null) return undefined;
    const el = stripRef.current;
    if (!el) return undefined;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      setMeasured((prev) => (prev === w ? prev : w));
    };
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stripWidth]);
  const effectiveWidth = stripWidth != null ? stripWidth : measured;

  const gesture = useGestureFlush(onFlushHistory);
  // A drag: open on the first live frame, close on commit. Same seam as the
  // slot card's rows, so a pitch drag is one undo entry like every other.
  const onLive = (next) => {
    gesture.begin();
    onChangeSpacing(next);
  };
  const onCommit = (next) => {
    onChangeSpacing(next);
    gesture.end();
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid="motif-pitch">
      <div className="flex items-center gap-1.5">
        <PitchNumeral
          unit={unit}
          spacing={spacing}
          disabled={disabled}
          onLive={onLive}
          onCommit={onCommit}
        />
        <span className="flex-1" />
        <UnitToggle options={UNIT_OPTIONS} value={unit} onChange={setUnit} label="Pitch unit" />
      </div>

      <div ref={stripRef} className="w-full">
        <PitchRuler unit={unit} spacing={spacing} stripWidth={effectiveWidth} />
      </div>

      <PolarityCaption unit={unit} />
      {disabled && (
        <p className="text-2xs text-ink-soft" data-testid="motif-pitch-inert">
          This host places its own anchors by count, so spacing does not reach it.
        </p>
      )}
    </div>
  );
}
