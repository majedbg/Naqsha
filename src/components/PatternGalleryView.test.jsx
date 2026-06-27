// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PatternGalleryView, {
  dropIndexFromOver,
  insertionSideFor,
} from "./PatternGalleryView";
import SortablePatternCard from "./SortablePatternCard";

// ── Part-A drop-index mapping + insertion-line side (pure, slice 7) ──────────
// jsdom can't drive a real dnd-kit drag, so the drop-index math (the subtle
// Auto+filter correctness fix) and the insertion-line side are proven here as
// pure functions, mirroring the reducer-test strategy for MOVE.
describe("dropIndexFromOver (map drop through the FULL order via over.id)", () => {
  const FULL = ["h1", "h2", "h3", "t1", "t2", "c1"];

  it("indexes the over-target in the full manualOrder (filter-independent)", () => {
    // Auto+filter: visible set omits t1/t2, but the full order still resolves c1
    // to its real slot 5 — so a hidden card never loses its position.
    expect(dropIndexFromOver(FULL, FULL, "c1")).toBe(5);
    expect(dropIndexFromOver(FULL, FULL, "h1")).toBe(0);
    expect(dropIndexFromOver(FULL, FULL, "t1")).toBe(3);
  });

  it("prefers manualOrder; falls back to the full materialized order when absent", () => {
    // Partial persisted manualOrder (missing a newly-registered id) → fall back.
    const partial = ["h1", "h2"];
    const full = ["h1", "h2", "newAI"];
    expect(dropIndexFromOver(partial, full, "h2")).toBe(1); // from manualOrder
    expect(dropIndexFromOver(partial, full, "newAI")).toBe(2); // fallback
  });

  it("returns -1 when the id is in neither order", () => {
    expect(dropIndexFromOver(FULL, FULL, "nope")).toBe(-1);
  });
});

describe("insertionSideFor (which gap the line hugs)", () => {
  const IDS = ["a", "b", "c", "d"];
  it("right edge when dragging an earlier card past a later one", () => {
    expect(insertionSideFor(IDS, "a", "c")).toBe("right");
  });
  it("left edge when dragging a later card before an earlier one", () => {
    expect(insertionSideFor(IDS, "d", "b")).toBe("left");
  });
  it("null when hovering the dragged card itself or unknown ids", () => {
    expect(insertionSideFor(IDS, "b", "b")).toBeNull();
    expect(insertionSideFor(IDS, "a", "zzz")).toBeNull();
    expect(insertionSideFor(IDS, null, "b")).toBeNull();
  });
});

// Handcrafted patterns spanning two real families (H, T) + custom, in a
// deliberately INTERLEAVED input order so we can prove the grid clusters by
// family. familyKey mirrors meta.family (as getVisiblePatterns produces).
const mk = (id, family) => ({ id, familyKey: family, meta: { family, blurb: id } });
const PATTERNS = [
  mk("h1", "H"),
  mk("t1", "T"),
  mk("h2", "H"),
  mk("t2", "T"),
  mk("c1", "custom"),
  mk("h3", "H"),
];

// Fake renderCard: emits a marker div carrying the item id and family so tests
// can assert presence + DOM order without rendering the real PatternCard. It also
// captures the optional 2nd arg's `dimmed` flag so the Custom-mode dimming can be
// asserted without rendering the real PatternCard.
const fakeRenderCard = (item, opts) => (
  <div
    data-testid={`card-${item.id}`}
    data-family={item.familyKey}
    data-dimmed={opts?.dimmed ? "true" : "false"}
    key={item.id}
  />
);

function renderGallery(props = {}) {
  return render(
    <PatternGalleryView
      patterns={PATTERNS}
      isOn={() => true}
      onToggle={() => {}}
      onSelectAll={() => {}}
      onClearAll={() => {}}
      renderCard={fakeRenderCard}
      {...props}
    />
  );
}

describe("PatternGalleryView", () => {
  it("renders a FamilyFilterBar pill per present family with the STATIC count", () => {
    renderGallery();
    // H has 3, T has 2, custom has 1.
    expect(screen.getByTestId("family-pill-H")).toHaveTextContent("3");
    expect(screen.getByTestId("family-pill-T")).toHaveTextContent("2");
    expect(screen.getByTestId("family-pill-custom")).toHaveTextContent("1");
    // No pill for a family that isn't present.
    expect(screen.queryByTestId("family-pill-W")).toBeNull();
  });

  it("renders a card for every pattern whose family isOn; off-family cards absent", () => {
    renderGallery({ isOn: (key) => key !== "T" });
    // H + custom present.
    expect(screen.getByTestId("card-h1")).toBeInTheDocument();
    expect(screen.getByTestId("card-h2")).toBeInTheDocument();
    expect(screen.getByTestId("card-h3")).toBeInTheDocument();
    expect(screen.getByTestId("card-c1")).toBeInTheDocument();
    // T absent.
    expect(screen.queryByTestId("card-t1")).toBeNull();
    expect(screen.queryByTestId("card-t2")).toBeNull();
  });

  it("keeps pill counts STATIC regardless of isOn (count = full family size even when off)", () => {
    renderGallery({ isOn: (key) => key !== "T" });
    // T is OFF but its pill still shows its full size (2).
    expect(screen.getByTestId("family-pill-T")).toHaveTextContent("2");
    expect(screen.getByTestId("family-pill-H")).toHaveTextContent("3");
  });

  it("orders cards so same-family items are contiguous (H before T by family order)", () => {
    renderGallery();
    const cards = screen.getAllByTestId(/^card-/);
    const fams = cards.map((c) => c.getAttribute("data-family"));
    // Within the rendered order, all H must precede any T (family order H<T).
    const lastH = fams.lastIndexOf("H");
    const firstT = fams.indexOf("T");
    expect(lastH).toBeGreaterThanOrEqual(0);
    expect(firstT).toBeGreaterThanOrEqual(0);
    expect(lastH).toBeLessThan(firstT);
    // Each family is a contiguous run.
    const runs = fams.filter((f, i) => i === 0 || f !== fams[i - 1]);
    expect(new Set(runs).size).toBe(runs.length);
  });

  it("shows the empty state (no cards) when all families are off; Select-all button calls onSelectAll", () => {
    const onSelectAll = vi.fn();
    renderGallery({ isOn: () => false, onSelectAll });
    expect(screen.getByTestId("gallery-empty")).toBeInTheDocument();
    expect(screen.queryByTestId(/^card-/)).toBeNull();
    // The empty-state Select-all affordance.
    const btn = screen.getByTestId("gallery-empty-select-all");
    fireEvent.click(btn);
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  // ── Auto / Custom sort toggle (slice 5) ───────────────────────────────────

  // The clustered Auto order over the FULL set (H<T<custom): h1,h2,h3,t1,t2,c1.
  const AUTO_ORDER = ["h1", "h2", "h3", "t1", "t2", "c1"];

  it("renders an Auto/Custom segmented control; default Auto with aria-pressed reflecting sortMode", () => {
    renderGallery(); // default sortMode -> 'auto'
    const auto = screen.getByTestId("sort-mode-auto");
    const custom = screen.getByTestId("sort-mode-custom");
    expect(auto).toHaveAttribute("aria-pressed", "true");
    expect(custom).toHaveAttribute("aria-pressed", "false");
  });

  it("aria-pressed flips when sortMode='custom'", () => {
    renderGallery({ sortMode: "custom", manualOrder: AUTO_ORDER });
    expect(screen.getByTestId("sort-mode-auto")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("sort-mode-custom")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking Custom calls onEnterCustom with the FULL clustered auto-order ids", () => {
    const onEnterCustom = vi.fn();
    renderGallery({ onEnterCustom });
    fireEvent.click(screen.getByTestId("sort-mode-custom"));
    expect(onEnterCustom).toHaveBeenCalledTimes(1);
    expect(onEnterCustom).toHaveBeenCalledWith(AUTO_ORDER);
  });

  it("clicking Auto calls onSetAuto", () => {
    const onSetAuto = vi.fn();
    renderGallery({ sortMode: "custom", manualOrder: AUTO_ORDER, onSetAuto });
    fireEvent.click(screen.getByTestId("sort-mode-auto"));
    expect(onSetAuto).toHaveBeenCalledTimes(1);
  });

  it("Reset-order affordance shows ONLY in Custom mode and calls onResetManual with auto-order", () => {
    const onResetManual = vi.fn();
    // Auto mode: absent.
    const { rerender } = renderGallery();
    expect(screen.queryByTestId("sort-reset-order")).toBeNull();
    // Custom mode: present + wired.
    rerender(
      <PatternGalleryView
        patterns={PATTERNS}
        isOn={() => true}
        onToggle={() => {}}
        onSelectAll={() => {}}
        onClearAll={() => {}}
        renderCard={fakeRenderCard}
        sortMode="custom"
        manualOrder={AUTO_ORDER}
        onResetManual={onResetManual}
      />
    );
    const reset = screen.getByTestId("sort-reset-order");
    fireEvent.click(reset);
    expect(onResetManual).toHaveBeenCalledWith(AUTO_ORDER);
  });

  it("Custom mode renders ALL patterns in manualOrder; leftovers appended in auto-order", () => {
    // Reversed-ish order that OMITS c1, to prove (a) manualOrder drives order and
    // (b) the missing id (c1) appends at the end via the auto-order fallback.
    const manualOrder = ["t2", "t1", "h2", "h1", "h3"];
    renderGallery({ sortMode: "custom", manualOrder });
    const ids = screen.getAllByTestId(/^card-/).map((c) => c.getAttribute("data-testid"));
    expect(ids).toEqual([
      "card-t2",
      "card-t1",
      "card-h2",
      "card-h1",
      "card-h3",
      "card-c1", // omitted from manualOrder → appended last (custom is auto-last)
    ]);
  });

  it("Custom mode keeps off-family cards present but DIMMED; on-family normal", () => {
    renderGallery({
      sortMode: "custom",
      manualOrder: AUTO_ORDER,
      isOn: (key) => key !== "T", // T is filtered off
    });
    // T cards still present (slot preserved) but dimmed.
    expect(screen.getByTestId("card-t1")).toHaveAttribute("data-dimmed", "true");
    expect(screen.getByTestId("card-t2")).toHaveAttribute("data-dimmed", "true");
    // On-family cards normal.
    expect(screen.getByTestId("card-h1")).toHaveAttribute("data-dimmed", "false");
    expect(screen.getByTestId("card-c1")).toHaveAttribute("data-dimmed", "false");
  });

  it("Custom mode shows NO empty state even when ALL families are off (everything dimmed)", () => {
    renderGallery({
      sortMode: "custom",
      manualOrder: AUTO_ORDER,
      isOn: () => false,
    });
    expect(screen.queryByTestId("gallery-empty")).toBeNull();
    // Every card still rendered, all dimmed.
    const cards = screen.getAllByTestId(/^card-/);
    expect(cards).toHaveLength(PATTERNS.length);
    cards.forEach((c) => expect(c).toHaveAttribute("data-dimmed", "true"));
  });

  // ── dnd-kit wiring (slice 6) ──────────────────────────────────────────────
  //
  // Render-only: jsdom can't drive a real dnd-kit drag (0×0 rects), so MOVE
  // correctness lives in the slice-3 reducer tests + the slice-7 browser pass.
  // Here we assert the wiring that renders: cards mount as real sortables inside
  // the view's DndContext (no crash → context present in BOTH modes), and dimmed/
  // locked cards are flagged non-draggable.
  //
  // A real-ish renderer that builds SortablePatternCards (the production seam), so
  // useSortable actually runs against the DndContext PatternGalleryView provides.
  const sortableRenderCard = (item, opts) => (
    <SortablePatternCard
      key={item.id}
      id={item.id}
      meta={item.meta}
      symbol="x"
      label={item.id}
      ready
      onPick={() => {}}
      dimmed={!!opts?.dimmed}
    />
  );

  function renderSortable(props = {}) {
    return render(
      <PatternGalleryView
        patterns={PATTERNS}
        isOn={() => true}
        onToggle={() => {}}
        onSelectAll={() => {}}
        onClearAll={() => {}}
        renderCard={sortableRenderCard}
        {...props}
      />,
    );
  }

  it("Auto mode mounts every visible card as a sortable inside a DndContext", () => {
    renderSortable(); // auto
    const wraps = document.querySelectorAll("[data-sortable-id]");
    // All six patterns visible + sortable, none disabled (all on-family, ready).
    expect(wraps).toHaveLength(PATTERNS.length);
    wraps.forEach((w) => expect(w).toHaveAttribute("data-disabled", "false"));
  });

  it("Custom mode mounts all cards as sortables; off-family ones non-draggable (disabled)", () => {
    renderSortable({
      sortMode: "custom",
      manualOrder: AUTO_ORDER,
      isOn: (key) => key !== "T", // T filtered off → dimmed → disabled
    });
    const wraps = document.querySelectorAll("[data-sortable-id]");
    expect(wraps).toHaveLength(PATTERNS.length);
    const disabled = [...wraps].filter((w) => w.getAttribute("data-disabled") === "true");
    // The two T cards are dimmed → non-draggable.
    expect(disabled).toHaveLength(2);
    expect(document.querySelector('[data-sortable-id="t1"]')).toHaveAttribute("data-disabled", "true");
    expect(document.querySelector('[data-sortable-id="h1"]')).toHaveAttribute("data-disabled", "false");
  });
});
