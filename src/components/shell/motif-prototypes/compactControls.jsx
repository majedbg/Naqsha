// ============================================================================
// PROTOTYPE — THROWAWAY. The compact-control vocabulary proposed by the Ableton
// research: a Naqsha-native answer to "Route/Density/Sequence eat too much
// vertical space." Refuses skeuomorphic synth knobs. Token-only styling.
//   ScrubNumeral      — draggable + typeable number, hairline value-fill rule
//   CadenceStrip      — the rhythm notation made editable (Every-N / Skip)
//   RoleGlyphToggles  — role-badge fragments as checkboxes (Route)
//   CompactBlock      — one-line block row: grip · name · summary · count · power,
//                       unfold for detail
// Every edit calls onEdit() so selection slides to Custom (approved concept).
// ============================================================================
import { useRef, useState } from "react";
import { RoleBadge } from "./prototypeShared";

/* ------------------------------------------------------------------ Grip */

function Grip() {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden className="shrink-0 text-ink-soft opacity-50">
      {[3, 7, 11].map((y) =>
        [2, 6].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1} fill="currentColor" />)
      )}
    </svg>
  );
}

/* --------------------------------------------------------------- Chevron */

function Chevron({ open }) {
  return (
    <span
      aria-hidden
      className="inline-block text-2xs leading-none text-ink-soft transition-transform duration-fast"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
    >
      ▸
    </span>
  );
}

/* ------------------------------------------------------------- PowerDot */

// Block enable toggle. Ink (not saffron — saffron is reserved for the lit mode
// and the Trace). Filled when on, hollow when off.
function PowerDot({ on, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      title={on ? "Disable block" : "Enable block"}
      className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-violet"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <circle cx="6" cy="6" r="4.5" fill={on ? "var(--ink)" : "none"} stroke="var(--ink-soft)" strokeWidth="1" />
      </svg>
    </button>
  );
}

/* ----------------------------------------------------------- AnchorChip */

// The strongest idea from the research: per-block anchor count, in → out. The
// chain sieves anchors down to placements; each block reports how many it kept.
export function AnchorChip({ inN, outN }) {
  const dropped = outN < inN;
  return (
    <span
      className="shrink-0 rounded-xs border border-hairline px-1 py-px text-2xs tabular-nums text-ink-soft"
      title={`${inN} anchors in, ${outN} kept`}
      data-testid="proto-anchor-chip"
    >
      {inN}
      <span className={dropped ? "text-tone-mild" : ""}> → {outN}</span>
    </span>
  );
}

/* --------------------------------------------------------- ScrubNumeral */

// Draggable + typeable numeric value with a hairline value-fill rule beneath —
// the Figma/Blender idiom, on-brand for Naqsha. Drag horizontally to scrub;
// click (no drag) to type. The fill rule shows the value's position in range.
export function ScrubNumeral({ value, min = 0, max = 100, step = 1, suffix = "", width = 56, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const drag = useRef(null);
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)));

  const commit = () => {
    const raw = Number(draft);
    if (Number.isFinite(raw)) onChange(Math.max(min, Math.min(max, raw)));
    setEditing(false);
  };

  const onPointerDown = (e) => {
    if (editing) return;
    drag.current = { x: e.clientX, v: value, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / non-pointer env */
    }
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 2) drag.current.moved = true;
    const range = max - min;
    let next = drag.current.v + Math.round((dx / 140) * (range / step)) * step;
    next = Math.max(min, Math.min(max, next));
    if (next !== value) onChange(next);
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (d && !d.moved) {
      setDraft(String(value));
      setEditing(true);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label="Value"
        className="rounded-xs border border-violet bg-paper px-1 py-px text-2xs tabular-nums text-ink outline-none"
        style={{ width }}
        data-testid="proto-scrub-input"
      />
    );
  }

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          onChange(Math.min(max, value + step));
        } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          onChange(Math.max(min, value - step));
        } else if (e.key === "Enter") {
          setDraft(String(value));
          setEditing(true);
        }
      }}
      className="relative inline-flex cursor-ew-resize select-none items-baseline justify-center rounded-xs px-1 py-px text-2xs tabular-nums text-ink outline-none hover:bg-paper-warm focus-visible:ring-2 focus-visible:ring-violet"
      style={{ width }}
      title="Drag to scrub · click to type"
      data-testid="proto-scrub-numeral"
    >
      {value}
      {suffix}
      {/* hairline value-fill rule (ink on hairline track — not saffron) */}
      <span className="pointer-events-none absolute inset-x-1 bottom-0 h-px bg-hairline" />
      <span
        className="pointer-events-none absolute bottom-0 left-1 h-px bg-ink"
        style={{ width: `calc(${frac} * (100% - 0.5rem))` }}
      />
    </span>
  );
}

/* ---------------------------------------------------------- CadenceStrip */

// The rhythm notation, made editable: a flattened radial step-sequencer on the
// naqsheh rule. Each step toggles keep (filled) / skip (hollow) — this IS the
// Skip / Every-N control, not a separate slider.
export function CadenceStrip({ steps = 8, initial, onEdit, width = 120 }) {
  const [pattern, setPattern] = useState(
    () => initial || Array.from({ length: steps }, (_, i) => i % 2 === 0)
  );
  const pad = 7;
  const cy = 11;
  const stepX = (width - pad * 2) / (steps - 1);
  const toggle = (i) => {
    setPattern((p) => p.map((v, k) => (k === i ? !v : v)));
    onEdit?.();
  };
  return (
    <svg width={width} height={22} viewBox={`0 0 ${width} 22`} data-testid="proto-cadence-strip">
      <line x1={pad} y1={cy} x2={width - pad} y2={cy} stroke="var(--hairline)" strokeWidth="1" />
      {pattern.map((keep, i) => {
        const x = pad + i * stepX;
        return (
          <g
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`Step ${i + 1} ${keep ? "keep" : "skip"}`}
            onClick={() => toggle(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle(i);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            {/* generous invisible hit target */}
            <rect x={x - stepX / 2} y={0} width={stepX} height={22} fill="transparent" />
            <circle
              cx={x}
              cy={cy}
              r={keep ? 3 : 2.2}
              fill={keep ? "var(--ink)" : "none"}
              stroke={keep ? "none" : "var(--ink-soft)"}
              strokeWidth="1"
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------ RoleGlyphToggles */

// Route as role-badge fragments used AS checkboxes: tap a role to include it.
const ROLES = [
  { key: "crossings", label: "Crossings" },
  { key: "edges", label: "Edges" },
  { key: "cells", label: "Cells" },
];
export function RoleGlyphToggles({ onEdit, compact = false }) {
  const [on, setOn] = useState({ crossings: true, edges: false, cells: false });
  const toggle = (k) => {
    setOn((s) => ({ ...s, [k]: !s[k] }));
    onEdit?.();
  };
  return (
    <div className="flex items-center gap-1" data-testid="proto-role-toggles">
      {ROLES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => toggle(r.key)}
          aria-pressed={on[r.key]}
          title={r.label}
          className={[
            "flex items-center rounded-xs border outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-violet",
            compact ? "px-0.5" : "gap-1 px-1 py-0.5",
            on[r.key] ? "border-ink-soft bg-paper-warm" : "border-hairline bg-paper opacity-60 hover:opacity-100",
          ].join(" ")}
        >
          <RoleBadge roleKind={r.key} lit={on[r.key]} />
          {!compact && <span className="text-2xs text-ink-soft">{r.label}</span>}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- CompactBlock */

// One-line block row. Collapsed: grip · unfold · name · inline summary control
// · anchor-count chip · power. The summary control is EDITABLE while collapsed
// (the whole point — a scrub-numeral / cadence strip works inline); unfolding
// reveals the detail. The chevron + hover affordance make "there's more here"
// obvious, so the open question — does a one-line block still feel editable? —
// can be judged honestly in the browser.
export function CompactBlock({ label, inN, outN, summary, children, defaultOpen = false, onEdit }) {
  const [open, setOpen] = useState(defaultOpen);
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="rounded-sm border border-hairline bg-paper" data-testid={`proto-cblock-${label.toLowerCase()}`}>
      <div className="flex items-center gap-1.5 px-1.5 py-1">
        <Grip />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-violet"
          title={open ? "Fold block" : "Unfold block"}
        >
          <Chevron open={open} />
          <span className="text-2xs font-medium text-ink">{label}</span>
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-end">{summary}</div>
        <AnchorChip inN={inN} outN={outN} />
        <PowerDot
          on={enabled}
          onToggle={() => {
            setEnabled((v) => !v);
            onEdit?.();
          }}
          label={`Toggle ${label}`}
        />
      </div>
      {open && <div className="border-t border-hairline px-2 py-2">{children}</div>}
    </div>
  );
}
