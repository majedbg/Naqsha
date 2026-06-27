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
export default function SortablePatternCard({
  id,
  dimmed = false,
  locked = false,
  ready = true,
  ...cardProps
}) {
  const disabled = dimmed || locked || !ready;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
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
      <PatternCard id={id} dimmed={dimmed} locked={locked} ready={ready} {...cardProps} />
    </div>
  );
}
