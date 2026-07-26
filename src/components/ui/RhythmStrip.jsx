// RhythmStrip — a drawn reading of a motif's CHAIN as marks along the host line.
//
// A motif chain (route → sequence / everyN / density …) decides not just WHERE
// glyphs land but in what RHYTHM. This strip renders that rhythm literally: a
// thin host "rule" with marks read straight off the chain the same way
// starterChips.js builds them, so a reader sees "glyph, rest, glyph, rest" or
// "every third beat" without reading block labels.
//
// Which chain branch drives the marks (precedence — a terminal `sequence` wins,
// then the positional filters, and route is only ever the fallback because
// EVERY chain carries a route block):
//   • sequence → its slots in order, repeated to ~5 positions. A glyph slot
//     draws a MINIATURE of the real glyph (MOTIF_GLYPHS path, scaled like
//     GlyphThumb); a rest slot draws a hollow circle. A slot's rotationOffset is
//     applied on top of the placement's base orientation (see below).
//   • everyN → a filled beat on every Nth position, faint skip dots between.
//   • density → 3 filled marks at fixed, deterministic, UNEVEN positions.
//   • route-only → evenly spaced filled dots.
// `data-mark`: "glyph" = a placement mark (a glyph miniature when the source
// slot names a glyph, else a plain filled dot), "rest" = a deliberate empty
// beat (hollow), "skip" = a beat a filter passed over (faint).
//
// ORIENTATION (the vine 180° reading): placement orients glyphs 'path' +
// useNormal (starterChips PLACEMENT / placementEngine), i.e. a glyph's local +x
// axis maps to the host path's NORMAL. On this strip the rule IS the path, so +x
// maps PERPENDICULAR to the (horizontal) rule — that is BASE_ROT below (−90°,
// +x → straight up). A slot's rotationOffset then adds on top, so the vine's
// `rotationOffset:180` leaf turns to −90+180 = +90° (+x → straight down): the
// base-at-origin leaf grows off the OTHER side of the rule, giving the
// above/below vine alternation. Symmetric glyphs (rosette/dot/diamond) are
// unaffected by the base turn; only the asymmetric, base-at-origin leaf reveals
// it — which is the whole point of the vine example.
//
// House rules (GlyphThumb.jsx): pure SVG, `currentColor` only (caller tints via
// text color), opacity the only tone control; aria-hidden decorative; memo'd
// because it renders in dense rack/library surfaces.
import { memo } from "react";
import { MOTIF_GLYPHS } from "../../lib/motif/glyphs";

// Fixed 7:1 strip authored in view units; `size` scales the pixel HEIGHT.
const W = 112;
const H = 16;
const PAD = 6;
const CY = H / 2;
const INNER = W - PAD * 2;
const RATIO = W / H;

const TARGET_SLOTS = 5; // sequence fill length (~5 positions)
const EVERYN_BEATS = 3; // beats shown for an everyN rhythm
const GLYPH_R = 5.6; // target mark radius glyphs are normalised to
const DOT_R = 2.4; // filled placement dot
const REST_R = 2.4; // hollow rest circle
const SKIP_R = 1.2; // faint skipped-beat dot
const SKIP_OPACITY = 0.35;
const BASE_ROT = -90; // +x (off-line growth axis) → perpendicular to the rule

// Density marks: fixed, deterministic, deliberately UNEVEN fractions (0..1).
const DENSITY_FRACS = [0.12, 0.46, 0.83];

const xAt = (frac) => PAD + frac * INNER;
// Evenly spaced x's for n marks across the inner span (n===1 → centre).
const evenXs = (n) =>
  n <= 1 ? [W / 2] : Array.from({ length: n }, (_, i) => PAD + (i * INNER) / (n - 1));

/** A glyph miniature laid at (x, CY), turned by BASE_ROT + rotationOffset. */
function GlyphMark({ x, glyphRef, rotationOffset = 0 }) {
  const g = MOTIF_GLYPHS[glyphRef];
  if (!g) return <FilledDot x={x} />; // unknown glyph → still a placement mark
  // `viewRadius` is the max distance from the glyph's ROOT (not from the local
  // origin), so the scale is only right once the root sits at the origin —
  // exactly what placementMatrix does on canvas with its trailing
  // R(−root.angle)·T(−root). Mirror that here or an imported glyph, whose art
  // lives in its source user space, is flung far off the rule. The core
  // built-ins omit `root`, so this appends an identity and their transform is
  // unchanged — which is what preserves the base-at-origin leaf's documented
  // above/below vine reading (see ORIENTATION above).
  const root = g.root || { x: 0, y: 0, angle: 0 };
  const scale = GLYPH_R / g.viewRadius;
  const rot = BASE_ROT + rotationOffset;
  const deRoot =
    root.x === 0 && root.y === 0 && root.angle === 0
      ? ""
      : ` rotate(${-root.angle}) translate(${-root.x} ${-root.y})`;
  return (
    <g
      data-mark="glyph"
      data-glyph={glyphRef}
      data-rotation-offset={rotationOffset}
      data-x={x}
      transform={`translate(${x} ${CY}) rotate(${rot}) scale(${scale})${deRoot}`}
    >
      {g.paths.map((p, i) => (
        <path key={i} d={p.d} fill="currentColor" stroke="none" />
      ))}
    </g>
  );
}

/** A plain filled placement dot (a beat with no named glyph). */
function FilledDot({ x }) {
  return <circle data-mark="glyph" data-x={x} cx={x} cy={CY} r={DOT_R} fill="currentColor" />;
}

function RestMark({ x }) {
  return (
    <circle
      data-mark="rest"
      data-x={x}
      cx={x}
      cy={CY}
      r={REST_R}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      opacity={0.7}
    />
  );
}

function SkipMark({ x }) {
  return (
    <circle
      data-mark="skip"
      data-x={x}
      cx={x}
      cy={CY}
      r={SKIP_R}
      fill="currentColor"
      opacity={SKIP_OPACITY}
    />
  );
}

/** Build the mark elements for a chain, by branch precedence. */
function marksForChain(chain) {
  const blocks = Array.isArray(chain) ? chain : [];
  const sequence = blocks.find((b) => b && b.type === "sequence");
  const everyN = blocks.find((b) => b && b.type === "everyN");
  const density = blocks.find((b) => b && b.type === "density");

  // sequence — slots in order, repeated to ~TARGET_SLOTS positions. A ZONED
  // sequence (ADR 0008 — `zones`, no flat `slots`) reads as its zones' slots in
  // stored order (Apex then Stem for the Vine): the strip is a one-glance rhythm
  // summary, not a placement preview, so flattening the zones is the honest
  // small-space rendering of "flowers at the ends, leaves along the stem".
  const seqSlots = sequence
    ? Array.isArray(sequence.zones)
      ? sequence.zones.flatMap((z) => (z && Array.isArray(z.slots) ? z.slots : []))
      : sequence.slots
    : null;
  if (sequence && Array.isArray(seqSlots) && seqSlots.length) {
    const slots = seqSlots;
    const positions = evenXs(TARGET_SLOTS);
    return positions.map((x, i) => {
      const slot = slots[i % slots.length];
      if (slot.rest || !slot.glyphRef) return <RestMark key={i} x={x} />;
      return (
        <GlyphMark
          key={i}
          x={x}
          glyphRef={slot.glyphRef}
          rotationOffset={slot.rotationOffset || 0}
        />
      );
    });
  }

  // everyN — filled beat on every Nth position, faint skips between.
  if (everyN) {
    const n = everyN.n >= 1 ? Math.floor(everyN.n) : 1;
    const offset = everyN.offset || 0;
    const total = Math.min(EVERYN_BEATS * n, 13);
    const positions = evenXs(total);
    return positions.map((x, i) =>
      ((((i - offset) % n) + n) % n) === 0 ? (
        <FilledDot key={i} x={x} />
      ) : (
        <SkipMark key={i} x={x} />
      )
    );
  }

  // density — 3 fixed, deterministic, uneven placements.
  if (density) {
    return DENSITY_FRACS.map((f, i) => <FilledDot key={i} x={xAt(f)} />);
  }

  // route-only (or empty) — evenly spaced filled dots.
  return evenXs(TARGET_SLOTS).map((x, i) => <FilledDot key={i} x={x} />);
}

function RhythmStrip({ chain, size = 16, markerFrac = null }) {
  const height = size;
  const width = size * RATIO;
  const markerX = markerFrac == null ? null : xAt(markerFrac);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {/* the host rule — muted so the marks read as the subject */}
      <line
        x1={PAD}
        y1={CY}
        x2={W - PAD}
        y2={CY}
        stroke="currentColor"
        strokeOpacity={0.4}
        strokeWidth={1}
      />
      {markerX != null && (
        <line
          data-testid="rhythm-marker"
          x1={markerX}
          y1={1.5}
          x2={markerX}
          y2={H - 1.5}
          stroke="currentColor"
          strokeWidth={1.4}
        />
      )}
      {marksForChain(chain)}
    </svg>
  );
}

export default memo(RhythmStrip);
