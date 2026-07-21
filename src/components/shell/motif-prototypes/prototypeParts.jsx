// ============================================================================
// PROTOTYPE — THROWAWAY. Shared interactive parts for the three motif-device
// layout variants: the MODE COLUMN (a real radiogroup), the TRACE transport,
// and the device frame chrome. Token-only styling.
// ============================================================================
import { useRef } from "react";
import { MODES, RoleBadge, RhythmStrip } from "./prototypeShared";

/* ------------------------------------------------------------ ModeColumn */

// The exclusive per-motif MODE selector as a flex COLUMN of rows — one row per
// preset + Custom, exactly one lit. Real radiogroup: role="radiogroup" over
// role="radio" rows, aria-checked, roving tabindex, Up/Down/Home/End moves the
// selection. Arrow handling stopPropagation()s so it never reaches the variant
// switcher's window-level ←/→ listener. `layout` shapes each row:
//   ledger — badge + name  (rhythm strip only on the lit row)
//   chain  — badge + strip + name
//   score  — strip AS the row, name as a small caption beneath
export function ModeColumn({ selectedId, onSelect, layout = "ledger", litMarkerFrac = null }) {
  const rowRefs = useRef([]);

  const move = (from, delta) => {
    const n = MODES.length;
    const to = (from + delta + n) % n;
    onSelect(MODES[to].id);
    rowRefs.current[to]?.focus();
  };

  const onKeyDown = (e, i) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      e.stopPropagation(); // don't let the variant switcher see it
      if (e.key === "ArrowDown") move(i, 1);
      else if (e.key === "ArrowUp") move(i, -1);
      else if (e.key === "Home") {
        onSelect(MODES[0].id);
        rowRefs.current[0]?.focus();
      } else {
        onSelect(MODES[MODES.length - 1].id);
        rowRefs.current[MODES.length - 1]?.focus();
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Motif mode"
      aria-orientation="vertical"
      data-testid="proto-mode-column"
      className="flex flex-col gap-1"
    >
      {MODES.map((m, i) => {
        const lit = m.id === selectedId;
        return (
          <button
            key={m.id}
            ref={(el) => (rowRefs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={lit}
            tabIndex={lit ? 0 : -1}
            data-testid={`proto-mode-${m.id}`}
            onClick={() => onSelect(m.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={[
              "group flex items-center gap-2 rounded-sm border px-2 py-1.5 text-left outline-none transition-colors duration-fast",
              "focus-visible:ring-2 focus-visible:ring-violet",
              lit
                ? "border-saffron bg-saffron/10"
                : "border-hairline bg-paper hover:border-ink-soft",
            ].join(" ")}
          >
            {layout !== "score" && <RoleBadge roleKind={m.roleKind} lit={lit} />}

            {layout === "score" ? (
              <span className="flex flex-col gap-0.5">
                <RhythmStrip
                  modeId={m.id}
                  glyphRef={m.glyphRef}
                  lit={lit}
                  width={132}
                  height={22}
                  markerFrac={lit ? litMarkerFrac : null}
                />
                <span className={`text-2xs ${lit ? "text-ink" : "text-ink-soft"}`}>{m.name}</span>
              </span>
            ) : (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={`text-xs font-medium ${lit ? "text-ink" : "text-ink-soft"}`}>{m.name}</span>
                {layout === "chain" && (
                  <RhythmStrip modeId={m.id} glyphRef={m.glyphRef} lit={lit} width={132} height={20} />
                )}
                {layout === "ledger" && lit && (
                  <RhythmStrip
                    modeId={m.id}
                    glyphRef={m.glyphRef}
                    lit
                    width={132}
                    height={20}
                    markerFrac={litMarkerFrac}
                  />
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- TraceTransport */

// The Trace transport. Text labels (no play/pause glyphs), unhurried copy. The
// scrubber is ALWAYS rendered — it is scrub control and reduced-motion
// fallback both. Under reduced motion the animated Trace button is withheld
// and the scrubber carries the whole interaction.
export function TraceTransport({
  playing,
  index,
  total,
  onToggle,
  onScrub,
  onClear,
  reducedMotion,
  compact = false,
}) {
  return (
    <div className={`flex items-center ${compact ? "gap-1.5" : "gap-2"}`} data-testid="proto-trace-transport">
      {reducedMotion ? (
        <span className="text-2xs text-ink-soft">Scrub to trace</span>
      ) : (
        <button
          type="button"
          data-testid="proto-trace-toggle"
          onClick={onToggle}
          aria-pressed={playing}
          className={[
            "rounded-sm px-2.5 py-1 text-2xs font-semibold uppercase tracking-wide outline-none transition-colors duration-fast",
            "focus-visible:ring-2 focus-visible:ring-violet",
            playing ? "bg-saffron text-ink" : "border border-hairline bg-paper text-ink-soft hover:text-ink",
          ].join(" ")}
        >
          {playing ? "Stop" : "Trace"}
        </button>
      )}
      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={Math.max(0, index)}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="Scrub placement order"
        className={compact ? "w-20 accent-saffron" : "w-28 accent-saffron"}
      />
      <span className="w-10 text-right text-2xs tabular-nums text-ink-soft">
        {index < 0 ? "—" : `${index + 1}/${total}`}
      </span>
      {index >= 0 && (
        <button
          type="button"
          onClick={onClear}
          title="Clear trace"
          className="rounded-xs px-1 text-2xs text-ink-soft outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-violet"
        >
          Clear
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ DeviceFrame */

// Shared device chrome: paper card, hairline border, shadow-pop, a title bar
// that can host an aside (e.g. the Trace transport in variant A). The floating
// "prototype" tag keeps it honest.
export function DeviceFrame({ title, subtitle, titleAside, children, width = 640 }) {
  return (
    <div
      className="pointer-events-auto flex flex-col rounded-md border border-hairline bg-paper text-ink shadow-pop"
      style={{ width, maxWidth: "calc(100vw - 2rem)" }}
      data-testid="proto-device"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{title}</span>
          {subtitle && <span className="text-2xs text-ink-soft">{subtitle}</span>}
        </div>
        {titleAside}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

// A single mock rack block (Route / Sequence / Density …). Interacting with any
// control calls onEdit() so selection slides to Custom (the approved concept).
export function MockBlock({ label, hint, orientation = "vertical", onEdit }) {
  const horizontal = orientation === "horizontal";
  return (
    <div
      className={[
        "rounded-sm border border-hairline bg-paper-warm p-2",
        horizontal ? "w-40 shrink-0" : "w-full",
      ].join(" ")}
      data-testid={`proto-block-${label.toLowerCase()}`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
        <span className="text-2xs text-ink-soft opacity-70">{hint}</span>
      </div>
      <MockBlockControls label={label} onEdit={onEdit} />
    </div>
  );
}

function MockBlockControls({ label, onEdit }) {
  if (label === "Route") {
    return (
      <div className="flex flex-wrap gap-1">
        {["Crossings", "Edges", "Cells"].map((r, i) => (
          <button
            key={r}
            type="button"
            onClick={onEdit}
            className={[
              "rounded-xs border px-1.5 py-0.5 text-2xs outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-violet",
              i === 0 ? "border-ink-soft text-ink" : "border-hairline text-ink-soft hover:text-ink",
            ].join(" ")}
          >
            {r}
          </button>
        ))}
      </div>
    );
  }
  if (label === "Density") {
    return (
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={60}
        onChange={onEdit}
        aria-label="Density"
        className="w-full accent-saffron"
      />
    );
  }
  // Sequence / Every N — a compact stepper mock.
  return (
    <label className="flex items-center gap-1.5 text-2xs text-ink-soft">
      <span>Every</span>
      <input
        type="number"
        min={1}
        defaultValue={2}
        onChange={onEdit}
        aria-label="Every N"
        className="w-12 rounded-xs border border-hairline bg-paper px-1 py-0.5 text-2xs text-ink outline-none focus:border-violet"
      />
      <span>steps</span>
    </label>
  );
}
