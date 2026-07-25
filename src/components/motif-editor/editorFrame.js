// editorFrame — the pen editor's STABLE viewBox frame.
//
// Why this exists: the modal used to derive its viewBox from the working copy's
// bounds on every render, with proportional padding (`pad = 0.14 * max(w,h)`).
// That made the frame chase the geometry — and worse, AMPLIFY it: dragging an
// anchor 1 unit outward grew the box by 1 + 2·0.14 units, and the changed viewBox
// changed the SVG CTM, so the next pointermove mapped the same cursor position to
// a different model point. The view appeared to flee the cursor ("it scrolls away
// / zooms out") the moment a drag reached the edge of the content.
//
// The fix is to decouple the frame from the geometry:
//   • It is computed ONCE when the editor opens, square, with generous empty
//     space around the motif (FRAME_PAD) so ordinary editing never reaches an edge.
//   • It NEVER changes during a gesture — panning and zooming are the user's job
//     (Space+drag / wheel), not the frame's.
//   • It only ever GROWS, on commit, and only when geometry has actually escaped
//     it — a safety net so you can't strand a point off-screen, not a tracker.

/** Empty space around the motif, as a fraction of its larger dimension, per side. */
export const FRAME_PAD = 0.5;

/** Extra breathing room added when an escaped point forces a grow, as a fraction
 *  of the CURRENT frame side. Absolute at grow time — never compounds per event. */
const GROW_MARGIN = 0.15;

/** A square frame centred on `bounds`, padded by `padFactor` per side. */
export function frameFromBounds(bounds, padFactor = FRAME_PAD) {
  const { minX, minY, maxX, maxY } = bounds || {};
  const w = Math.max((maxX ?? 0) - (minX ?? 0), 0);
  const h = Math.max((maxY ?? 0) - (minY ?? 0), 0);
  // A square frame keeps `span` honest under preserveAspectRatio="xMidYMid meet":
  // a wide-short glyph in a wide-short box gets wildly asymmetric breathing room,
  // and every span-derived size (grid step, hit tolerance, marker radii) drifts
  // with the aspect ratio. One side, both axes.
  const side = Math.max(w, h, 1) * (1 + padFactor * 2);
  const cx = ((minX ?? 0) + (maxX ?? 0)) / 2;
  const cy = ((minY ?? 0) + (maxY ?? 0)) / 2;
  return { x: cx - side / 2, y: cy - side / 2, side };
}

/** Is every corner of `bounds` inside `frame`? */
export function frameContains(frame, bounds) {
  if (!frame || !bounds) return true;
  const { minX, minY, maxX, maxY } = bounds;
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return true;
  return (
    minX >= frame.x &&
    minY >= frame.y &&
    maxX <= frame.x + frame.side &&
    maxY <= frame.y + frame.side
  );
}

/**
 * Grow `frame` just enough to contain `bounds` (plus a margin). Returns the SAME
 * object when nothing escaped — identity is the signal "no re-render needed", and
 * it's what keeps the frame perfectly still during normal editing.
 */
export function growFrame(frame, bounds) {
  if (frameContains(frame, bounds)) return frame;
  const m = frame.side * GROW_MARGIN;
  const x0 = Math.min(frame.x, bounds.minX - m);
  const y0 = Math.min(frame.y, bounds.minY - m);
  const x1 = Math.max(frame.x + frame.side, bounds.maxX + m);
  const y1 = Math.max(frame.y + frame.side, bounds.maxY + m);
  const side = Math.max(x1 - x0, y1 - y0);
  // Re-square around the union's centre so both axes keep the same scale.
  return { x: (x0 + x1) / 2 - side / 2, y: (y0 + y1) / 2 - side / 2, side };
}

/** SVG `viewBox` attribute for a frame. */
export function frameToBox(frame) {
  return `${frame.x} ${frame.y} ${frame.side} ${frame.side}`;
}
