// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PatternGalleryView from "./PatternGalleryView";

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
// can assert presence + DOM order without rendering the real PatternCard.
const fakeRenderCard = (item) => (
  <div data-testid={`card-${item.id}`} data-family={item.familyKey} key={item.id} />
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
});
