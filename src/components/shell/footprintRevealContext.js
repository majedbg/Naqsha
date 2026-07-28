// footprintRevealContext.js — the shared FOOTPRINT REVEAL state (issue #188,
// PRD #184; spec of record `docs/motif-hold-and-pitch-decisions.md`, decisions
// 18 and 19).
//
// One overlay, N triggers. Any control that moves a radius — layer Size, slot
// Scale, per-glyph override scale, spacing/density and `hold` (decision 18) —
// raises the same piece of state, and the footprint overlay (#189) reads it.
// That is why this is a context and not per-control local state: the thing that
// draws is nowhere near the thing that is being dragged.
//
// WHY NOT `:hover` (decision 19). A DragNumber is an invisible vertical slider:
// the drag walks the cursor far outside the field it started in, and the reveal
// must survive that. CSS `:hover` ends the moment the cursor crosses the field's
// edge, so it can express neither "still dragging out here" nor "the gesture is
// over, put the overlay away". The rules this module implements instead:
//
//   reveal   on pointerenter AND on drag start
//   release  on pointerleave AND on drag commit
//   DRAG START WINS over pointerleave — a leave arriving mid-drag never releases
//   unmount mid-drag releases
//
// The failure mode being defended against is a reveal STUCK ON: an overlay left
// drawn over the artwork the user is trying to judge. Three things can strand a
// gesture, and each has a guard in `useFootprintRevealTrigger`:
//
//   1. the drag ends where it started — `useDragValue` then suppresses
//      `onCommit` entirely (useDragValue.js:120), so a reveal cleared only by
//      commit would never clear. A window `pointerup` guard closes it anyway.
//   2. the gesture is cancelled rather than lifted — same guard, on
//      `pointercancel`.
//   3. the control unmounts mid-drag (a slot deleted while its `hold` field is
//      being dragged). `useDragValue` has NO unmount cleanup of its own — it
//      registers no effects at all — so this hook owns its own release.
//
// The guard is modelled on `useGestureFlush` (MotifBlockRack.jsx:622): a
// `{once:true}` window listener, a `detach` ref, and an unmount effect that
// calls it. Detaching is not housekeeping — an orphaned listener would fire on
// the user's NEXT unrelated click and release a reveal somebody else had raised.
//
// NO OWNERSHIP TOKENS, deliberately. `release()` takes no argument (the shape
// decisions 18/19 and issue #188 both specify) and cross-talk is prevented
// structurally instead: native dispatch always fires `pointerleave` on the old
// element BEFORE `pointerenter` on the new one, pointer capture keeps a
// mid-drag pointer from reaching any other control, and each trigger only ever
// releases a reveal IT raised (`raised`). Don't add tokens without a case you
// can actually construct.
//
// Kept in a non-component `.js` module (createElement, no JSX) so the file
// exports a provider and hooks only — react-refresh requires component files to
// export components only. Same reason `runPlanContext.js` is shaped this way.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* --------------------------------------------------------------- scopes */
// THE SCOPE IS OPAQUE HERE. This module stores and hands back whatever a caller
// passes and never looks inside it: no kind enum, no switch, no validation, no
// per-trigger helpers. Lifecycle is this file's job — raise, hold through the
// drag, release. CLASSIFICATION IS THE CONSUMER'S (the overlay, #189). Decision
// 18 lists five triggers and the fifth (spacing/density) is being built in a
// different session against this hook; an enum here would mean reopening this
// file to add to it.
//
// What callers should pass — a convention, enforced nowhere, so that #189 and
// #192 agree on field names. Any flat plain object works (it is compared
// shallowly, so keep it flat and keep the values primitive):
//
//   layer-wide    { kind: 'layer', layerId }
//                 layer Size, spacing/density — nothing narrows it to a slot
//   one slot      { kind: 'slot', layerId, seqIndex, zoneId, slotIndex }
//                 `seqIndex` addresses the sequence inside the layer's chain,
//                 exactly as every chainEditor mutation already does
//                 (`setSlot(chain, seqIndex, slotIndex, …)`).
//                 `zoneId` is the FLAT/ZONED discriminator and it is load-
//                 bearing: in a zoned sequence `slotIndex` is ZONE-LOCAL
//                 (sequencer.js `dealZone`), so apex slot 1 and stem slot 1 are
//                 different slots sharing an index. FLAT sequences pass
//                 `zoneId: null` and are addressed by index alone.
//   one glyph     { kind: 'glyph', layerId, anchorId }
//                 a per-glyph override (#192), keyed the way records are.

/** Shallow, key-order-independent, KEY-AGNOSTIC — it compares whatever keys the
 *  scope happens to carry and ascribes meaning to none of them. Two scopes
 *  describing the same thing are the same reveal, so re-raising one must not
 *  re-render the overlay. */
function sameScope(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

/* -------------------------------------------------------------- context */

// SAFE DEFAULT — no provider: a frozen cleared value, so a control rendered
// outside the provider (an isolated component test, the legacy layout) still
// renders and its gestures are simply inert.
const CLEARED = Object.freeze({ scope: null, reveal() {}, release() {} });

const FootprintRevealContext = createContext(CLEARED);

export function FootprintRevealProvider({ children }) {
  const [scope, setScope] = useState(null);
  const reveal = useCallback((next) => {
    if (!next) return;
    setScope((cur) => (sameScope(cur, next) ? cur : next));
  }, []);
  const release = useCallback(() => setScope(null), []);
  const value = useMemo(() => ({ scope, reveal, release }), [scope, reveal, release]);
  return createElement(FootprintRevealContext.Provider, { value }, children);
}

/**
 * The shared state. `{ scope, reveal, release }` — `scope` is null when nothing
 * is revealed. The overlay reads `scope`; a control that wants to drive the
 * reveal by hand can call `reveal`/`release`, but `useFootprintRevealTrigger`
 * below is the binding that gets the lifecycle right.
 */
export function useFootprintReveal() {
  return useContext(FootprintRevealContext);
}

/* -------------------------------------------------------------- trigger */

/**
 * Bind one control to the reveal. Takes the control's OWN `onChange`/`onCommit`
 * and hands them back wrapped, so the reveal composes with `useDragValue`'s
 * existing seam rather than forking it — there is one gesture system, and a
 * consumer cannot forget half of the lifecycle:
 *
 *   const fp = useFootprintRevealTrigger(scope, {
 *     onChange: (v) => patchLive({ hold: v }),
 *     onCommit: (v) => patchCommit({ hold: v }),
 *   });
 *   <div {...fp.pointerProps}>
 *     <DragNumber … onChange={fp.onChange} onCommit={fp.onCommit} />
 *   </div>
 *
 * `pointerProps` goes on an ELEMENT rather than on the control, because the
 * triggers are not all DragNumbers (spacing/density and layer Size are their own
 * controls) and pointerenter/pointerleave already fire for a whole subtree. Put
 * them on a row the consumer already renders; no extra DOM is required.
 *
 * TWO THINGS A CONSUMER MUST GET RIGHT, neither of which this file can enforce:
 *   • spread them on a DOM ELEMENT. `DragNumber` does not forward unknown props,
 *     so `<DragNumber {...fp.pointerProps}/>` silently does nothing.
 *   • put them on an element that lives as long as the hook does. An element
 *     rendered conditionally INSIDE a mounted trigger can vanish without ever
 *     firing pointerleave, and the unmount release below would not fire either
 *     — the one way left to strand a reveal.
 *
 * DRAG START is the control's first `onChange` of a gesture — the only drag-start
 * signal the seam exposes, and the right one: below the 3px threshold nothing
 * has moved yet. The latch makes it once-per-gesture, which also keeps every
 * later grid crossing from re-arming the window guard.
 *
 * COMMIT RELEASES EVEN IF THE CURSOR NEVER LEFT (decision 19 / #188: "the
 * overlay disappears cleanly rather than obscuring the artwork being judged").
 * Re-entering the field raises it again. A keyboard nudge runs onChange→onCommit
 * back to back and therefore reads as an instant gesture: nothing is left armed.
 *
 * @param {object|null} scope  what this control reveals (see the constructors).
 * @param {{onChange?:Function, onCommit?:Function}} [handlers] the control's own.
 */
export function useFootprintRevealTrigger(scope, handlers = {}) {
  const { reveal, release } = useFootprintReveal();
  /** Did WE raise the reveal currently on screen? Only then may we clear it. */
  const raised = useRef(false);
  /** Open between drag start and the end of that gesture. */
  const dragging = useRef(false);
  /** Removes the pending window guard, or null when none is armed. */
  const detach = useRef(null);

  // Read at cleanup time so the unmount release can never fire a stale one, and
  // so the unmount effect itself keeps empty deps (it must run ONLY on unmount —
  // re-running it mid-drag would release the very reveal it exists to protect).
  const releaseRef = useRef(release);
  useEffect(() => {
    releaseRef.current = release;
  });

  const end = () => {
    detach.current?.();
    dragging.current = false;
    if (!raised.current) return;
    raised.current = false;
    releaseRef.current();
  };

  // ON UNMOUNT ONLY. Empty deps are load-bearing: a re-run mid-drag would
  // release the very reveal this exists to protect. `end` reads refs and
  // `releaseRef`, so the closure captured on mount stays correct forever.
  useEffect(() => () => end(), []);

  const raise = () => {
    if (!scope) return;
    raised.current = true;
    reveal(scope);
  };

  const beginDrag = () => {
    if (dragging.current) return; // one latch: no re-reveal, no second guard
    dragging.current = true;
    raise();
    // Closing on pointerup UNCONDITIONALLY is the point: a drag that ends where
    // it started emits no onCommit at all, and a cancelled one emits nothing
    // either. Both would otherwise leave the overlay drawn over the artwork.
    const onEnd = () => end();
    window.addEventListener("pointerup", onEnd, { once: true });
    window.addEventListener("pointercancel", onEnd, { once: true });
    detach.current = () => {
      // {once:true} already removed whichever one fired; removing it twice is a
      // no-op. Removing the OTHER one is what matters.
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      detach.current = null;
    };
  };

  return {
    /** Spread onto the row that owns this control. */
    pointerProps: {
      onPointerEnter: () => raise(),
      // DRAG START WINS. Mid-drag the cursor is expected to be somewhere else
      // entirely; the gesture, not the cursor, owns the reveal until it ends.
      onPointerLeave: () => {
        if (dragging.current) return;
        end();
      },
    },
    onChange: (v) => {
      beginDrag();
      handlers.onChange?.(v);
    },
    onCommit: (v) => {
      end();
      handlers.onCommit?.(v);
    },
  };
}
