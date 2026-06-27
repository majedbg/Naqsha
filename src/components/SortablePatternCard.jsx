import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import PatternCard from "./PatternCard";

// SortablePatternCard — a thin sortable wrapper around <PatternCard/>.
//
// WHY a wrapper (not useSortable inside PatternCard): PatternCard is ALSO used by
// the Map view (PatternTableView) which renders with NO DndContext. Calling
// useSortable there would crash. Isolating useSortable to this Grid-only wrapper
// keeps PatternCard context-free and shared.
//
// SEAM (slice 6): the modal's `cardFor(..., sortable=true)` builds this instead of
// a bare PatternCard for the Grid, because the `disabled` math needs `locked` /
// `ready`, which only exist in the modal (getPatternClass / gate.check) — not in
// PatternGalleryView. PatternGalleryView supplies the DndContext + SortableContext
// this card mounts inside; here we just make each card draggable.
//
// disabled = dimmed || locked || !ready — dimmed (off-family in Custom), locked
// (gated/SOON) and not-ready cards stay in-slot (so index math is real) but are
// NOT draggable. The whole card is the drag handle (attributes + listeners spread
// on the wrapper); a plain click still reaches the inner button → onPick, because
// the PointerSensor activation distance distinguishes a click from a drag.
// Honor prefers-reduced-motion: under `reduce` we drop dnd-kit's gap-shift
// transition so neighbor cards reposition instantly (no animated slide). The
// transform itself stays (it's the layout, not decorative motion). matchMedia is
// stubbed in jsdom (matches:false) so this is test-safe.
function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SortablePatternCard({
  id,
  dimmed = false,
  locked = false,
  ready = true,
  // 'left' | 'right' | null — render a violet insertion line on this card's edge
  // when it is the current drop target (left = insert before, right = after).
  insertionSide = null,
  ...cardProps
}) {
  const disabled = dimmed || locked || !ready;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const reduced = prefersReducedMotion();
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: reduced ? undefined : transition,
    // Positioning context for the absolutely-placed insertion line.
    position: "relative",
    // Lift the card being dragged above its neighbors; visuals are otherwise
    // identical to a plain card at rest.
    ...(isDragging ? { zIndex: 10, opacity: 0.85 } : null),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-sortable-id={id}
      data-disabled={disabled ? "true" : "false"}
      {...attributes}
      {...listeners}
    >
      {/* Insertion line — a thin violet vertical bar sitting in the gap between
          cards. Sits on the over-target's left/right edge; instantaneous (no
          movement animation), so reduced-motion is honored by construction. */}
      {insertionSide && (
        <div
          aria-hidden="true"
          data-insertion-line={insertionSide}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            [insertionSide === "left" ? "left" : "right"]: -5,
            width: 3,
            borderRadius: 2,
            background: "var(--violet)",
            boxShadow: "0 0 6px var(--violet)",
            zIndex: 20,
            pointerEvents: "none",
          }}
        />
      )}
      <PatternCard id={id} dimmed={dimmed} locked={locked} ready={ready} {...cardProps} />
    </div>
  );
}
