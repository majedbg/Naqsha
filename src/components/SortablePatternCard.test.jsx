// @vitest-environment jsdom
//
// Slice 6 — SortablePatternCard render-only tests. dnd-kit drags can't be driven
// in jsdom (0×0 getBoundingClientRect), so these assert only what RENDERS:
// the wrapper mounts inside a DndContext/SortableContext, the inner card shows,
// disabled (dimmed/locked/not-ready) cases don't crash and are flagged
// non-draggable, and onPick still forwards when enabled. Real drag behavior is
// browser-verified in slice 7.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import SortablePatternCard from "./SortablePatternCard";

// Minimal harness: a SortableContext over the given ids inside a DndContext, so
// useSortable has the context it needs (matches the slice-1 smoke harness).
function harness(ids, children) {
  return render(
    <DndContext>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>,
  );
}

const META = { family: "H", blurb: "harmonic", det: "deterministic", mark: "line" };

describe("SortablePatternCard", () => {
  it("renders the inner PatternCard and exposes a sortable wrapper", () => {
    harness(
      ["a"],
      <SortablePatternCard
        id="a"
        meta={META}
        symbol="Hx"
        label="Harmonic"
        ready
        onPick={() => {}}
      />,
    );
    // Inner card present (PatternCard renders a button titled "<label> — <blurb>").
    expect(screen.getByTitle(/^Harmonic —/)).toBeInTheDocument();
    // Sortable wrapper present + enabled.
    const wrap = document.querySelector('[data-sortable-id="a"]');
    expect(wrap).not.toBeNull();
    expect(wrap).toHaveAttribute("data-disabled", "false");
  });

  it("forwards onPick(id) when enabled (click reaches the inner button)", () => {
    const onPick = vi.fn();
    harness(
      ["a"],
      <SortablePatternCard
        id="a"
        meta={META}
        symbol="Hx"
        label="Harmonic"
        ready
        onPick={onPick}
      />,
    );
    fireEvent.click(screen.getByTitle(/^Harmonic —/));
    expect(onPick).toHaveBeenCalledWith("a");
  });

  it("dimmed card is non-draggable (data-disabled) and not pickable", () => {
    const onPick = vi.fn();
    harness(
      ["a"],
      <SortablePatternCard
        id="a"
        meta={META}
        symbol="Hx"
        label="Harmonic"
        ready
        dimmed
        onPick={onPick}
      />,
    );
    expect(document.querySelector('[data-sortable-id="a"]')).toHaveAttribute(
      "data-disabled",
      "true",
    );
    // dimmed PatternCard guards its onClick.
    fireEvent.click(screen.getByTitle(/^Harmonic —/));
    expect(onPick).not.toHaveBeenCalled();
  });

  it("locked and not-ready cards render without crashing and are non-draggable", () => {
    // locked
    const { unmount } = harness(
      ["a"],
      <SortablePatternCard id="a" meta={META} symbol="Hx" label="Locked" ready locked onPick={() => {}} />,
    );
    expect(document.querySelector('[data-sortable-id="a"]')).toHaveAttribute("data-disabled", "true");
    unmount();
    // not ready
    harness(
      ["b"],
      <SortablePatternCard id="b" meta={META} symbol="Hx" label="Soon" ready={false} onPick={() => {}} />,
    );
    expect(document.querySelector('[data-sortable-id="b"]')).toHaveAttribute("data-disabled", "true");
  });
});
