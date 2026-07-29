// gestureFlush — ONE undo entry per gesture, with the canvas following the drag.
//
// Lifted VERBATIM out of `MotifBlockRack.jsx` when the anchor-pitch control
// (PRD #184, PR 2) needed the identical boundary-drawing around a `DragNumber`
// on a layer field. Same reasoning as `useDragValue`'s own extraction: the
// listener lifecycle below is subtle enough that a second copy would drift.
//
// It lives in its own non-component `.js` module rather than being exported
// from `MotifBlockRack.jsx` because react-refresh requires a component file to
// export components only — the same constraint that shaped
// `footprintRevealContext.js` and `runPlanContext.js`.
//
// ── WHY A FLUSH AT ALL ─────────────────────────────────────────────────────
// `updateLayer` coalesces by `${id}:params` for 400ms, so every write in a
// burst already folds into one entry — including writes from a DIFFERENT
// control, which carry an identical signature. The flush is what draws the
// boundaries: once BEFORE a gesture's first write (so an Inspector burst on the
// same layer cannot swallow it) and once when it commits.
//
// ── WHY THE POINTERUP LISTENER IS NOT BELT-AND-BRACES ──────────────────────
// `useDragValue` suppresses `onCommit` when a gesture ends exactly where it
// started (useDragValue.js:120) — but the intermediate frames DID write — so a
// latch cleared only by `onCommit` would stay open and let the NEXT gesture
// join this entry. Closing unconditionally on pointerup costs a redundant flush
// at worst (a no-op, the same double-flush `AnchorGhostOverlay` already does
// around discrete actions).
import { useEffect, useRef } from "react";

/**
 * @param {() => void} onFlushHistory  closes the undo-coalescing window.
 * @returns {{begin: () => void, end: () => void}}
 *   `begin` before a gesture's first write, `end` on commit. Both idempotent.
 */
export default function useGestureFlush(onFlushHistory) {
  const open = useRef(false);
  // Detaches the pending pointerup, or null when none is armed. The listener
  // MUST NOT outlive either the gesture or the component: a slot deleted
  // mid-drag would otherwise flush history from something that no longer exists.
  const detach = useRef(null);
  useEffect(() => () => detach.current?.(), []);

  const close = () => {
    detach.current?.();
    if (!open.current) return;
    open.current = false;
    onFlushHistory();
  };

  const begin = () => {
    if (open.current) return;
    open.current = true;
    onFlushHistory();
    const onUp = () => {
      detach.current = null; // already removed by {once:true}
      close();
    };
    window.addEventListener("pointerup", onUp, { once: true });
    detach.current = () => {
      window.removeEventListener("pointerup", onUp);
      detach.current = null;
    };
  };

  return { begin, end: close };
}
