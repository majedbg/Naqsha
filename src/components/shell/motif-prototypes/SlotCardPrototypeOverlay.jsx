// ============================================================================
// PROTOTYPE — THROWAWAY CODE. Do not ship, do not test, do not extend.
//
// Three variants of the reworked motif SLOT CARD, on the existing studio route,
// gated by ?slotcard=A|B|C. DEV builds only, never under vitest, and fully
// inert without the param — so a stray merge cannot ship it.
//
// Deliberately a SEPARATE param from the older ?variant=A..D device prototype:
// that round is settled, and cycling through whole-device layouts on the way to
// a slot chip would be noise.
//
// Run:  npm run dev   →   http://localhost:5173/?slotcard=A
// Keys: ← / → cycle variants (ignored while typing in a field).
// ============================================================================
import { useEffect, useSyncExternalStore } from "react";
import {
  SLOT_VARIANTS,
  SLOT_VARIANT_NAMES,
  useMockSlots,
  VariantASlotPort,
  VariantBGutter,
  VariantCMixer,
  VariantDGutterInline,
} from "./SlotCardVariants";

/* --------------------------------------------------------- variant param */

const listeners = new Set();

function readVariant() {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("slotcard");
  return SLOT_VARIANTS.includes(v) ? v : null;
}

function setVariant(v) {
  const url = new URL(window.location.href);
  if (v) url.searchParams.set("slotcard", v);
  else url.searchParams.delete("slotcard");
  window.history.replaceState(null, "", url);
  listeners.forEach((fn) => fn());
}

function subscribe(cb) {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

function useSlotCardVariant() {
  return useSyncExternalStore(subscribe, readVariant, () => null);
}

/* ----------------------------------------------------------------- panel */

const CYCLE = [null, ...SLOT_VARIANTS];

function Switcher({ variant }) {
  const cycle = (dir) => {
    const i = CYCLE.indexOf(variant);
    setVariant(CYCLE[(i + dir + CYCLE.length) % CYCLE.length]);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target;
      if (
        t instanceof HTMLElement &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
      )
        return;
      cycle(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    // bottom-12, not bottom-3: the older ?variant= device prototype owns the
    // bottom-centre pill, and two of them would sit on top of each other.
    <div className="pointer-events-auto absolute bottom-12 left-1/2 z-40 flex -translate-x-1/2 select-none items-center gap-2 rounded-full border border-hairline bg-paper px-2 py-1 text-xs text-ink shadow-pop">
      <button
        type="button"
        onClick={() => cycle(-1)}
        aria-label="Previous variant"
        className="rounded-xs px-1 text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-violet"
      >
        ‹
      </button>
      <span className="font-medium tabular-nums">
        {variant ? `Slot card ${variant} · ${SLOT_VARIANT_NAMES[variant]}` : "Slot card proto · off"}
      </span>
      <button
        type="button"
        onClick={() => cycle(1)}
        aria-label="Next variant"
        className="rounded-xs px-1 text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-violet"
      >
        ›
      </button>
    </div>
  );
}

// The live document, printed. Rule 5 of the prototype skill: after every
// gesture the full relevant state is visible, so a drag that writes the wrong
// field is obvious rather than plausible.
function StateReadout({ doc }) {
  const line = (s) => {
    const bits = [];
    if (s.rest && s.glyphRef) bits.push("HIDDEN");
    else if (s.rest) bits.push("rest");
    if (s.glyphRef) bits.push(s.glyphRef);
    if (doc.mode === "random") bits.push(`wt ${Number(s.weight ?? 1).toFixed(1)}`);
    if (!s.rest || s.glyphRef) {
      bits.push(`${Math.round((s.sizeScale ?? 1) * 100)}%`);
      const r = s.rotationOffset ?? 0;
      bits.push(`${r > 180 ? r - 360 : r > 0 ? `+${r}` : r}°`);
      if (s.flip !== undefined) bits.push(s.flip ? "flip" : "no-flip");
      if (s.rotationRandom)
        bits.push(`±${Math.round(s.rotationRandom.range ?? 0)}° ${s.rotationRandom.spread || "flat"}`);
    }
    return `${String(s.id).padStart(3)}  ${bits.join(" · ")}`;
  };
  return (
    <div className="mt-2 border-t border-hairline pt-1.5">
      <div className="mb-1 flex items-baseline justify-between text-2xs uppercase tracking-wide text-ink-soft/70">
        <span>slots</span>
        <span className="num">
          {doc.previews} previews · {doc.flushes} flushes
        </span>
      </div>
      <pre className="max-h-[136px] overflow-auto whitespace-pre-wrap text-2xs leading-snug text-ink-soft num">
        {doc.slots.map(line).join("\n")}
      </pre>
    </div>
  );
}

function Panel({ variant }) {
  const doc = useMockSlots();
  return (
    // 440px ≈ the real inspector rail, so chip crowding is honest.
    <div className="pointer-events-auto w-[440px] rounded-sm border border-hairline bg-paper p-3 shadow-pop">
      <div className="mb-2">
        <div className="text-xs font-medium text-ink">
          Slot card {variant} — {SLOT_VARIANT_NAMES[variant]}
        </div>
        <p className="mt-0.5 text-2xs leading-snug text-ink-soft">
          Six controls in one chip: does this read as a mixer channel or a mess?
          Slots are active · tuned · pure rest · hidden · active.
        </p>
      </div>

      <div className="mb-2 flex items-center gap-1">
        {["cycle", "random"].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => doc.setMode(m)}
            aria-pressed={doc.mode === m}
            className={`rounded-xs border px-2 py-0.5 text-2xs font-medium capitalize transition-colors ${
              doc.mode === m
                ? "border-violet bg-violet/15 text-ink"
                : "border-hairline bg-paper text-ink-soft hover:border-violet"
            }`}
          >
            {m}
          </button>
        ))}
        <span className="ml-1 text-2xs text-ink-soft/70">
          Random adds the weight row
        </span>
      </div>

      {variant === "A" && <VariantASlotPort doc={doc} />}
      {variant === "B" && <VariantBGutter doc={doc} />}
      {variant === "C" && <VariantCMixer doc={doc} />}
      {variant === "D" && <VariantDGutterInline doc={doc} />}

      <StateReadout doc={doc} />
    </div>
  );
}

export default function SlotCardPrototypeOverlay() {
  const variant = useSlotCardVariant();

  if (!import.meta.env.DEV || import.meta.env.VITEST) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40"
      data-testid="slot-card-proto-overlay"
    >
      {variant && (
        <div className="absolute left-1/2 top-8 -translate-x-1/2">
          <Panel variant={variant} />
        </div>
      )}
      <Switcher variant={variant} />
    </div>
  );
}
