// ============================================================================
// PROTOTYPE — THROWAWAY. Mounts the anchor-pitch control-graphic variants in a
// mock right-rail module over the studio canvas, plus a floating A/B/C
// switcher and the prototype chrome (mock zoom, forced reduced motion, and the
// raw state readout).
//
// Inert unless DEV and ?pitch=A|B|C is present (and never under vitest, so a
// stray merge can't ship it). Self-contained: touches no real Inspector state,
// writes nothing to layers, undo, or persistence.
//
// The rail is simulated at its FLOOR: 288px rail (AppShell.jsx:179) → a 224px
// strip after padding, per decision 10's arithmetic. If the graphic reads
// there, growth is free.
// ============================================================================
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./prototypeShared";
import {
  DEFAULT_SPACING,
  PITCH_VARIANTS,
  PITCH_VARIANT_NAMES,
  computeGeometry,
  densityOf,
  flipAnnouncement,
  formatDensity,
  isAtFloor,
  setPitchVariant,
  useMeasuredWidth,
  usePitchVariant,
  FlipLiveRegion,
} from "./pitchProtoShared";
import PitchVariantARuler from "./PitchVariantARuler";
import PitchVariantBScore from "./PitchVariantBScore";
import PitchVariantCAperture from "./PitchVariantCAperture";

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4];

function Switcher({ variant }) {
  const cycle = (dir) => {
    const i = PITCH_VARIANTS.indexOf(variant);
    setPitchVariant(PITCH_VARIANTS[(i + dir + PITCH_VARIANTS.length) % PITCH_VARIANTS.length]);
  };

  // CAPTURE phase + stopPropagation: MotifPrototypeOverlay's own switcher
  // registers a bubble-phase window listener UNCONDITIONALLY in DEV (it has no
  // param guard), so without this a ← / → here would ALSO cycle the motif
  // device and mount its panel on top of the design being judged.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      )
        return;
      e.stopPropagation();
      cycle(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    // bottom-14, not bottom-3: the motif prototype's switcher already owns
    // bottom-3 in every DEV build.
    <div className="pointer-events-auto absolute bottom-14 left-1/2 z-50 flex -translate-x-1/2 select-none items-center gap-2 rounded-full border border-violet bg-paper px-2 py-1 text-xs text-ink shadow-pop">
      <button
        type="button"
        onClick={() => cycle(-1)}
        className="rounded-xs px-1 text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-violet"
        aria-label="Previous pitch variant"
      >
        ‹
      </button>
      <span className="font-medium tabular-nums">
        pitch {variant} · {PITCH_VARIANT_NAMES[variant]}
      </span>
      <button
        type="button"
        onClick={() => cycle(1)}
        className="rounded-xs px-1 text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-violet"
        aria-label="Next pitch variant"
      >
        ›
      </button>
    </div>
  );
}

function Row({ k, v, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink-soft">{k}</span>
      <span className={`num tabular-nums ${tone === "lit" ? "text-saffron" : "text-ink"}`}>{v}</span>
    </div>
  );
}

export default function PitchPrototypeOverlay() {
  const variant = usePitchVariant();

  // THE stored field. An integer, always — the toggle never writes it.
  const [spacing, setSpacing] = useState(DEFAULT_SPACING);
  const [unit, setUnit] = useState("spacing");
  const [zoom, setZoom] = useState(1);
  const [forceReduced, setForceReduced] = useState(false);
  // Round-trip evidence: the value the toggle count is measured against.
  const [baseline, setBaseline] = useState(DEFAULT_SPACING);
  const [toggles, setToggles] = useState(0);
  const [liveMsg, setLiveMsg] = useState("");
  const [stripRef, stripWidth] = useMeasuredWidth();

  const osReduced = usePrefersReducedMotion();
  const reduced = osReduced || forceReduced;

  const onSpacing = (next) => {
    setSpacing(next);
    setBaseline(next); // a real value change re-arms the round-trip check
    setToggles(0);
  };

  const flip = (n = 1) => {
    const nextUnit = n % 2 === 0 ? unit : unit === "spacing" ? "density" : "spacing";
    setUnit(nextUnit);
    setToggles((t) => t + n);
    // aria-live will not re-announce identical text, and flipping back and
    // forth produces alternating strings only when n is odd — a trailing space
    // that flips keeps every announcement audible.
    setLiveMsg((m) => flipAnnouncement(nextUnit, spacing) + (m.endsWith(" ") ? "" : " "));
  };

  const geo = computeGeometry({ spacing, stripWidth, zoom });
  const raw = densityOf(spacing);
  const atFloor = isAtFloor(spacing);
  const roundTripOk = spacing === baseline;

  if (!import.meta.env.DEV || import.meta.env.VITEST || !variant) return null;

  const V =
    variant === "A" ? PitchVariantARuler : variant === "B" ? PitchVariantBScore : PitchVariantCAperture;

  return (
    <div className="pointer-events-none absolute inset-0 z-50" data-testid="pitch-proto-overlay">
      {/* Mock right rail at its 288px floor. */}
      <div className="pointer-events-auto absolute right-3 top-8 w-[288px] rounded-md border border-hairline bg-paper text-ink shadow-pop">
        <div className="flex items-baseline justify-between border-b border-hairline px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Motif · edge host</span>
          <span className="text-2xs text-ink-soft">rail floor 288px</span>
        </div>

        <div className="p-3">
          {/* The control. Row one = label + DragNumber + badge; row two = the
              graphic at the full strip width. Stacked, decision 10. */}
          <div ref={stripRef} className="w-[224px]">
            <V
              unit={unit}
              spacing={spacing}
              onSpacing={onSpacing}
              onFlip={() => flip(1)}
              zoom={zoom}
              reduced={reduced}
              stripWidth={stripWidth}
            />
          </div>
          <FlipLiveRegion message={liveMsg} />
        </div>

        {/* ------------------------------------------- prototype chrome */}
        <div className="space-y-2 rounded-b-md border-t border-dashed border-violet bg-paper-warm px-3 py-2 text-2xs">
          <p className="font-semibold uppercase tracking-wide text-violet">Prototype chrome — not the design</p>

          <label className="flex items-center gap-2 text-ink-soft">
            <span className="w-20 shrink-0">Mock zoom</span>
            <input
              type="range"
              min={0}
              max={ZOOMS.length - 1}
              step={1}
              value={ZOOMS.indexOf(zoom)}
              onChange={(e) => setZoom(ZOOMS[Number(e.target.value)])}
              aria-label="Mock canvas zoom"
              className="min-w-0 flex-1 accent-saffron"
            />
            <span className="num w-8 text-right text-ink">{zoom}×</span>
          </label>

          <label className="flex items-center gap-2 text-ink-soft">
            <input
              type="checkbox"
              checked={forceReduced}
              onChange={(e) => setForceReduced(e.target.checked)}
              className="accent-saffron"
            />
            <span>
              Force reduced motion {osReduced && <span className="text-ink">(OS already asks for it)</span>}
            </span>
          </label>

          <div className="space-y-0.5 border-t border-hairline pt-1.5">
            <Row k="stored spacing" v={`${spacing} u`} tone={atFloor ? "lit" : undefined} />
            <Row k="unit shown" v={unit} />
            <Row k="displayed" v={unit === "spacing" ? `${spacing} u` : `${formatDensity(raw)} /100u`} />
            <Row k="100 / spacing, unrounded" v={raw.toFixed(4)} />
            <Row k="effective zoom" v={`${zoom}×`} />
            <Row k="strip width" v={`${Math.round(stripWidth)} px`} />
            <Row k="to scale" v={geo.toScale ? "true" : "false"} />
            <Row k="px per host unit" v={geo.pxPerUnit.toFixed(3)} />
            <Row k="at floor (min 4)" v={atFloor ? "true" : "false"} tone={atFloor ? "lit" : undefined} />
          </div>

          <div className="space-y-0.5 border-t border-hairline pt-1.5">
            <Row k="toggles since last value change" v={toggles} />
            <Row k="baseline spacing" v={baseline} />
            <Row
              k="round trip"
              v={roundTripOk ? "PASS — bit-identical" : "FAIL — value drifted"}
              tone={roundTripOk ? undefined : "lit"}
            />
            <button
              type="button"
              onClick={() => flip(8)}
              className="mt-1 rounded-xs border border-hairline bg-paper px-1.5 py-0.5 text-2xs text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-violet"
            >
              flip ×8
            </button>
          </div>

          <p className="border-t border-hairline pt-1.5 text-ink-soft">
            The toggle writes nothing — so flipping moves no dots, only the mark. Bit-identity is structural,
            not maintained.
          </p>
        </div>
      </div>

      <Switcher variant={variant} />
    </div>
  );
}
