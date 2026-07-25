/* eslint-disable react-refresh/only-export-components -- prototype: mixed
   data+component exports are fine here, HMR full-reload is acceptable. */
// ============================================================================
// PROTOTYPE — THROWAWAY CODE. Do not ship, do not test, do not extend.
//
// Question this round answers: how should the redesigned MOTIF DEVICE lay out
// when its "Quick start" chips become an exclusive per-motif MODE selector —
// an Ableton-style flex ROW whose left child is a flex COLUMN of mode rows
// (one row per preset + Custom), and the right side holds the rest? Each mode
// carries a drawn NOTATION (role badge + rhythm strip) and the device sports a
// "Trace" transport that plays placement order at a constant mechanical rate,
// accumulating like ink.
//
// Three variants on the existing studio route, gated by ?variant=A|B|C (DEV
// builds only; no param = prototype fully inert):
//   A — Rack ledger  (mode column: badge+name; right = vertical block rack)
//   B — Chain        (mode column: badge+strip+name; right = horizontal chain)
//   C — Score margin  (mode column: strip-as-row; right = grouped properties)
//
// All state is local/mock. Nothing writes to layers, undo, or persistence.
// Colors come from CSS custom properties (tokens.css) so SVG stays on-brand
// and theme-flips: var(--saffron) is the ONE load-bearing accent (the lit
// mode); unlit notation is var(--ink-soft); violet is focus only.
// ============================================================================
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MOTIF_GLYPHS } from "../../../lib/motif/glyphs";

/* ---------------------------------------------------------------- variant */

export const PROTO_VARIANTS = ["A", "B", "C", "D"];
export const PROTO_VARIANT_NAMES = {
  A: "Rack ledger",
  B: "Chain",
  C: "Score margin",
  D: "Compact ledger",
};

const variantListeners = new Set();

function readVariant() {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("variant");
  return PROTO_VARIANTS.includes(v) ? v : null;
}

export function setPrototypeVariant(v) {
  const url = new URL(window.location.href);
  if (v) url.searchParams.set("variant", v);
  else url.searchParams.delete("variant");
  window.history.replaceState(null, "", url);
  variantListeners.forEach((fn) => fn());
}

function subscribeVariant(cb) {
  variantListeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => {
    variantListeners.delete(cb);
    window.removeEventListener("popstate", cb);
  };
}

// Safe outside a Router (reads location directly) so tests that mount without
// a router never notice the prototype exists.
export function useMotifPrototypeVariant() {
  return useSyncExternalStore(subscribeVariant, readVariant, () => null);
}

/* ------------------------------------------------------- reduced motion */

// The Trace sweep runs at a constant mechanical rate deliberately — but a
// reader who asked the OS for less motion gets NO auto-advance; the scrubber
// (always rendered) becomes the whole transport.
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* ----------------------------------------------------------------- modes */

// The four presets + Custom. Exactly one is lit (radiogroup). `roleKind` picks
// the role-badge fragment (grid crossings/cells/edges, or a spiral stroke).
// `note` is the unhurried one-line description under the mode.
export const MODES = [
  {
    id: "alternate",
    name: "Alternate x-o",
    glyphRef: "leaf",
    roleKind: "crossings",
    note: "Fill, then rest — checker the crossings.",
  },
  {
    id: "vine",
    name: "Vine",
    glyphRef: "leaf",
    roleKind: "stroke",
    note: "Leaves grow off the path, side to side.",
  },
  {
    id: "sparse",
    name: "Sparse scatter",
    glyphRef: "dot",
    roleKind: "cells",
    note: "A few marks, most cells left bare.",
  },
  {
    id: "border",
    name: "Border march",
    glyphRef: "diamond",
    roleKind: "edges",
    note: "An even march around the edge.",
  },
  {
    id: "custom",
    name: "Custom",
    glyphRef: "leaf",
    roleKind: "cells",
    note: "Your own rhythm — edit any block.",
  },
];

export function modeById(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

/* --------------------------------------------------- rhythm strip slots */

// A compact 14-slot reading of each mode for the RHYTHM STRIP: the host path
// as a thin rule, slot marks along it.
//   fill = placement (a filled mini-glyph)
//   rest = a hollow circle (a beat deliberately left empty)
//   skip = a faint dot (a beat the density skipped over)
// Vine slots carry a `side` — leaves GROW FROM the line, base on the rule,
// blade hanging off one side, alternating up/down. Never centered.
const F = (side) => ({ t: "fill", side });
const R = { t: "rest" };
const S = { t: "skip" };
export const RHYTHM = {
  alternate: [F(), R, F(), R, F(), R, F(), R, F(), R, F(), R, F(), R],
  vine: [
    F("up"), F("down"), F("up"), F("down"), F("up"), F("down"), F("up"),
    F("down"), F("up"), F("down"), F("up"), F("down"), F("up"), F("down"),
  ],
  sparse: [S, S, F(), S, S, S, F(), S, S, F(), S, S, S, F()],
  border: [F(), F(), F(), F(), F(), F(), F(), F(), F(), F(), F(), F(), F(), F()],
  // Custom reads as a hand-edited rhythm — uneven, mixed marks.
  custom: [F(), F("up"), R, F(), S, F("down"), F(), R, F(), F("up"), S, F(), R, F()],
};

/* ------------------------------------------------- host preview layout */

// Ordered mock placements for the small host preview (~20–40 marks), one
// layout per mode. Each node: {x, y, role, side?} in a 0..100 box. `role` is
// fill / rest / skip. The Trace transport lights the FILL nodes in order and
// they ACCUMULATE (stay lit); rest/skip nodes stay faint context throughout.
// Deterministic (no Math.random) so the preview is stable across renders.
function hash(i) {
  // cheap deterministic 0..1 sequence
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function layoutForMode(id) {
  const nodes = [];
  if (id === "alternate" || id === "custom") {
    const cols = 8;
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = 10 + (c * 80) / (cols - 1);
        const y = 14 + (r * 72) / (rows - 1);
        let role = (r + c) % 2 === 0 ? "fill" : "rest";
        // Custom = the same grid with a few beats hand-toggled (reads "edited").
        if (id === "custom") {
          const k = r * cols + c;
          if (k === 9 || k === 18) role = "fill";
          if (k === 2 || k === 20 || k === 33) role = "skip";
        }
        nodes.push({ x, y, role });
      }
    }
  } else if (id === "vine") {
    // A horizontal sine path; leaves sample along it, base ON the path, blade
    // off alternating sides. We store the path point + side; the preview draws
    // the leaf growing outward from that point.
    const count = 24;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = 8 + t * 84;
      const y = 50 + 22 * Math.sin(t * Math.PI * 3);
      nodes.push({ x, y, role: "fill", side: i % 2 === 0 ? "up" : "down" });
    }
  } else if (id === "sparse") {
    const cols = 7;
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = 12 + (c * 76) / (cols - 1);
        const y = 16 + (r * 68) / (rows - 1);
        // ~28% become placements, scattered deterministically; rest are skips.
        const role = hash(r * cols + c + 1) > 0.72 ? "fill" : "skip";
        nodes.push({ x, y, role });
      }
    }
  } else if (id === "border") {
    // Even march around a rectangle perimeter.
    const per = 26;
    const x0 = 12;
    const y0 = 16;
    const x1 = 88;
    const y1 = 84;
    const w = x1 - x0;
    const h = y1 - y0;
    const peri = 2 * (w + h);
    for (let i = 0; i < per; i++) {
      let d = (i / per) * peri;
      let x;
      let y;
      if (d < w) {
        x = x0 + d;
        y = y0;
      } else if ((d -= w) < h) {
        x = x1;
        y = y0 + d;
      } else if ((d -= h) < w) {
        x = x1 - d;
        y = y1;
      } else {
        d -= w;
        x = x0;
        y = y1 - d;
      }
      nodes.push({ x, y, role: "fill" });
    }
  }
  return nodes;
}

// Placement-order indices of the FILL nodes (the ink the Trace lays down).
export function fillOrder(nodes) {
  const order = [];
  nodes.forEach((n, i) => {
    if (n.role === "fill") order.push(i);
  });
  return order;
}

// The chain sieves anchors down to placements. The strongest idea from the
// Ableton research: show each block's per-block anchor count (in → out). We
// mock a plausible descending chain from the host's total anchors down to the
// actual placement count. `labels` are the block names in chain order; the
// last block lands exactly on `final`.
export function sieveCounts(totalAnchors, final, blockCount) {
  const counts = [];
  let inN = totalAnchors;
  for (let i = 0; i < blockCount; i++) {
    // linear glide from totalAnchors → final across the blocks
    const outN = Math.round(totalAnchors + ((final - totalAnchors) * (i + 1)) / blockCount);
    counts.push({ in: inN, out: i === blockCount - 1 ? final : outN });
    inN = i === blockCount - 1 ? final : outN;
  }
  return counts;
}

/* ------------------------------------------------------- Trace transport */

// A local hook (transport + preview live in the same variant, so no global
// store is warranted). CONSTANT mechanical rate — no learn-ramp. Play lights
// fill placements one at a time; they ACCUMULATE. Second press stops (ink
// stays where it landed). Under reduced motion the rAF never runs; the caller
// still renders the scrubber, which becomes the whole transport.
const STEP_MS = 120;

export function useTrace(total, { reducedMotion = false } = {}) {
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(-1); // -1 = idle (no ink yet)
  const raf = useRef(0);
  const last = useRef(0);
  const acc = useRef(0);

  const play = useCallback(() => {
    if (total <= 0) return;
    setIndex((i) => (i >= total - 1 ? 0 : Math.max(0, i)));
    setPlaying(true);
  }, [total]);
  const stop = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (p) return false;
      if (total <= 0) return false;
      setIndex((i) => (i >= total - 1 ? 0 : Math.max(0, i)));
      return true;
    });
  }, [total]);
  const clear = useCallback(() => {
    setPlaying(false);
    setIndex(-1);
  }, []);
  const scrub = useCallback((v) => {
    setPlaying(false);
    setIndex(v);
  }, []);

  useEffect(() => {
    if (!playing || reducedMotion) return undefined;
    last.current = performance.now();
    acc.current = 0;
    const tick = (now) => {
      acc.current += now - last.current;
      last.current = now;
      if (acc.current >= STEP_MS) {
        acc.current = 0;
        setIndex((i) => {
          if (i >= total - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, reducedMotion, total]);

  // Clamp at read time: when the mode changes `total` shrinks, and a stale
  // stored index would otherwise read e.g. 20/18. Idle (-1) stays idle.
  const clampedIndex = index < 0 ? -1 : Math.min(index, total - 1);
  return { playing, index: clampedIndex, play, stop, toggle, clear, scrub };
}

/* --------------------------------------------------------- notation bits */

// Small filled glyph mark used for a "placement" slot / node. Uses the mode's
// glyph path for authenticity (leaf for vine, etc.), filled in the given tint.
export function GlyphMark({ glyphRef, size = 10, fill = "var(--saffron)", opacity = 1 }) {
  const g = MOTIF_GLYPHS[glyphRef] || MOTIF_GLYPHS.leaf;
  const r = g.viewRadius * 1.15;
  return (
    <svg width={size} height={size} viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} aria-hidden style={{ opacity }}>
      {g.paths.map((p, i) => (
        <path key={i} d={p.d} fill={fill} stroke="none" />
      ))}
    </svg>
  );
}

// ROLE BADGE — a tiny fragment of the host: a grid corner with dots at the
// role positions (crossings / cell centers / edge midpoints), or a stroke arc
// for spiral/path hosts. Saffron dots on the LIT row (load-bearing accent);
// muted to ink-soft when unlit so saffron stays exclusive.
export function RoleBadge({ roleKind, lit }) {
  const dot = lit ? "var(--saffron)" : "var(--ink-soft)";
  const line = "var(--hairline)";
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="shrink-0">
      {roleKind === "stroke" ? (
        <>
          {/* a spiral/path host fragment: a stroke with dots riding it */}
          <path d="M3,20 C8,6 18,6 23,18" fill="none" stroke={line} strokeWidth="1.4" strokeLinecap="round" />
          {[
            [6.5, 13.5],
            [13, 8.4],
            [19.5, 13],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={lit ? 2 : 1.6} fill={dot} />
          ))}
        </>
      ) : (
        <>
          {/* grid fragment: two verticals x two horizontals */}
          {[8, 18].map((x) => (
            <line key={`v${x}`} x1={x} y1={4} x2={x} y2={22} stroke={line} strokeWidth="1" />
          ))}
          {[8, 18].map((y) => (
            <line key={`h${y}`} x1={4} y1={y} x2={22} y2={y} stroke={line} strokeWidth="1" />
          ))}
          {roleKind === "crossings" &&
            [
              [8, 8],
              [18, 8],
              [8, 18],
              [18, 18],
            ].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={lit ? 2 : 1.6} fill={dot} />)}
          {roleKind === "cells" && <circle cx={13} cy={13} r={lit ? 2.2 : 1.8} fill={dot} />}
          {roleKind === "edges" &&
            [
              [13, 8],
              [13, 18],
              [8, 13],
              [18, 13],
            ].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={lit ? 2 : 1.6} fill={dot} />)}
        </>
      )}
    </svg>
  );
}

// RHYTHM STRIP — the host path as a thin rule with slot marks along it. Filled
// mini-glyph = placement, hollow circle = rest, faint dot = skipped beat.
// Uneven spacing reads as density. In the VINE strip, leaves grow FROM the
// rule (base on the line, blade off one side, alternating up/down).
export function RhythmStrip({ modeId, glyphRef, lit, width = 128, height = 26, markerFrac = null }) {
  const slots = RHYTHM[modeId] || RHYTHM.alternate;
  const g = MOTIF_GLYPHS[glyphRef] || MOTIF_GLYPHS.leaf;
  const cy = height / 2;
  const pad = 8;
  const step = (width - pad * 2) / (slots.length - 1);
  const fillTint = lit ? "var(--saffron)" : "var(--ink-soft)";
  const restStroke = lit ? "var(--ink)" : "var(--ink-soft)";
  const markerX = markerFrac == null ? null : pad + markerFrac * (width - pad * 2);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {/* the host rule */}
      <line x1={pad} y1={cy} x2={width - pad} y2={cy} stroke="var(--hairline)" strokeWidth="1" />
      {markerX != null && (
        <line x1={markerX} y1={2} x2={markerX} y2={height - 2} stroke="var(--saffron)" strokeWidth="1.5" />
      )}
      {slots.map((s, i) => {
        const x = pad + i * step;
        if (s.t === "skip") {
          return <circle key={i} cx={x} cy={cy} r={1} fill="var(--ink-soft)" opacity={0.4} />;
        }
        if (s.t === "rest") {
          return (
            <circle key={i} cx={x} cy={cy} r={2.4} fill="none" stroke={restStroke} strokeWidth="1" opacity={0.7} />
          );
        }
        // fill
        if (s.side) {
          // a leaf growing from the line: base ON the rule, blade off one side.
          const up = s.side === "up";
          const bladeY = up ? cy - 7 : cy + 7;
          const gr = g.viewRadius;
          const scale = 5 / gr;
          return (
            <g key={i}>
              <line x1={x} y1={cy} x2={x} y2={bladeY} stroke={fillTint} strokeWidth="0.9" />
              <g transform={`translate(${x} ${bladeY}) scale(${scale}) ${up ? "" : "rotate(180)"}`}>
                <path d={g.paths[0].d} fill={fillTint} stroke="none" />
              </g>
            </g>
          );
        }
        const gr = g.viewRadius;
        const scale = 6 / gr;
        return (
          <g key={i} transform={`translate(${x} ${cy}) scale(${scale})`}>
            <path d={g.paths[0].d} fill={fillTint} stroke="none" />
          </g>
        );
      })}
    </svg>
  );
}

// HOST PREVIEW — a small SVG substrate (grid, path, or rectangle) with the
// mode's mock placements. The Trace lights fill placements in order and they
// ACCUMULATE. `traceIndex` = -1 idle → nothing lit; otherwise fills[0..idx]
// stay lit (saffron), the current one gets a halo, future fills are ghosted.
export function HostPreview({ modeId, glyphRef, nodes, order, traceIndex, size = 168, bleed = false }) {
  const g = MOTIF_GLYPHS[glyphRef] || MOTIF_GLYPHS.leaf;
  const litSet = traceIndex < 0 ? null : new Set(order.slice(0, traceIndex + 1));
  const current = traceIndex < 0 ? -1 : order[traceIndex];

  // bleed = the preview reads as the CANVAS REGION itself (full-bleed, no card
  // chrome), used by variant D to simulate "Trace sweeps the live canvas".
  const svgProps = bleed
    ? { width: "100%", height: "100%", preserveAspectRatio: "xMidYMid meet", className: "" }
    : { width: size, height: size, className: "rounded-sm border border-hairline bg-paper" };

  return (
    <svg
      {...svgProps}
      viewBox="0 0 100 100"
      data-testid="proto-host-preview"
      role="img"
      aria-label={`${modeById(modeId).name} placement preview`}
    >
      {/* substrate — faint under bleed so the real canvas reads through */}
      {modeId === "vine" ? (
        <path
          d={vinePathD(nodes)}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth="0.8"
        />
      ) : modeId === "border" ? (
        <rect x={12} y={16} width={76} height={68} fill="none" stroke="var(--hairline)" strokeWidth="0.6" />
      ) : (
        <GridLines />
      )}

      {nodes.map((n, i) => {
        if (n.role === "skip") {
          return <circle key={i} cx={n.x} cy={n.y} r={0.9} fill="var(--ink-soft)" opacity={0.35} />;
        }
        if (n.role === "rest") {
          return (
            <circle key={i} cx={n.x} cy={n.y} r={1.7} fill="none" stroke="var(--ink-soft)" strokeWidth="0.5" opacity={0.5} />
          );
        }
        // fill node
        const isLit = litSet ? litSet.has(i) : true; // idle → show the full pattern lit-neutral
        const isCurrent = i === current;
        const tint = litSet
          ? isLit
            ? "var(--saffron)"
            : "var(--ink-soft)"
          : "var(--ink)";
        const op = litSet ? (isLit ? 1 : 0.22) : 0.85;
        const gr = g.viewRadius;
        const baseScale = 3.6 / gr;
        if (n.side) {
          const up = n.side === "up";
          const bladeY = n.y + (up ? -5 : 5);
          return (
            <g key={i} opacity={op}>
              <line x1={n.x} y1={n.y} x2={n.x} y2={bladeY} stroke={tint} strokeWidth="0.5" />
              {isCurrent && <circle cx={n.x} cy={bladeY} r={4.5} fill="var(--saffron)" opacity={0.18} />}
              <g transform={`translate(${n.x} ${bladeY}) scale(${baseScale}) ${up ? "" : "rotate(180)"}`}>
                <path d={g.paths[0].d} fill={tint} stroke="none" />
              </g>
            </g>
          );
        }
        return (
          <g key={i} opacity={op}>
            {isCurrent && <circle cx={n.x} cy={n.y} r={4.5} fill="var(--saffron)" opacity={0.18} />}
            <g transform={`translate(${n.x} ${n.y}) scale(${baseScale})`}>
              <path d={g.paths[0].d} fill={tint} stroke="none" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

function GridLines() {
  const lines = [];
  for (let i = 1; i < 8; i++) {
    const x = (i * 100) / 8;
    lines.push(<line key={`v${i}`} x1={x} y1={6} x2={x} y2={94} stroke="var(--hairline)" strokeWidth="0.4" />);
  }
  for (let i = 1; i < 6; i++) {
    const y = (i * 100) / 6;
    lines.push(<line key={`h${i}`} x1={6} y1={y} x2={94} y2={y} stroke="var(--hairline)" strokeWidth="0.4" />);
  }
  return <g opacity={0.7}>{lines}</g>;
}

function vinePathD(nodes) {
  if (!nodes.length) return "";
  return nodes.map((n, i) => `${i === 0 ? "M" : "L"}${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(" ");
}
