// @vitest-environment jsdom
//
// Slice 7 — tabbed PatternPickerModal (Map taxonomy + Grid gallery). Covers the
// tablist/tab a11y, the Grid-by-default behavior, tab switching, and that the
// existing ESC-to-close and onPick-closes contracts survive the refactor.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PatternPickerModal from "./PatternPickerModal";

// Mirror the characterization test: studio tier unlocks every pattern so cards
// render enabled and are pickable from the grid.
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

describe("PatternPickerModal — tabs (slice 7)", () => {
  const noop = () => {};

  // localStorage persists the view across it() blocks within a file; clear so the
  // default ('grid') is deterministic for every test.
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <PatternPickerModal open={false} onClose={noop} onPick={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("opens on the GRID view by default (filter bar present, Map-only rows absent)", () => {
    render(<PatternPickerModal open onClose={noop} onPick={noop} />);
    // Grid view shows the family-filter pill bar...
    expect(
      screen.getByRole("group", { name: "Filter by family" })
    ).toBeInTheDocument();
    // ...and the Map-only taxonomy row label is NOT present.
    expect(screen.queryByText("Radial / Spiral")).not.toBeInTheDocument();
  });

  it("exposes a tablist with two tabs whose aria-selected tracks the view", () => {
    render(<PatternPickerModal open onClose={noop} onPick={noop} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const mapTab = screen.getByRole("tab", { name: "Map" });
    const gridTab = screen.getByRole("tab", { name: "Grid" });
    // Default Grid: grid selected, map not.
    expect(gridTab).toHaveAttribute("aria-selected", "true");
    expect(mapTab).toHaveAttribute("aria-selected", "false");
  });

  it("switches to the Map table on Map tab, and back to the grid on Grid tab", () => {
    render(<PatternPickerModal open onClose={noop} onPick={noop} />);
    // → Map: a taxonomy row label appears, filter bar gone.
    fireEvent.click(screen.getByRole("tab", { name: "Map" }));
    expect(screen.getByText("Radial / Spiral")).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Filter by family" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Map" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    // → Grid: filter bar returns, row label gone.
    fireEvent.click(screen.getByRole("tab", { name: "Grid" }));
    expect(
      screen.getByRole("group", { name: "Filter by family" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Radial / Spiral")).not.toBeInTheDocument();
  });

  it("still closes on Escape (onClose called)", () => {
    const onClose = vi.fn();
    render(<PatternPickerModal open onClose={onClose} onPick={noop} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still closes on backdrop click (onClose called)", () => {
    const onClose = vi.fn();
    const { container } = render(
      <PatternPickerModal open onClose={onClose} onPick={noop} />
    );
    // The outermost backdrop has the onClick={onClose}.
    fireEvent.click(container.firstChild);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onPick with a pattern id when a grid card is picked", () => {
    const onPick = vi.fn();
    render(<PatternPickerModal open onClose={noop} onPick={onPick} />);
    // Grid is the default view; spiral is a ready static built-in card.
    fireEvent.click(screen.getByTitle(/^Spiral —/));
    expect(onPick).toHaveBeenCalledWith("spiral");
  });
});
