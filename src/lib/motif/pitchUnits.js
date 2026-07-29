// pitchUnits.js — the arithmetic and the strip geometry behind the ANCHOR-PITCH
// control (PRD #184, PR 2). Spec of record: `docs/pitch-control-BUILD-SPEC.md`,
// which rules on top of `docs/pitch-control-graphic-decisions.md`.
//
// Pure functions and constants only, no React — so §7's data-integrity checks
// (the N-toggle round trip, "type 4.2 ⇒ spacing 24", the floor) are unit tests
// over numbers rather than assertions about pixels that jsdom cannot measure.
//
// THE ONE THING THIS MODULE EXISTS TO PROTECT. `spacing` is the stored,
// canonical unit (hold-doc decision 12); `density` is a DISPLAY TRANSFORM over
// it, `density = 100 / spacing` (decision 2). Decision 7 makes the round-trip
// hazard live — in density state every drag frame writes back through `100/d` —
// and decision 8 is what pays for it: THE SYSTEM PERFORMS EXACTLY ONE ROUNDING,
// and it is `spacingFromDensity` below. Nothing else rounds, and the unit toggle
// writes nothing at all, so bit-identity across N toggles is structural rather
// than a property somebody has to maintain.
//
//   drag    → DragNumber (step 0.001, geometric)  ← its own quantization is
//           → emits d = 4.1873                       deliberately transparent
//   parent  → spacingFromDensity(d) = 24          ← THE ONLY ROUNDING
//           → stores 24
//   display → densityOf(24) = 4.166… → "4.2"      ← re-derived every render
import { MIN_EDGE_SPACING } from './anchors.js';

/* ------------------------------------------------------------------ range */

/** The floor is `anchors.js`'s own, imported rather than restated — the control
 *  must SHOW this limit, never silently clamp against a private copy of it. */
export const MIN_SPACING = MIN_EDGE_SPACING;

/** Ceiling (decision 6). Seven clean doublings off the floor (4·2⁷ = 512), and
 *  chosen so the top of the range still does something: at 512 a long host edge
 *  on the default 1152-unit canvas still receives 2–3 anchors. */
export const MAX_SPACING = 512;

/** `motifLayer.js:80` — the value a new motif is created with. */
export const DEFAULT_SPACING = 24;

/** The density window is literally this many host units wide (decision 2), so
 *  the displayed number counts the dots you can see inside the mark. */
export const WINDOW_UNITS = 100;

export const MIN_DENSITY = WINDOW_UNITS / MAX_SPACING; // 0.1953125
export const MAX_DENSITY = WINDOW_UNITS / MIN_SPACING; // 25

/** DragNumber's step in DENSITY state. Deliberately finer than anything the
 *  display shows: if it quantized on the density scale it would fight the
 *  spacing grid — the number would jump to one value, the parent snap it to
 *  another, and the readout show a third (decision 8). */
export const DENSITY_STEP = 0.001;

export const clampSpacing = (s) => Math.max(MIN_SPACING, Math.min(MAX_SPACING, s));

/** Display transform. Never stored, re-derived from the stored spacing on every
 *  render — never held as independent state (decision 8). */
export const densityOf = (spacing) => WINDOW_UNITS / spacing;

/**
 * THE ONLY ROUNDING IN THE SYSTEM (decision 8), and it lives in the parent.
 *
 * A non-positive or non-finite density is read as "infinitely sparse", which
 * the range's own ceiling already expresses. Nothing in the app can produce one
 * — `DragNumber` clamps its raw value inside [MIN_DENSITY, MAX_DENSITY] on every
 * move and refuses a non-finite type-in before it ever calls back — so this is a
 * guard against a future caller, not a live path.
 */
export function spacingFromDensity(d) {
  if (!Number.isFinite(d) || d <= 0) return MAX_SPACING;
  return clampSpacing(Math.round(WINDOW_UNITS / d));
}

/** 1dp at d ≥ 1, 2dp below (decision 8). Below 1 a single decimal would collapse
 *  the whole sparse third of the range onto "0.2". */
export const formatDensity = (d) => (d >= 1 ? d.toFixed(1) : d.toFixed(2));

/**
 * `DragNumber`'s DEFAULT_PARSE strips EVERY non-numeric character, so it reads
 * "4.2 /100u" as 4.2100 — the digits inside the unit suffix are swallowed into
 * the mantissa. Both states therefore parse the LEADING numeric token only.
 * This is the exact hazard `DragNumber.jsx:76-86` warns about, reached by a
 * route that does not rescale the value.
 */
export const parseLeading = (s) =>
  parseFloat(String(s).trim().match(/^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/)?.[0] ?? '');

/** At (or below) `MIN_EDGE_SPACING`. The graphic says so out loud rather than
 *  letting the numeral simply stop moving. */
export const isAtFloor = (spacing) => spacing <= MIN_SPACING;

/**
 * The two readings of the one stored value, in the shape `UnitToggle` wants.
 *
 * "Spacing" is the word because `edgeOpts.spacing` is the field on disk — the
 * label and the data say the same thing. `a11yLabel` carries the UNIT and not
 * just the word: the graphic is `aria-hidden` (ruling B), so the toggle is the
 * only surface that can state what each reading measures.
 *
 * Module-level so the array identity is stable — `UnitToggle` re-measures its
 * option boxes whenever the id list changes.
 */
export const UNIT_OPTIONS = [
  { id: 'density', label: 'Density', a11yLabel: 'Density, anchors per 100 units' },
  { id: 'spacing', label: 'Spacing', a11yLabel: 'Spacing, units between anchors' },
];

/* --------------------------------------------------------- strip geometry */

/** Quiet margin inside the strip, px. */
export const STRIP_PAD = 10;

/**
 * The rule spans this many host units; the density window is the middle 100.
 *
 * WHY A FIXED RATIO RATHER THAN CANVAS ZOOM. The prototype drew at true canvas
 * scale whenever `100 × zoom` fitted the strip and compressed otherwise, badged
 * "to scale" / "not to scale". Ruling C deleted the badge and kept only the
 * behaviour — "always draw fitted to the strip" — so the graphic no longer makes
 * any claim about scale, and there is nothing left for zoom to keep honest.
 * Reaching canvas zoom from the Inspector is new plumbing through Studio →
 * AppShell → Inspector for no user-visible difference, so it is not threaded.
 *
 * 160 rather than 100 so the rule visibly EXTENDS PAST the window on both
 * sides. A window that filled the strip would stop reading as a mark ON a rule,
 * and the dots outside it are what make "count the ones inside" a measurement
 * rather than a tautology.
 */
export const RULE_UNITS = 160;

/** Hard guard on the dot loop, not a design limit — at the floor a very wide
 *  rail asks for ~40 dots, so this is never reached in practice. */
const MAX_DOTS = 220;

/**
 * Everything the graphic needs that depends on the strip's measured width.
 *
 * Keyed to the STRIP WIDTH ONLY, never to the value: dragging the number moves
 * dots, and must never rescale the rule underneath them.
 *
 * `measured: false` means the strip has not been laid out yet (SSR, the first
 * paint, a collapsed panel). Callers draw nothing rather than drawing at a
 * guessed width.
 */
export function computeStripGeometry({ spacing, stripWidth }) {
  const inner = Math.max(0, (Number.isFinite(stripWidth) ? stripWidth : 0) - STRIP_PAD * 2);
  const measured = inner > 0;
  const pxPerUnit = measured ? inner / RULE_UNITS : 0;
  const windowPx = WINDOW_UNITS * pxPerUnit;
  const windowX = STRIP_PAD + (inner - windowPx) / 2;
  const safeSpacing = Number.isFinite(spacing) && spacing > 0 ? spacing : 0;
  return { measured, pxPerUnit, windowPx, windowX, stepPx: safeSpacing * pxPerUnit };
}

/**
 * The anchor dots, PHASE-LOCKED TO A HALF STEP off the window's left edge
 * (decision 12).
 *
 * Decision 2 promises "count the dots inside the rectangle and you get the
 * number in the field". That is FALSE under an arbitrary phase: dots sitting on
 * the window edges give a fencepost +1, so spacing 24 shows five dots against a
 * numeral of 4.2. Half-step phase makes the visible count `round(100/spacing)`,
 * and exact whenever `100/spacing` is a whole number.
 *
 * ⚠️ ONE QUALIFICATION on decision 12, found by testing. Dot `k` sits at
 * `k + 0.5` steps, so the exact count is `ceil(100/spacing − 0.5)`. That agrees
 * with `round` everywhere except an EXACT half: spacing 8 reads "12.5" and shows
 * twelve dots, where `Math.round` would say thirteen. Left alone — you cannot
 * draw half a dot and either neighbour is equally true.
 *
 * The dots are SCHEMATIC (decision 4) — evenly spaced, no host read, no
 * `resolvePlacements`, no per-frame resample. `sampleEdgeAnchors` arc-length-
 * resamples, so on any single host path the real anchors are pixel-identical to
 * these anyway; "real" would only buy path ends and the rest/skip story, and the
 * rest/skip story already belongs to the footprint overlay, which draws it on
 * the canvas at real size.
 *
 * Keys are the integer index `k`, stable across spacing changes, so a dot that
 * survives a drag animates rather than being torn down and rebuilt.
 *
 * THE CENTRE PAIR IS FORCE-INCLUDED (§7c). Past roughly spacing 144 at the
 * 224px rail floor the natural range holds fewer than two dots and the
 * dimension line — which grips a PAIR — would simply stop drawing over the top
 * third of the locked range. Including the pair straddling the strip centre lets
 * the mark draw itself truncated instead, with the caret that says "this gap
 * continues past here".
 */
export function dotField({ windowX, windowPx, stepPx, stripWidth }) {
  if (!(stepPx > 0)) return [];
  const first = windowX + stepPx / 2;
  const kC = Math.floor((stripWidth / 2 - first) / stepPx);
  const kLo = Math.min(Math.ceil((-STRIP_PAD - first) / stepPx), kC);
  const kHi = Math.min(
    kLo + MAX_DOTS,
    Math.max(Math.floor((stripWidth + STRIP_PAD - first) / stepPx), kC + 1),
  );
  const out = [];
  for (let k = kLo; k <= kHi; k++) {
    const x = first + k * stepPx;
    out.push({ k, x, inWindow: x >= windowX - 0.01 && x < windowX + windowPx - 0.01 });
  }
  return out;
}

/** The adjacent PAIR the dimension line grips: the two dots whose midpoint sits
 *  closest to `centreX`. Null when there are fewer than two dots to span. */
export function gripPair(dots, centreX) {
  if (dots.length < 2) return null;
  let best = 0;
  let bestDist = Math.abs((dots[0].x + dots[1].x) / 2 - centreX);
  for (let i = 1; i < dots.length - 1; i++) {
    const dist = Math.abs((dots[i].x + dots[i + 1].x) / 2 - centreX);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return [dots[best], dots[best + 1]];
}

/** Decade-stepping tick scale: the coarsest unit whose ticks are still at least
 *  6px apart, so the rule never turns into a grey band. */
export function tickUnit(pxPerUnit) {
  if (!(pxPerUnit > 0)) return 1000;
  for (const u of [1, 2, 5, 10, 25, 50, 100, 250, 500]) if (u * pxPerUnit >= 6) return u;
  return 1000;
}
