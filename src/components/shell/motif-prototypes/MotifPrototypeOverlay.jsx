// ============================================================================
// PROTOTYPE — THROWAWAY. Mounts the redesigned motif-DEVICE layout variants as
// a floating panel over the studio canvas, plus a floating A/B/C switcher.
// Inert unless DEV and ?variant=A|B|C is present (and never under vitest, so a
// stray merge can't ship it). Self-contained: touches no real Inspector state.
// ============================================================================
import { useEffect } from "react";
import {
  PROTO_VARIANTS,
  PROTO_VARIANT_NAMES,
  setPrototypeVariant,
  useMotifPrototypeVariant,
} from "./prototypeShared";
import VariantARackLedger from "./VariantARackLedger";
import VariantBChain from "./VariantBChain";
import VariantCScoreMargin from "./VariantCScoreMargin";
import VariantDCompact from "./VariantDCompact";

const CYCLE = [null, ...PROTO_VARIANTS];

function PrototypeSwitcher({ variant }) {
  const cycle = (dir) => {
    const i = CYCLE.indexOf(variant);
    setPrototypeVariant(CYCLE[(i + dir + CYCLE.length) % CYCLE.length]);
  };

  // ←/→ cycle variants unless a form control (or the mode radiogroup) has
  // focus — the mode column stops arrow propagation, so this never fights it.
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
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 select-none items-center gap-2 rounded-full border border-hairline bg-paper px-2 py-1 text-xs text-ink shadow-pop">
      <button
        type="button"
        onClick={() => cycle(-1)}
        className="rounded-xs px-1 text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-violet"
        aria-label="Previous variant"
      >
        ‹
      </button>
      <span className="font-medium tabular-nums">
        {variant ? `${variant} · ${PROTO_VARIANT_NAMES[variant]}` : "Motif proto · off"}
      </span>
      <button
        type="button"
        onClick={() => cycle(1)}
        className="rounded-xs px-1 text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-violet"
        aria-label="Next variant"
      >
        ›
      </button>
    </div>
  );
}

export default function MotifPrototypeOverlay() {
  const variant = useMotifPrototypeVariant();

  // Hidden entirely outside dev / under vitest.
  if (!import.meta.env.DEV || import.meta.env.VITEST) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40" data-testid="motif-proto-overlay">
      {/* A/B/C: centered floating device panel. */}
      {variant && variant !== "D" && (
        <div className="absolute left-1/2 top-8 -translate-x-1/2">
          {variant === "A" && <VariantARackLedger />}
          {variant === "B" && <VariantBChain />}
          {variant === "C" && <VariantCScoreMargin />}
        </div>
      )}
      {/* D: places its own canvas-bleed sweep + right-docked compact panel. */}
      {variant === "D" && <VariantDCompact />}
      <PrototypeSwitcher variant={variant} />
    </div>
  );
}
