// Placement geometry and value constants for the per-glyph popover (#139).
//
// Split out of GlyphPopover.jsx because a component file may only export
// components (react-refresh) — and because this is pure arithmetic that
// deserves to be pinned by tests without rendering anything.

/** px between a surface and the thing it hangs off. */
export const GAP = 6;
/** px of minimum clearance from the viewport edge. */
export const EDGE = 8;

/* -- the scale control's range, shared with its tests --------------------- */
export const SCALE_MIN = 0.25;
export const SCALE_MAX = 4;
/** 1% grid — 71% and 72% are distinct values (#135's verdict). */
export const SCALE_STEP = 0.01;
export const SCALE_FORMAT = (v) => `${Math.round(v * 100)}%`;
/** Paired with SCALE_FORMAT, or a typed "130%" parses as 130 and snaps to max. */
export const SCALE_PARSE = (s) => parseFloat(String(s).replace(/[^\d.eE+-]/g, "")) / 100;

const intersects = (a, b) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

export const viewportSize = () => ({
  w: typeof window === "undefined" ? 0 : window.innerWidth,
  h: typeof window === "undefined" ? 0 : window.innerHeight,
});

/**
 * Place a surface relative to `anchor`, keeping clear of `avoid` when it can.
 *
 * Below the anchor by default; flipped ABOVE when the surface would run past
 * the viewport bottom. Horizontally, four alignments are tried in order and the
 * first that both fits the viewport AND does not cover `avoid` wins. If none
 * clears it, the surface is clamped on-screen and the overlap is accepted —
 * clamping beats vanishing off the edge.
 *
 * The vertical flip is what makes the horizontal dodge necessary at all: below
 * the anchor a surface runs away from the glyph, but flipped above it runs
 * straight over the thing being edited.
 *
 * @param {{top:number,left:number,right:number,bottom:number}} anchor
 * @param {{w:number,h:number}} size
 * @param {{top:number,left:number,right:number,bottom:number}} [avoid]
 * @param {{w:number,h:number}} [vp]
 * @returns {{top:number,left:number,flipped:boolean,dodged:boolean}}
 */
export function placeSurface(anchor, size, avoid, vp = viewportSize()) {
  const belowTop = anchor.bottom + GAP;
  const flipped = belowTop + size.h > vp.h - EDGE;
  const top = flipped ? Math.max(EDGE, anchor.top - GAP - size.h) : belowTop;

  const lefts = [
    anchor.left, // start-aligned with the anchor
    anchor.right - size.w, // end-aligned
    anchor.right + GAP, // pushed off the anchor's right
    anchor.left - GAP - size.w, // pushed off the anchor's left
  ];
  const fits = (l) => l >= EDGE && l + size.w <= vp.w - EDGE;

  let left = null;
  let skipped = 0;
  for (const l of lefts) {
    if (!fits(l)) continue;
    const box = { left: l, right: l + size.w, top, bottom: top + size.h };
    if (avoid && intersects(box, avoid)) {
      skipped += 1;
      continue; // would cover the glyph being edited — try the next alignment
    }
    left = l;
    break;
  }
  const dodged = skipped > 0 && left !== null;
  if (left === null) {
    left = Math.min(
      Math.max(lefts.find(fits) ?? anchor.left, EDGE),
      Math.max(EDGE, vp.w - EDGE - size.w),
    );
  }
  return { top, left, flipped, dodged };
}

/**
 * The screen-space box a glyph occupies, derived from its DOT's screen rect.
 *
 * The overlay draws inside a CSS-scaled box, so canvas units and screen pixels
 * differ by a zoom factor this component never sees. But the dot is drawn at a
 * KNOWN canvas radius, so its measured screen width divides straight out to that
 * factor — no need to thread `finalScale` down from RightPanel.
 *
 * @param {DOMRect} dotRect        the dot's screen rect
 * @param {number} dotCanvasRadius the radius the dot was drawn at, in canvas units
 * @param {number} glyphRadius     the glyph's radius, in canvas units
 */
export function glyphScreenRect(dotRect, dotCanvasRadius, glyphRadius) {
  if (!dotRect || !(dotCanvasRadius > 0) || !(glyphRadius > 0)) return null;
  const scale = dotRect.width / (2 * dotCanvasRadius);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const r = glyphRadius * scale;
  const cx = dotRect.left + dotRect.width / 2;
  const cy = dotRect.top + dotRect.height / 2;
  return { left: cx - r, right: cx + r, top: cy - r, bottom: cy + r };
}
