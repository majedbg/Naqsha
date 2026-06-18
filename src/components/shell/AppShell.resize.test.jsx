// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObjectTreeRegion } from "./AppShell";
import { STORAGE_KEY } from "../../lib/hooks/usePanelWidth";

// WI-3 (object-tree panel): the Object tree region is resizable and persisted.
// Width is state-driven (no fixed `w-56`), a resize handle straddles the right
// edge, a drag updates+clamps the width and persists on drag-END only, and a
// double-click resets to 280.

beforeEach(() => {
  localStorage.clear();
});

function getSection() {
  return screen.getByRole("region", { name: "Object tree" });
}

describe("ObjectTreeRegion (WI-3 — resizable + persisted)", () => {
  it("renders a resize handle with the col-resize affordance", () => {
    render(<ObjectTreeRegion />);
    const handle = screen.getByTestId("object-tree-resize");
    expect(handle).toBeInTheDocument();
    expect(handle.className).toContain("cursor-col-resize");
  });

  it("is width-driven by inline style at the 280px default (no w-56 class)", () => {
    render(<ObjectTreeRegion />);
    const section = getSection();
    expect(section.className).not.toContain("w-56");
    expect(section.style.width).toBe("280px");
  });

  it("loads + clamps the persisted width on mount", () => {
    localStorage.setItem(STORAGE_KEY, "999");
    render(<ObjectTreeRegion />);
    expect(getSection().style.width).toBe("480px");
  });

  it("a drag updates the rendered width and persists on mouseup only", () => {
    render(<ObjectTreeRegion />);
    const handle = screen.getByTestId("object-tree-resize");
    const section = getSection();

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 160 });

    // Mid-drag: width updated, nothing persisted.
    expect(section.style.width).toBe("340px"); // 280 + 60
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.mouseUp(window, { clientX: 160 });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("340");
  });

  it("clamps a drag to [200, 480]", () => {
    render(<ObjectTreeRegion />);
    const handle = screen.getByTestId("object-tree-resize");
    const section = getSection();

    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 9999 });
    expect(section.style.width).toBe("480px");
    fireEvent.mouseMove(window, { clientX: -9999 });
    expect(section.style.width).toBe("200px");
    fireEvent.mouseUp(window, { clientX: -9999 });
  });

  it("double-clicking the handle resets the width to 280 and persists", () => {
    localStorage.setItem(STORAGE_KEY, "420");
    render(<ObjectTreeRegion />);
    const handle = screen.getByTestId("object-tree-resize");
    const section = getSection();
    expect(section.style.width).toBe("420px");

    fireEvent.doubleClick(handle);
    expect(section.style.width).toBe("280px");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("280");
  });

  it("adds select-none to <body> during drag and removes it after", () => {
    render(<ObjectTreeRegion />);
    const handle = screen.getByTestId("object-tree-resize");

    expect(document.body.classList.contains("select-none")).toBe(false);
    fireEvent.mouseDown(handle, { clientX: 100 });
    expect(document.body.classList.contains("select-none")).toBe(true);
    fireEvent.mouseUp(window, { clientX: 100 });
    expect(document.body.classList.contains("select-none")).toBe(false);
  });
});
