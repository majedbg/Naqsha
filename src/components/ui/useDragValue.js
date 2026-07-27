// useDragValue — the drag mechanics shared by `DragNumber` and `DragDial`.
//
// Extracted VERBATIM from DragNumber (#138) when the per-glyph popover (#139)
// needed a second control with the identical feel. The law is absolute
// position → value: pointer POSITION drives the value, never pointer velocity,
// so the same travel always buys the same change and letting go mid-gesture
// never overshoots.
//
// What the two controls share is exactly this file: pointer capture, the 3px
// click-vs-scrub threshold, per-move `dy × gain` accumulation into a raw that
// runs across the whole gesture, quantise-then-emit-on-change, and one
// `onCommit` per gesture with no-op suppression.
//
// What they do NOT share is parameterised:
//   advance(raw, dy, gain) → raw'   how a pixel becomes value. DragNumber adds
//                                   steps or multiplies by doublings and CLAMPS;
//                                   DragDial adds degrees and lets raw run free.
//   quantize(raw) → value           snap-to-grid. DragDial additionally wraps.
//   onClick()                       what a press-without-drag means. DragNumber
//                                   opens its type-in editor; DragDial opens the
//                                   big radial flyout.
//
// SEAM — two callbacks, deliberately different jobs:
//   onChange(next)  live. Every grid crossing during a drag. Drive preview off it.
//   onCommit(next)  ONCE per gesture, on pointer-up. Create the undo entry off
//                   this and you get exactly one per gesture.
// A gesture that ends where it started emits neither: no no-op undo entries.
import { useRef, useState } from "react";

/** px of travel before a press counts as a scrub rather than a click. */
export const MOVE_THRESHOLD = 3;

/** Modifier gains. These scale TRAVEL (px sensitivity) — never the step grid. */
export const DEFAULT_GAINS = { coarse: 2, fine: 0.1 };

export default function useDragValue({
  value,
  /** (raw, dy, gain) → next raw. `dy` is positive when the pointer moves UP. */
  advance,
  /** raw → the value actually emitted (snap, clamp and/or wrap). */
  quantize,
  onChange,
  onCommit,
  /** Press-and-release without crossing the threshold. */
  onClick,
  gains = DEFAULT_GAINS,
  /** When true the control ignores pointer input entirely. */
  disabled = false,
}) {
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dir, setDir] = useState(null); // 'up' | 'down' while dragging

  const onPointerDown = (e) => {
    if (disabled) return;
    e.preventDefault();
    drag.current = {
      lastY: e.clientY,
      startY: e.clientY,
      raw: value,
      start: value,
      last: value, // last value EMITTED — not the prop, which a parent may lag
      moved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom / non-pointer env */
    }
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved) {
      // Below the threshold nothing accumulates — jitter must not turn a click
      // into a scrub. Once crossed, the travel counts from the grab point.
      if (Math.abs(d.startY - e.clientY) < MOVE_THRESHOLD) return;
      d.moved = true;
      setDragging(true);
    }
    const dy = d.lastY - e.clientY; // up = positive
    d.lastY = e.clientY;
    if (dy === 0) return;
    setDir(dy > 0 ? "up" : "down");

    const gain = e.shiftKey ? gains.coarse : e.altKey ? gains.fine : 1;
    d.raw = advance(d.raw, dy, gain);

    const next = quantize(d.raw);
    if (next !== d.last) {
      d.last = next;
      onChange?.(next);
    }
  };

  const endDrag = (e, allowClick) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    setDir(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (!d) return;
    if (!d.moved) {
      if (allowClick) onClick?.();
      return;
    }
    if (d.last !== d.start) onCommit?.(d.last);
  };

  return {
    dragging,
    dir,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e) => endDrag(e, true),
      onPointerCancel: (e) => endDrag(e, false),
    },
  };
}
