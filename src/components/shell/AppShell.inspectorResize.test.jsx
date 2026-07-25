// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InspectorColumnRegion } from "./AppShell";
import { STORAGE_KEY } from "../../lib/hooks/useInspectorWidth";

// Inspector resize drag: the right-hand Inspector column is resizable and
// persisted, mirroring the left panel (WI-3) across the X axis. The handle
// straddles the column's LEFT edge (facing the canvas), so dragging LEFT widens
// the inspector. 288px — today's `w-72` rail — is both the DEFAULT and the
// MINIMUM: the panel only ever grows, and double-click returns to compact.

beforeEach(() => {
  localStorage.clear();
  // jsdom defaults to 1024px, where the hook's viewport guard caps the rail
  // below MAX. These assertions are about the column wiring, not the guard
  // (which has its own suite in useInspectorWidth.test), so mount on a monitor
  // wide enough that the guard never binds.
  window.innerWidth = 1600;
});

function getColumn() {
  return screen.getByTestId("inspector-panel");
}

describe("InspectorColumnRegion (resizable + persisted)", () => {
  it("renders a resize handle with the col-resize affordance", () => {
    render(<InspectorColumnRegion />);
    const handle = screen.getByTestId("inspector-panel-resize");
    expect(handle).toBeInTheDocument();
    expect(handle.className).toContain("cursor-col-resize");
  });

  it("puts the handle on the column's LEFT edge, not the right", () => {
    render(<InspectorColumnRegion />);
    const handle = screen.getByTestId("inspector-panel-resize");
    expect(handle.className).toContain("left-0");
    expect(handle.className).not.toContain("right-0");
  });

  it("exposes the handle as a vertical separator for a11y", () => {
    render(<InspectorColumnRegion />);
    const handle = screen.getByRole("separator", { name: "Resize inspector panel" });
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
  });

  it("contains the Inspector region", () => {
    render(<InspectorColumnRegion />);
    expect(getColumn()).toContainElement(
      screen.getByRole("region", { name: "Inspector" })
    );
  });

  it("is width-driven by inline style at the 288px default (no fixed w-72 class)", () => {
    render(<InspectorColumnRegion />);
    const column = getColumn();
    expect(column.className).not.toContain("w-72");
    expect(column.style.width).toBe("288px");
  });

  it("keeps shrink-0 so the flexible canvas can't eat the new width", () => {
    render(<InspectorColumnRegion />);
    expect(getColumn().className).toContain("shrink-0");
  });

  it("loads + clamps the persisted width on mount", () => {
    localStorage.setItem(STORAGE_KEY, "999");
    render(<InspectorColumnRegion />);
    expect(getColumn().style.width).toBe("560px");
  });

  it("dragging LEFT widens the panel and persists on mouseup only", () => {
    render(<InspectorColumnRegion />);
    const handle = screen.getByTestId("inspector-panel-resize");
    const column = getColumn();

    fireEvent.mouseDown(handle, { clientX: 900 });
    fireEvent.mouseMove(window, { clientX: 840 });

    // Mid-drag: width updated, nothing persisted.
    expect(column.style.width).toBe("348px"); // 288 + 60 leftward
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.mouseUp(window, { clientX: 840 });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("348");
  });

  it("clamps a drag to [288, 560] — never narrower than today's rail", () => {
    render(<InspectorColumnRegion />);
    const handle = screen.getByTestId("inspector-panel-resize");
    const column = getColumn();

    fireEvent.mouseDown(handle, { clientX: 900 });
    fireEvent.mouseMove(window, { clientX: -9999 });
    expect(column.style.width).toBe("560px");
    fireEvent.mouseMove(window, { clientX: 9999 });
    expect(column.style.width).toBe("288px");
    fireEvent.mouseUp(window, { clientX: 9999 });
  });

  it("double-clicking the handle resets the width to 288 and persists", () => {
    localStorage.setItem(STORAGE_KEY, "480");
    render(<InspectorColumnRegion />);
    const handle = screen.getByTestId("inspector-panel-resize");
    const column = getColumn();
    expect(column.style.width).toBe("480px");

    fireEvent.doubleClick(handle);
    expect(column.style.width).toBe("288px");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("288");
  });

  it("adds select-none to <body> during drag and removes it after", () => {
    render(<InspectorColumnRegion />);
    const handle = screen.getByTestId("inspector-panel-resize");

    expect(document.body.classList.contains("select-none")).toBe(false);
    fireEvent.mouseDown(handle, { clientX: 900 });
    expect(document.body.classList.contains("select-none")).toBe(true);
    fireEvent.mouseUp(window, { clientX: 900 });
    expect(document.body.classList.contains("select-none")).toBe(false);
  });
});
