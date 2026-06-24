// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InspectorShelf, { MIN_COLUMN, columnCount } from "./InspectorShelf";

// WI-3: InspectorShelf is PURE LAYOUT — it columnizes its direct children into a
// responsive grid. The column count is computed in JS from an explicit `width`
// (the deterministic testing seam) because jsdom does no CSS layout and cannot
// resolve `auto-fill` minmax tracks. These tests pass `width` directly so the
// gate is a real, deterministic jsdom assertion rather than a CSS-string check.

describe("InspectorShelf — columnCount (pure)", () => {
  it("MIN_COLUMN is the 256px floor", () => {
    expect(MIN_COLUMN).toBe(256);
  });

  it("narrow widths floor to 1 column (300px → 1)", () => {
    expect(columnCount(300)).toBe(1);
  });

  it("never returns 0 or crashes on 0 / NaN / negative", () => {
    expect(columnCount(0)).toBe(1);
    expect(columnCount(NaN)).toBe(1);
    expect(columnCount(-500)).toBe(1);
    expect(columnCount(undefined)).toBe(1);
  });
});

describe("InspectorShelf — 768px gate (load-bearing)", () => {
  it("columnCount(768) is between 2 and 3 inclusive", () => {
    expect(columnCount(768)).toBeGreaterThanOrEqual(2);
    expect(columnCount(768)).toBeLessThanOrEqual(3);
  });

  it("renders a grid with N === columnCount(768) tracks and no column narrower than 240px", () => {
    const n = columnCount(768);
    render(
      <InspectorShelf width={768}>
        <div data-testid="grp-structure">structure</div>
        <div data-testid="grp-motion">motion</div>
        <div data-testid="grp-color">color</div>
        <div data-testid="grp-grain">grain</div>
      </InspectorShelf>
    );
    const grid = screen.getByTestId("inspector-shelf-grid");
    expect(grid.style.display).toBe("grid");
    expect(grid.style.gridTemplateColumns).toBe(`repeat(${n}, minmax(0, 1fr))`);
    // No column drops below 240px at the gate width.
    expect(768 / n).toBeGreaterThanOrEqual(240);
  });
});

describe("InspectorShelf — fit-to-width", () => {
  it("columnCount(1400) is at least 4", () => {
    expect(columnCount(1400)).toBeGreaterThanOrEqual(4);
  });

  it("resolves to strictly more columns at 1400 than at 768", () => {
    function tracks(width) {
      const { unmount } = render(
        <InspectorShelf width={width}>
          <div>a</div>
          <div>b</div>
          <div>c</div>
          <div>d</div>
          <div>e</div>
        </InspectorShelf>
      );
      const grid = screen.getByTestId("inspector-shelf-grid");
      const n = Number(grid.style.gridTemplateColumns.match(/repeat\((\d+),/)[1]);
      unmount();
      return n;
    }
    expect(tracks(1400)).toBeGreaterThan(tracks(768));
  });
});

describe("InspectorShelf — composite does not overflow its column", () => {
  it("wraps each child in a min-w-0 grid item and the 104px composite still renders", () => {
    render(
      <InspectorShelf width={768}>
        <div data-testid="grp-with-composite">
          <div style={{ width: 104 }} data-testid="composite" />
        </div>
      </InspectorShelf>
    );
    const composite = screen.getByTestId("composite");
    expect(composite).toBeInTheDocument();
    // The grid-item wrapper is the parent of the mock group; it carries min-w-0
    // so a fixed-width child cannot blow out the column.
    const wrapper = composite.parentElement.parentElement;
    expect(wrapper.className).toContain("min-w-0");
  });
});

describe("InspectorShelf — source order", () => {
  it("renders grid items in DOM order A, B, C", () => {
    render(
      <InspectorShelf width={768}>
        <div data-testid="grp-A">A</div>
        <div data-testid="grp-B">B</div>
        <div data-testid="grp-C">C</div>
      </InspectorShelf>
    );
    const grid = screen.getByTestId("inspector-shelf-grid");
    const order = Array.from(grid.querySelectorAll("[data-testid^='grp-']")).map(
      (el) => el.getAttribute("data-testid")
    );
    expect(order).toEqual(["grp-A", "grp-B", "grp-C"]);
  });
});

describe("InspectorShelf — empty / skipped children", () => {
  it("renders the grid container with zero grid items when there are no children", () => {
    render(<InspectorShelf width={768} />);
    const grid = screen.getByTestId("inspector-shelf-grid");
    expect(grid.children.length).toBe(0);
  });

  it("skips null / false children (no empty grid items)", () => {
    render(
      <InspectorShelf width={768}>
        {null}
        {false}
        <div data-testid="grp-real">real</div>
        {null}
      </InspectorShelf>
    );
    const grid = screen.getByTestId("inspector-shelf-grid");
    expect(grid.children.length).toBe(1);
    expect(screen.getByTestId("grp-real")).toBeInTheDocument();
  });
});
