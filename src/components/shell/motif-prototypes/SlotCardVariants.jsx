/* eslint-disable react-refresh/only-export-components -- prototype: mixed
   data+component exports are fine here, HMR full-reload is acceptable. */
// ============================================================================
// PROTOTYPE — THROWAWAY CODE. Do not ship, do not test, do not extend.
//
// Question this round answers: the grilled decisions in
// docs/motif-slot-card-decisions.md put SIX controls inside one ~124px
// sequencer slot chip — eye · grip · "…" header, glyph thumb, weight, scale%
// + flip, rotation + angle-rnd, and a disclosed range + spread row. On paper
// that is a mixer channel. It could equally be a mess. Three structurally
// different arrangements of the SAME settled control set, judged at the real
// inspector-rail width with the REAL DragNumber / DragDial / Menu primitives:
//
//   A — Popover port   one control per row, hairline dividers, chip chrome
//                      lifted verbatim from GlyphPopover. Chips size
//                      independently, so a rest chip is short.
//   B — Gutter         no dividers; values own the full row width and the two
//                      modifier icons (flip, angle-rnd) stack in a fixed
//                      right-hand lane. Rotation is a SIGNED NUMBER, not a
//                      dial — testing whether an offset wants a compass.
//   C — Mixer channel  every chip reserves every row on a shared grid, so
//                      scale/rotation align horizontally ACROSS the strip and
//                      a leading ruler column labels them once. The sequence
//                      reads like channel strips.
//
// Every variant renders the same five mock slots: active · tuned · pure rest ·
// HIDDEN (rest:true with glyphRef kept — decision 4) · active.
//
// All state is local. Nothing writes to layers, undo, or persistence. The live
// slot array is printed under the strip so every gesture's effect is visible.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import DragDial from "../../ui/DragDial";
import DragNumber from "../../ui/DragNumber";
import GlyphThumb from "../../ui/GlyphThumb";
import Menu from "../../ui/Menu";
import { MOTIF_GLYPHS } from "../../../lib/motif/glyphs";
import {
  SCALE_FORMAT,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_PARSE,
  SCALE_STEP,
} from "../../canvas/glyphPopoverPlacement";

/* ------------------------------------------------------------------ state */

export const SLOT_VARIANTS = ["A", "B", "C"];
export const SLOT_VARIANT_NAMES = {
  A: "Popover port",
  B: "Gutter",
  C: "Mixer channel",
};

// Five slots covering every state the strip has to draw. ORDERED so the three
// DIFFERENT renderings — tuned, hidden, pure rest — are the three that fit in
// the rail without scrolling; the two plain actives sit past the fold, where
// they cost nothing to miss.
const INITIAL_SLOTS = [
  {
    id: 1,
    glyphRef: "leaf",
    sizeScale: 1.4,
    rotationOffset: 180,
    flip: true,
    weight: 1.5,
    rotationRandom: { range: 30, spread: "flat" },
  },
  {
    id: 2,
    glyphRef: "diamond",
    rest: true, // HIDDEN: rest with its glyphRef kept
    sizeScale: 0.75,
    rotationOffset: 45,
    weight: 1,
  },
  { id: 3, rest: true, weight: 1 }, // a PURE rest — no glyphRef, nothing to un-hide
  { id: 4, glyphRef: "rosette", sizeScale: 1, rotationOffset: 0, weight: 1 },
  { id: 5, glyphRef: "dot", sizeScale: 1, rotationOffset: 0, weight: 2 },
];

let nextId = 100;

// The whole prototype's document. `patch` is the shape chainEditor.setSlot
// takes; `flush` is where the real thing would call flushEdit() to bound an
// undo entry — here it just counts, so the gesture bookkeeping is visible.
export function useMockSlots() {
  const [slots, setSlots] = useState(INITIAL_SLOTS);
  const [mode, setMode] = useState("cycle");
  const [flushes, setFlushes] = useState(0);
  const [previews, setPreviews] = useState(0);

  const patch = (id, p, { preview = false } = {}) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...p } : s)));
    if (preview) setPreviews((n) => n + 1);
  };
  const flush = () => setFlushes((n) => n + 1);
  const remove = (id) => setSlots((prev) => prev.filter((s) => s.id !== id));
  const duplicate = (id) =>
    setSlots((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i < 0) return prev;
      const copy = { ...prev[i], id: (nextId += 1) };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  const reset = (id) =>
    patch(id, {
      sizeScale: 1,
      rotationOffset: 0,
      flip: undefined,
      rotationRandom: undefined,
      weight: 1,
    });

  return {
    slots, mode, setMode, flushes, previews,
    patch, flush, remove, duplicate, reset,
  };
}

const isHidden = (s) => s.rest === true && !!s.glyphRef;
const isPureRest = (s) => s.rest === true && !s.glyphRef;
const glyphFor = (s) => MOTIF_GLYPHS[s.glyphRef] || null;

/* ------------------------------------------------------------------ icons */

function EyeIcon({ open }) {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg width="10" height="13" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
      {[4, 7, 10].map((cy) => (
        <g key={cy}>
          <circle cx="3.5" cy={cy} r="0.9" />
          <circle cx="6.5" cy={cy} r="0.9" />
        </g>
      ))}
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

// FLIP — a mirror axis with a solid leaf-ish wedge on the left and a hollow one
// on the right, so the icon itself shows the reflection it performs.
// Three states, drawn not just tinted: inherit is the whole mark at half
// opacity; flipped fills BOTH wedges; never-flip strikes the axis through.
function FlipIcon({ state }) {
  // FILL, not opacity, carries the state — two wedges outlined at 14px read as
  // a different mark from two wedges filled, where a 45% tint of the same mark
  // just reads as "disabled".
  const fill = state === "on" ? "currentColor" : "none";
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor">
      <line x1="8" y1="1.5" x2="8" y2="14.5" strokeWidth="1" strokeDasharray="2 1.6" />
      <path d="M6.2 3.6 1.8 8l4.4 4.4z" fill={fill} strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M9.8 3.6 14.2 8l-4.4 4.4z" fill={fill} strokeWidth="1.1" strokeLinejoin="round" />
      {state === "off" && <line x1="2" y1="14" x2="14" y2="2" strokeWidth="1.5" />}
    </svg>
  );
}

// ANGLE RANDOMISATION — three ticks fanning out of one root. Off, they are
// parallel (every glyph the same); on, they splay.
function AngleRndIcon({ on }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      {on ? (
        <>
          <line x1="8" y1="14" x2="4" y2="4.5" />
          <line x1="8" y1="14" x2="8" y2="3" />
          <line x1="8" y1="14" x2="12" y2="4.5" />
        </>
      ) : (
        <>
          <line x1="4.5" y1="14" x2="4.5" y2="4" />
          <line x1="8" y1="14" x2="8" y2="4" />
          <line x1="11.5" y1="14" x2="11.5" y2="4" />
        </>
      )}
    </svg>
  );
}

// SPREAD — the two distributions drawn as their actual shapes: a flat plateau
// (uniform) and a bell (triangular, concentrated at 0).
function SpreadIcon({ kind }) {
  return (
    <svg width="16" height="12" viewBox="0 0 18 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round">
      {kind === "bell" ? (
        <path d="M1 11 L9 2 L17 11" />
      ) : (
        <path d="M1 11 L1 4 L17 4 L17 11" />
      )}
    </svg>
  );
}

/* ------------------------------------------------------------ small parts */

const ICON_BTN =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-transparent outline-none hover:border-hairline hover:bg-paper-warm hover:text-ink focus-visible:ring-2 focus-visible:ring-violet";

function EyeButton({ slot, onToggle }) {
  const hidden = isHidden(slot);
  return (
    <button
      type="button"
      title={hidden ? "Show glyph" : "Hide glyph — the beat stays empty"}
      aria-label={hidden ? "Show glyph" : "Hide glyph"}
      aria-pressed={hidden}
      onClick={onToggle}
      className={`${ICON_BTN} ${hidden ? "text-saffron" : "text-ink-soft"}`}
    >
      <EyeIcon open={!hidden} />
    </button>
  );
}

function SlotMenu({ onDuplicate, onReset, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button
        type="button"
        aria-label="Slot actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Duplicate · reset · delete"
        onClick={() => setOpen((o) => !o)}
        className={`${ICON_BTN} ${open ? "border-hairline bg-paper-warm text-ink" : "text-ink-soft"}`}
      >
        <MoreIcon />
      </button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Slot actions"
        className="absolute right-0 top-full z-50 mt-2xs min-w-[132px] rounded-sm border border-hairline bg-paper p-1 shadow-pop"
        items={[
          { label: "Duplicate slot", onActivate: onDuplicate },
          { label: "Reset settings", onActivate: onReset },
          { separator: true },
          { label: "Delete slot", onActivate: onDelete },
        ]}
      />
    </span>
  );
}

// eye · grip · "…" — identical across all three variants (the settled part).
function ChipHeader({ slot, doc }) {
  return (
    <div className="flex items-center justify-between gap-2xs">
      {isPureRest(slot) ? (
        <span className="h-5 w-5 shrink-0" />
      ) : (
        <EyeButton
          slot={slot}
          onToggle={() => {
            doc.flush();
            doc.patch(slot.id, { rest: !slot.rest });
            doc.flush();
          }}
        />
      )}
      <span
        title="Drag to reorder"
        className="flex flex-1 cursor-grab justify-center text-ink-soft/50 active:cursor-grabbing"
      >
        <GripIcon />
      </span>
      <SlotMenu
        onDuplicate={() => doc.duplicate(slot.id)}
        onReset={() => doc.reset(slot.id)}
        onDelete={() => doc.remove(slot.id)}
      />
    </div>
  );
}

// The thumbnail — tapping it opens the glyph browser (stubbed to a flash).
function ChipThumb({ slot, size = 30 }) {
  const [flash, setFlash] = useState(false);
  const glyph = glyphFor(slot);
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(false), 320);
    return () => clearTimeout(t);
  }, [flash]);
  return (
    <button
      type="button"
      title="Open the glyph browser"
      aria-label="Swap slot glyph"
      onClick={() => setFlash(true)}
      className={`flex w-full items-center justify-center rounded-xs border bg-paper-warm py-1 text-ink-soft outline-none hover:border-violet hover:text-ink focus-visible:ring-2 focus-visible:ring-violet ${
        flash ? "border-accent/60 text-ink" : "border-hairline"
      }`}
    >
      {glyph ? (
        <GlyphThumb glyph={glyph} size={size} />
      ) : (
        <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
          <circle r="6" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      )}
    </button>
  );
}

// h-9 deliberately: the same height a thumb button occupies (26px glyph + py-1
// + border). Without it a rest chip's rows sit 4px high and variant C's whole
// alignment argument collapses on the first rest.
function RestPlate() {
  return (
    <div className="flex h-9 items-center justify-center rounded-xs border border-dashed border-hairline text-2xs font-medium uppercase tracking-wider text-ink-soft/70">
      Rest
    </div>
  );
}

// Flip cycles inherit → flipped → never-flip, preserving `flipSpecified`.
const NEXT_FLIP = { undefined: true, true: false, false: undefined };
const FLIP_STATE = { undefined: "inherit", true: "on", false: "off" };
const FLIP_TITLE = {
  inherit: "Flip: inherit the layer",
  on: "Flip: always",
  off: "Flip: never (overrides the layer)",
};

function FlipToggle({ slot, doc }) {
  const state = FLIP_STATE[String(slot.flip)];
  return (
    <button
      type="button"
      title={FLIP_TITLE[state]}
      aria-label={FLIP_TITLE[state]}
      onClick={() => {
        doc.flush();
        doc.patch(slot.id, { flip: NEXT_FLIP[String(slot.flip)] });
        doc.flush();
      }}
      className={`${ICON_BTN} ${state === "inherit" ? "text-ink-soft/45" : "text-ink"}`}
    >
      <FlipIcon state={state} />
    </button>
  );
}

function AngleRndToggle({ slot, doc }) {
  const on = !!slot.rotationRandom;
  return (
    <button
      type="button"
      title={on ? "Angle randomisation on" : "Randomise each glyph's angle"}
      aria-label="Angle randomisation"
      aria-pressed={on}
      onClick={() => {
        doc.flush();
        doc.patch(slot.id, {
          rotationRandom: on ? undefined : { range: 30, spread: "flat" },
        });
        doc.flush();
      }}
      className={`${ICON_BTN} ${on ? "text-saffron" : "text-ink-soft/45"}`}
    >
      <AngleRndIcon on={on} />
    </button>
  );
}

function SpreadToggles({ slot, doc, stacked = false }) {
  const rr = slot.rotationRandom;
  return (
    <span className={`flex items-center gap-px ${stacked ? "flex-col" : ""}`}>
      {["flat", "bell"].map((k) => {
        const active = (rr.spread || "flat") === k;
        return (
          <button
            key={k}
            type="button"
            title={k === "flat" ? "Flat — every angle equally likely" : "Bell — clustered near 0°"}
            aria-label={k}
            aria-pressed={active}
            onClick={() => {
              doc.flush();
              doc.patch(slot.id, { rotationRandom: { ...rr, spread: k } });
              doc.flush();
            }}
            className={`${ICON_BTN} ${active ? "border-hairline bg-paper-warm text-ink" : "text-ink-soft/45"}`}
          >
            <SpreadIcon kind={k} />
          </button>
        );
      })}
    </span>
  );
}

// The three numeric cells. `preview`/`commit` mirror the real seam: onChange is
// live (canvas follows), onCommit bounds the undo entry with a flush either
// side of the gesture.
function useCell(slot, doc, field) {
  const opened = useRef(false);
  return {
    onChange: (v) => {
      if (!opened.current) {
        opened.current = true;
        doc.flush();
      }
      doc.patch(slot.id, { [field]: v }, { preview: true });
    },
    onCommit: (v) => {
      opened.current = false;
      doc.patch(slot.id, { [field]: v });
      doc.flush();
    },
  };
}

function ScaleCell({ slot, doc, slotWidth = "4ch" }) {
  const cell = useCell(slot, doc, "sizeScale");
  return (
    <DragNumber
      value={slot.sizeScale ?? 1}
      min={SCALE_MIN}
      max={SCALE_MAX}
      step={SCALE_STEP}
      mapping="geometric"
      format={SCALE_FORMAT}
      parse={SCALE_PARSE}
      label="Glyph scale"
      title="Drag ↕ to size every instance · neighbours repack"
      slotWidth={slotWidth}
      {...cell}
    />
  );
}

function RangeCell({ slot, doc }) {
  const rr = slot.rotationRandom;
  const opened = useRef(false);
  return (
    <DragNumber
      value={rr.range ?? 0}
      min={0}
      max={180}
      step={1}
      label="Angle range"
      title="Drag ↕ · ± degrees either side"
      format={(v) => `±${Math.round(v)}°`}
      parse={(s) => parseFloat(String(s).replace(/[^\d.]/g, ""))}
      slotWidth="4ch"
      onChange={(v) => {
        if (!opened.current) {
          opened.current = true;
          doc.flush();
        }
        doc.patch(slot.id, { rotationRandom: { ...rr, range: v } }, { preview: true });
      }}
      onCommit={(v) => {
        opened.current = false;
        doc.patch(slot.id, { rotationRandom: { ...rr, range: v } });
        doc.flush();
      }}
    />
  );
}

function WeightCell({ slot, doc }) {
  const cell = useCell(slot, doc, "weight");
  return (
    <DragNumber
      value={slot.weight ?? 1}
      min={0}
      max={5}
      step={0.5}
      label="Weight"
      title="Drag ↕ · how often Random picks this slot"
      format={(v) => `wt ${Number(v).toFixed(1)}`}
      parse={(s) => parseFloat(String(s).replace(/[^\d.]/g, ""))}
      slotWidth="6ch"
      {...cell}
    />
  );
}

// Rotation, drawn two ways. The DIAL is the popover's control verbatim — note
// its 12 o'clock reference mark, which reads as an ABSOLUTE bearing on a
// control that stores a RELATIVE offset. The NUMBER states the offset plainly.
function RotationDial({ slot, doc }) {
  const cell = useCell(slot, doc, "rotationOffset");
  return (
    <DragDial
      value={slot.rotationOffset ?? 0}
      label="Rotation offset"
      title="Drag ↕ to turn · offset from the path · click for the dial"
      onOpen={() => {}}
      {...cell}
    />
  );
}

function RotationNumber({ slot, doc }) {
  const cell = useCell(slot, doc, "rotationOffset");
  return (
    <DragNumber
      value={slot.rotationOffset ?? 0}
      min={0}
      max={359}
      step={1}
      label="Rotation offset"
      title="Drag ↕ · degrees turned FROM the path direction"
      format={(v) => `${v > 180 ? v - 360 : v > 0 ? `+${v}` : v}°`}
      parse={(s) => {
        const n = parseFloat(String(s).replace(/[^\d.+-]/g, ""));
        return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0;
      }}
      slotWidth="5ch"
      {...cell}
    />
  );
}

/* ------------------------------------------------------- variant A — port */

// One control per row, hairline dividers between them, chrome lifted verbatim
// from GlyphPopover. Chips size to their own content, so a pure rest is short
// and the strip's bottom edge is ragged.
function ChipA({ slot, doc }) {
  const hidden = isHidden(slot);
  const pure = isPureRest(slot);
  const rr = slot.rotationRandom;
  return (
    <div
      data-testid="proto-slot"
      className={`flex w-[124px] shrink-0 flex-col self-start overflow-hidden rounded-cell border border-hairline bg-paper ${
        hidden ? "opacity-45" : ""
      }`}
    >
      <div className="border-b border-hairline bg-paper-warm px-1 py-[2px]">
        <ChipHeader slot={slot} doc={doc} />
      </div>
      <div className="p-1.5">{pure ? <RestPlate /> : <ChipThumb slot={slot} />}</div>
      {!pure && (
        <>
          {doc.mode === "random" && (
            <div className="border-t border-hairline px-1 py-0.5">
              <WeightCell slot={slot} doc={doc} />
            </div>
          )}
          <div className="flex items-center justify-between border-t border-hairline px-1 py-0.5">
            <ScaleCell slot={slot} doc={doc} />
            <FlipToggle slot={slot} doc={doc} />
          </div>
          <div className="flex items-center justify-between border-t border-hairline px-1 py-0.5">
            <RotationDial slot={slot} doc={doc} />
            <AngleRndToggle slot={slot} doc={doc} />
          </div>
          {rr && (
            <div className="flex items-center justify-between border-t border-hairline px-1 py-0.5">
              <RangeCell slot={slot} doc={doc} />
              <SpreadToggles slot={slot} doc={doc} />
            </div>
          )}
        </>
      )}
      {pure && doc.mode === "random" && (
        <div className="border-t border-hairline px-1 py-0.5">
          <WeightCell slot={slot} doc={doc} />
        </div>
      )}
    </div>
  );
}

export function VariantASlotPort({ doc }) {
  return (
    <div className="flex flex-nowrap items-start gap-1.5 overflow-x-auto pb-1">
      {doc.slots.map((s) => (
        <ChipA key={s.id} slot={s} doc={doc} />
      ))}
    </div>
  );
}

/* ----------------------------------------------------- variant B — gutter */

// No dividers. Values run the full width of the chip; the two modifier icons
// live in a fixed 22px lane down the right edge, so flip and angle-rnd read as
// one column of switches rather than two row-tails. Bigger thumb, tighter rows.
function ChipB({ slot, doc }) {
  const hidden = isHidden(slot);
  const pure = isPureRest(slot);
  const rr = slot.rotationRandom;
  return (
    <div
      data-testid="proto-slot"
      className={`flex w-[124px] shrink-0 flex-col gap-0.5 self-start rounded-cell border border-hairline bg-paper p-1 ${
        hidden ? "opacity-45" : ""
      }`}
    >
      <ChipHeader slot={slot} doc={doc} />
      {pure ? <RestPlate /> : <ChipThumb slot={slot} size={40} />}
      {!pure && (
        <div className="flex gap-0.5">
          <div className="flex min-w-0 flex-1 flex-col">
            {doc.mode === "random" && <WeightCell slot={slot} doc={doc} />}
            <ScaleCell slot={slot} doc={doc} slotWidth="5ch" />
            <RotationNumber slot={slot} doc={doc} />
            {rr && <RangeCell slot={slot} doc={doc} />}
          </div>
          {/* the switch lane */}
          <div className="flex w-[22px] shrink-0 flex-col items-center gap-0.5 border-l border-hairline/60 pl-0.5">
            {doc.mode === "random" && <span className="h-5" />}
            <FlipToggle slot={slot} doc={doc} />
            <AngleRndToggle slot={slot} doc={doc} />
            {/* stacked: the lane is 22px, and two side-by-side toggles spill
                straight out of the chip. */}
            {rr && <SpreadToggles slot={slot} doc={doc} stacked />}
          </div>
        </div>
      )}
      {pure && doc.mode === "random" && <WeightCell slot={slot} doc={doc} />}
    </div>
  );
}

export function VariantBGutter({ doc }) {
  return (
    <div className="flex flex-nowrap items-start gap-1.5 overflow-x-auto pb-1">
      {doc.slots.map((s) => (
        <ChipB key={s.id} slot={s} doc={doc} />
      ))}
    </div>
  );
}

/* ---------------------------------------------- variant C — mixer channel */

// Every chip reserves every row on a shared grid, so a value sits at the same
// height in every chip and you can scan ONE parameter across the whole sequence.
// A leading ruler column names the rows once. A rest chip keeps its lanes as
// faint rules rather than collapsing, which is what keeps the alignment honest.
const ROW_H = 26;

function Lane({ children, empty = false }) {
  return (
    <div
      className="flex items-center border-t border-hairline/50 px-1"
      style={{ height: ROW_H }}
    >
      {empty ? <span className="h-px w-full bg-hairline/40" /> : children}
    </div>
  );
}

function ChipC({ slot, doc, showRnd }) {
  const hidden = isHidden(slot);
  const pure = isPureRest(slot);
  const rr = slot.rotationRandom;
  return (
    <div
      data-testid="proto-slot"
      className={`flex w-[112px] shrink-0 flex-col rounded-cell border border-hairline bg-paper ${
        hidden ? "opacity-45" : ""
      }`}
    >
      <div className="bg-paper-warm px-1 py-[2px]">
        <ChipHeader slot={slot} doc={doc} />
      </div>
      <div className="px-1 pb-1 pt-1">
        {pure ? <RestPlate /> : <ChipThumb slot={slot} size={26} />}
      </div>
      {doc.mode === "random" && (
        <Lane>
          <WeightCell slot={slot} doc={doc} />
        </Lane>
      )}
      <Lane empty={pure}>
        {!pure && (
          <span className="flex w-full items-center justify-between">
            <ScaleCell slot={slot} doc={doc} />
            <FlipToggle slot={slot} doc={doc} />
          </span>
        )}
      </Lane>
      <Lane empty={pure}>
        {!pure && (
          <span className="flex w-full items-center justify-between">
            <RotationDial slot={slot} doc={doc} />
            <AngleRndToggle slot={slot} doc={doc} />
          </span>
        )}
      </Lane>
      {showRnd && (
        <Lane empty={!rr}>
          {rr && (
            <span className="flex w-full items-center justify-between">
              <RangeCell slot={slot} doc={doc} />
              <SpreadToggles slot={slot} doc={doc} />
            </span>
          )}
        </Lane>
      )}
    </div>
  );
}

function RulerLane({ children }) {
  return (
    <div
      className="flex items-center justify-end border-t border-hairline/50 pr-1 text-2xs uppercase tracking-wide text-ink-soft/70"
      style={{ height: ROW_H }}
    >
      {children}
    </div>
  );
}

export function VariantCMixer({ doc }) {
  // One chip carrying angle-rnd opens the lane for the whole strip — that is
  // the price of alignment, and the thing to judge.
  const showRnd = doc.slots.some((s) => s.rotationRandom);
  return (
    <div className="flex items-start gap-1">
      {/* The ruler names each lane once, at the strip's left edge. The spacer
          is the chip's header (24px) + thumb block (44px) — measured off the
          same classes ChipC uses, so the labels sit ON their lanes. */}
      <div className="flex w-[34px] shrink-0 flex-col">
        <div style={{ height: 24 + 44 }} />
        {doc.mode === "random" && <RulerLane>wt</RulerLane>}
        <RulerLane>size</RulerLane>
        <RulerLane>turn</RulerLane>
        {showRnd && <RulerLane>rnd</RulerLane>}
      </div>
      <div className="flex flex-nowrap items-start gap-1 overflow-x-auto pb-1">
        {doc.slots.map((s) => (
          <ChipC key={s.id} slot={s} doc={doc} showRnd={showRnd} />
        ))}
      </div>
    </div>
  );
}
