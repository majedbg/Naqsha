// PatternGalleryView — the "Grid" gallery: a top family-filter pill bar over a
// dense, family-clustered grid of ~140px cards, with a gentle empty state.
//
// It owns NO pattern state and does NOT know how a card is rendered: the caller
// passes the FULL unfiltered `patterns` (typically getVisiblePatterns(...)), the
// selection state + callbacks from usePatternPicker, and a `renderCard(item)`
// render-prop. Keeping card rendering external means this view needs no useGate /
// thumbnail mocking to test — the caller wraps PatternCard (size=140) with the
// gate/ready/onPick wiring.
//
// Derivations (families list, filtered+clustered grid) are memoized.

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { PATTERN_FAMILIES } from "../constants";
import { familyMetaFor } from "../lib/patternCatalog";
import FamilyFilterBar from "./FamilyFilterBar";

// Canonical family order: PATTERN_FAMILIES key order, with synthetic 'custom'
// always last. Lower rank sorts first.
const FAMILY_RANK = (() => {
  const rank = {};
  Object.keys(PATTERN_FAMILIES).forEach((k, i) => {
    rank[k] = i;
  });
  rank.custom = Object.keys(PATTERN_FAMILIES).length; // custom last
  return rank;
})();

const rankOf = (key) => (key in FAMILY_RANK ? FAMILY_RANK[key] : Number.MAX_SAFE_INTEGER);

// ── pure drag-geometry helpers (unit-tested; jsdom can't drive real drags) ────
//
// Map the drop target through the FULL order (the array the reducer mutates), NOT
// the visible/filtered subset. Prefer `manualOrder` (what MOVE splices) and fall
// back to the full materialized order for the rare partial-persist case where the
// over-target is an id appended beyond a saved manualOrder.
export function dropIndexFromOver(manualOrder, fullOrderIds, overId) {
  const i = manualOrder.indexOf(overId);
  if (i !== -1) return i;
  return fullOrderIds.indexOf(overId);
}

// Which gap the insertion line sits in, relative to the over-target card.
// Dragging an earlier card past a later one → line on the over card's RIGHT edge
// (insert after); dragging a later card before an earlier one → LEFT edge. null
// when hovering the dragged card itself or when either id is unknown.
export function insertionSideFor(orderedIds, activeId, overId) {
  if (!activeId || !overId || activeId === overId) return null;
  const a = orderedIds.indexOf(activeId);
  const o = orderedIds.indexOf(overId);
  if (a === -1 || o === -1) return null;
  return a < o ? "right" : "left";
}

export default function PatternGalleryView({
  patterns = [],
  isOn,
  onToggle,
  onSelectAll,
  onClearAll,
  renderCard,
  // Slice 5 — Auto/Custom sort. Presentational: the hook drives these.
  sortMode = "auto",
  manualOrder = [],
  onSetAuto,
  onEnterCustom,
  onResetManual,
  // Slice 6 — dnd-kit drag lifecycle (injected by the modal from the hook).
  onDragStart, // (fullOrderIds) => startDrag(sortMode, fullOrderIds): auto-switch + seed FULL order
  onDragCancel, // () => cancelDrag(): Escape mid-drag reverts to prior mode
  onReorder, // (activeId, toIndex) => commitDrag: MOVE on drop
  onDraggingChange, // (bool) => modal guards its Escape handler while dragging
}) {
  const isCustom = sortMode === "custom";
  // 1. Families for the pill bar — grouped over the FULL set, counts STATIC.
  //    Ordered by family rank (custom last). Counts never shrink on toggle.
  const families = useMemo(() => {
    const counts = new Map();
    for (const p of patterns) {
      counts.set(p.familyKey, (counts.get(p.familyKey) || 0) + 1);
    }
    return [...counts.keys()]
      .sort((a, b) => rankOf(a) - rankOf(b))
      .map((key) => {
        const meta = familyMetaFor(key) || { label: key, color: "#888" };
        return { key, label: meta.label, color: meta.color, count: counts.get(key) };
      });
  }, [patterns]);

  // 2. Grid items — keep only on-families, then sort by family rank so same-
  //    family colors cluster into contiguous runs (stable within a family).
  const gridItems = useMemo(() => {
    const on = patterns.filter((p) => (isOn ? isOn(p.familyKey) : true));
    return on
      .map((p, i) => ({ p, i }))
      .sort((a, b) => rankOf(a.p.familyKey) - rankOf(b.p.familyKey) || a.i - b.i)
      .map(({ p }) => p);
  }, [patterns, isOn]);

  // 3. autoOrderIds — the SAME family-clustered order as the grid, but over the
  //    FULL (unfiltered) set. This seeds Custom mode (onEnterCustom) and the
  //    "Reset order" affordance, and is the fallback order for any id missing
  //    from manualOrder.
  const autoOrderIds = useMemo(
    () =>
      patterns
        .map((p, i) => ({ p, i }))
        .sort((a, b) => rankOf(a.p.familyKey) - rankOf(b.p.familyKey) || a.i - b.i)
        .map(({ p }) => p.id),
    [patterns],
  );

  // 4. Custom grid items — ALL patterns ordered by manualOrder; any id missing
  //    from manualOrder (new/AI patterns) appended in auto/family order. Nothing
  //    is filtered out here — off-family cards are rendered DIMMED + inert.
  const customItems = useMemo(() => {
    const byId = new Map(patterns.map((p) => [p.id, p]));
    const seen = new Set();
    const ordered = [];
    for (const id of manualOrder) {
      const p = byId.get(id);
      if (p && !seen.has(id)) {
        ordered.push(p);
        seen.add(id);
      }
    }
    for (const id of autoOrderIds) {
      if (!seen.has(id)) {
        ordered.push(byId.get(id));
        seen.add(id);
      }
    }
    return ordered;
  }, [patterns, manualOrder, autoOrderIds]);

  const items = isCustom ? customItems : gridItems;

  // ── dnd-kit drag wiring ───────────────────────────────────────────────────
  // The SortableContext item set must be STABLE for the duration of a drag (no
  // layout shift under the pointer). Starting a drag in Auto promotes the session
  // to Custom, which would otherwise materialize the (previously-hidden) dimmed
  // cards mid-gesture and change the item set. So we FREEZE the visible items in a
  // ref at drag-start and render that frozen set until the drag ends; the dimmed
  // cards materialize naturally on the post-drop re-render (isDragging back to
  // false → items = customItems).
  const [isDragging, setIsDragging] = useState(false);
  const frozenItemsRef = useRef(null);
  const displayItems = isDragging && frozenItemsRef.current ? frozenItemsRef.current : items;
  const orderedIds = useMemo(() => displayItems.map((p) => p.id), [displayItems]);

  // The FULL domain order (all patterns, manualOrder + appended) — used to map a
  // drop target through the complete order, not the visible/filtered subset.
  const fullOrderIds = useMemo(() => customItems.map((p) => p.id), [customItems]);

  // Insertion-line state: which over-target card the line hugs, and on which edge
  // ('left' = insert before / 'right' = insert after). Only set during a drag
  // (onDragOver); cleared on start/end/cancel. Drives the violet vertical bar.
  const [overInfo, setOverInfo] = useState(null);

  // Split mouse/touch sensors (slice 7 decision) instead of a single PointerSensor:
  //   • Mouse — 5px activation distance so a click-to-pick (onPick) is NOT a drag.
  //   • Touch — a 200ms press DELAY (tolerance 5px) so a quick finger swipe scrolls
  //     the grid (overflow-y-auto, an iPad target) and a press-and-hold starts the
  //     drag; a bare PointerSensor with only a distance constraint can't tell a
  //     scroll-swipe from a drag and hijacks vertical scroll on touch.
  //   • Keyboard — a11y (space to lift, arrows to move, space to drop).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = () => {
    // Freeze the CURRENT visible set BEFORE the mode flips, then mark dragging so
    // the next render keeps rendering the frozen set. Order matters: setIsDragging
    // must precede onDragStart (which flips sortMode → custom).
    frozenItemsRef.current = displayItems;
    setIsDragging(true);
    setOverInfo(null);
    onDraggingChange && onDraggingChange(true);
    // Seed the domain model from the FULL family-clustered order (not the visible
    // subset): a filtered Auto-origin drag must keep filtered-off cards in their
    // original slots. The SortableContext item set stays the frozen visible set —
    // that's purely the drag UI and is separate from seeding manualOrder.
    onDragStart && onDragStart(fullOrderIds);
  };

  const endDrag = () => {
    setIsDragging(false);
    frozenItemsRef.current = null;
    setOverInfo(null);
    onDraggingChange && onDraggingChange(false);
  };

  // Track the current drop gap so the insertion line can render between cards.
  const handleDragOver = (event) => {
    const { active, over } = event;
    const side = over && active ? insertionSideFor(orderedIds, active.id, over.id) : null;
    const next = side ? { id: over.id, side } : null;
    setOverInfo((prev) => {
      if (!prev && !next) return prev;
      if (prev && next && prev.id === next.id && prev.side === next.side) return prev;
      return next;
    });
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active && active.id !== over.id) {
      // Map the drop target through the FULL order (the array MOVE mutates), via
      // over.id — correct regardless of any active family filter. Both ids are
      // real/visible ids; indexOf into the full order is well-defined.
      const toIndex = dropIndexFromOver(manualOrder, fullOrderIds, over.id);
      if (toIndex !== -1) onReorder && onReorder(active.id, toIndex);
    }
    endDrag();
  };

  const handleDragCancel = () => {
    onDragCancel && onDragCancel(); // Escape revert to prior mode
    endDrag();
  };

  // Empty state is AUTO-only — Custom never blanks (dimming covers all-off).
  const showEmpty = !isCustom && gridItems.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Auto / Custom segmented control */}
        <div
          role="group"
          aria-label="Sort order"
          className="flex items-center gap-1"
        >
          <button
            type="button"
            data-testid="sort-mode-auto"
            aria-pressed={!isCustom}
            onClick={() => onSetAuto && onSetAuto()}
            className={`rounded-xs border px-2.5 py-1 text-[11px] font-medium transition-colors duration-fast ease-out-quart ${
              !isCustom
                ? "border-violet text-violet bg-violet/10"
                : "border-hairline text-ink-soft hover:text-ink hover:border-ink-soft"
            }`}
          >
            Auto
          </button>
          <button
            type="button"
            data-testid="sort-mode-custom"
            aria-pressed={isCustom}
            onClick={() => onEnterCustom && onEnterCustom(autoOrderIds)}
            className={`rounded-xs border px-2.5 py-1 text-[11px] font-medium transition-colors duration-fast ease-out-quart ${
              isCustom
                ? "border-violet text-violet bg-violet/10"
                : "border-hairline text-ink-soft hover:text-ink hover:border-ink-soft"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Reset order — Custom only. */}
        {isCustom && (
          <button
            type="button"
            data-testid="sort-reset-order"
            onClick={() => onResetManual && onResetManual(autoOrderIds)}
            className="rounded-xs border border-hairline px-2 py-1 text-[11px] text-ink-soft transition-[color,border-color,transform] duration-fast ease-out-quart hover:border-violet hover:text-violet motion-safe:active:scale-[0.95]"
          >
            Reset order
          </button>
        )}
      </div>

      <FamilyFilterBar
        families={families}
        isOn={isOn}
        onToggle={onToggle}
        onSelectAll={onSelectAll}
        onClearAll={onClearAll}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showEmpty ? (
          <div
            data-testid="gallery-empty"
            className="anim-fade flex h-full flex-col items-center justify-center gap-3 py-12 text-center"
          >
            <p className="text-[13px] text-ink-soft">No families selected.</p>
            <button
              type="button"
              data-testid="gallery-empty-select-all"
              onClick={() => onSelectAll && onSelectAll()}
              className="rounded-xs border border-hairline px-3 py-1.5 text-[12px] text-ink-soft transition-[color,border-color,transform] duration-fast ease-out-quart hover:border-violet hover:text-violet motion-safe:active:scale-[0.97]"
            >
              Select all
            </button>
          </div>
        ) : (
          // DndContext + SortableContext wrap the grid in BOTH modes: a drag can
          // only start on an element that is already a sortable, so the auto-switch
          // (drag while in Auto → Custom) needs every card sortable even in Auto.
          // "Auto vs Custom" is purely the display ORDER + whether a drag promoted
          // the session. The modal's renderCard builds SortablePatternCards.
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(140px, 140px))",
                  justifyContent: "start",
                }}
              >
                {/* renderCard contract: `renderCard(item, { dimmed, insertionSide })`.
                    Custom mode marks off-family cards dimmed; both modes forward the
                    insertion-line side for the current over-target. We render
                    `displayItems` (frozen during a drag) so the SortableContext item
                    set stays stable mid-gesture. */}
                {displayItems.map((item) => {
                  const insertionSide =
                    overInfo && overInfo.id === item.id ? overInfo.side : null;
                  return isCustom
                    ? renderCard(item, {
                        dimmed: isOn ? !isOn(item.familyKey) : false,
                        insertionSide,
                      })
                    : renderCard(item, { insertionSide });
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
