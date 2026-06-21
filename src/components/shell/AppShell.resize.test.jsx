// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeftColumnRegion } from "./AppShell";
import { STORAGE_KEY } from "../../lib/hooks/usePanelWidth";

// WI-3 (left panel): the whole left column (layer tree + operations) is resizable
// and persisted as ONE unit. Width is state-driven (no fixed class) and applied
// to the column wrapper; a resize handle straddles the column's right edge (the
// rightmost edge of the entire panel); a drag updates+clamps the width and
// persists on drag-END only; a double-click resets to 280.

beforeEach(() => {
  localStorage.clear();
});

function getColumn() {
  return screen.getByTestId("left-panel");
}

describe("LeftColumnRegion (WI-3 — resizable + persisted)", () => {
  it("renders a resize handle with the col-resize affordance", () => {
    render(<LeftColumnRegion />);
    const handle = screen.getByTestId("left-panel-resize");
    expect(handle).toBeInTheDocument();
    expect(handle.className).toContain("cursor-col-resize");
  });

  it("contains both the object tree and operations regions in one column", () => {
    render(<LeftColumnRegion />);
    const column = getColumn();
    expect(column).toContainElement(
      screen.getByRole("region", { name: "Object tree" })
    );
    expect(column).toContainElement(
      screen.getByRole("region", { name: "Operations panel" })
    );
  });

  it("is width-driven by inline style at the 280px default (no fixed width class)", () => {
    render(<LeftColumnRegion />);
    const column = getColumn();
    expect(column.className).not.toContain("w-56");
    expect(column.style.width).toBe("280px");
  });

  it("loads + clamps the persisted width on mount", () => {
    localStorage.setItem(STORAGE_KEY, "999");
    render(<LeftColumnRegion />);
    expect(getColumn().style.width).toBe("480px");
  });

  it("a drag updates the rendered width and persists on mouseup only", () => {
    render(<LeftColumnRegion />);
    const handle = screen.getByTestId("left-panel-resize");
    const column = getColumn();

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 160 });

    // Mid-drag: width updated, nothing persisted.
    expect(column.style.width).toBe("340px"); // 280 + 60
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.mouseUp(window, { clientX: 160 });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("340");
  });

  it("clamps a drag to [200, 480]", () => {
    render(<LeftColumnRegion />);
    const handle = screen.getByTestId("left-panel-resize");
    const column = getColumn();

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 9999 });
    expect(column.style.width).toBe("480px");
    fireEvent.mouseMove(window, { clientX: -9999 });
    expect(column.style.width).toBe("200px");
    fireEvent.mouseUp(window, { clientX: -9999 });
  });

  it("double-clicking the handle resets the width to 280 and persists", () => {
    localStorage.setItem(STORAGE_KEY, "420");
    render(<LeftColumnRegion />);
    const handle = screen.getByTestId("left-panel-resize");
    const column = getColumn();
    expect(column.style.width).toBe("420px");

    fireEvent.doubleClick(handle);
    expect(column.style.width).toBe("280px");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("280");
  });

  it("adds select-none to <body> during drag and removes it after", () => {
    render(<LeftColumnRegion />);
    const handle = screen.getByTestId("left-panel-resize");

    expect(document.body.classList.contains("select-none")).toBe(false);
    fireEvent.mouseDown(handle, { clientX: 100 });
    expect(document.body.classList.contains("select-none")).toBe(true);
    fireEvent.mouseUp(window, { clientX: 100 });
    expect(document.body.classList.contains("select-none")).toBe(false);
  });
});
