// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AppShell from "./AppShell";
import { useInspectorDockContext } from "./inspectorDockContext";
import { POSITION_KEY, COLLAPSED_KEY } from "../../lib/hooks/useInspectorDock";

// WI-4 (inspector-dock): AppShell restructures its body row based on the dock
// position. 'right' (default) keeps today's layout byte-for-byte (the w-72 right
// column hosting the Inspector); 'bottom' drops the right column and renders a
// full-width resizable shelf below the body and above the status bar. AppShell
// also wraps `children` in an InspectorDockProvider so the portaled Inspector
// (a React descendant of children, through createPortal) can read dock state.
//
// The WI-1 hook reads its position from localStorage on mount, so each test
// writes the desired position to storage BEFORE rendering.

beforeEach(() => {
  localStorage.clear();
});

function bodyRow() {
  // The body row is the flex row holding tool strip | left column | canvas
  // (| inspector, in the right dock). The canvas region is always inside it.
  return screen.getByRole("region", { name: "Canvas" }).closest(".flex.flex-1");
}

// A probe that surfaces the dock context value so test 5 can prove the provider
// wraps children (and would reach portaled content the same way).
function DockProbe() {
  const dock = useInspectorDockContext();
  return <div data-testid="dock-probe">{dock ? dock.dockPosition : "no-context"}</div>;
}

describe("AppShell dock restructure (WI-4)", () => {
  it("right dock (default): renders the w-72 right column inside the body, no bottom row", () => {
    localStorage.setItem(POSITION_KEY, "right");
    render(<AppShell />);

    const inspector = screen.getByRole("region", { name: "Inspector" });
    const rightColumn = inspector.parentElement;
    expect(rightColumn.className).toContain("w-72");
    expect(rightColumn.className).toContain("flex");
    expect(rightColumn.className).toContain("flex-col");
    expect(rightColumn.className).toContain("shrink-0");
    expect(rightColumn.className).toContain("min-h-0");
    // The right column lives inside the body row.
    expect(bodyRow()).toContainElement(rightColumn);
    // No bottom shelf row in the right dock.
    expect(screen.queryByTestId("inspector-bottom-row")).not.toBeInTheDocument();
  });

  it("bottom dock: drops the right column from the body and adds a full-width bottom row", () => {
    localStorage.setItem(POSITION_KEY, "bottom");
    render(<AppShell />);

    const bottomRow = screen.getByTestId("inspector-bottom-row");
    expect(bottomRow).toBeInTheDocument();

    // The Inspector region now lives in the bottom row, not in a w-72 column.
    const inspector = screen.getByRole("region", { name: "Inspector" });
    expect(bottomRow).toContainElement(inspector);
    expect(inspector.parentElement.className).not.toContain("w-72");

    // DOM order: body row, THEN bottom row, THEN status bar.
    const body = bodyRow();
    const statusBar = screen.getByRole("region", { name: "Status bar" });
    // body precedes bottomRow
    expect(
      body.compareDocumentPosition(bottomRow) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // bottomRow precedes status bar
    expect(
      bottomRow.compareDocumentPosition(statusBar) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("bottom dock (not collapsed): top-edge row-resize handle present, height at usePanelHeight default (280)", () => {
    localStorage.setItem(POSITION_KEY, "bottom");
    render(<AppShell />);

    const bottomRow = screen.getByTestId("inspector-bottom-row");
    expect(bottomRow.style.height).toBe("280px");

    const handle = screen.getByTestId("inspector-shelf-resize");
    expect(handle).toBeInTheDocument();
    expect(handle.className).toContain("cursor-row-resize");
    expect(handle.getAttribute("aria-orientation")).toBe("horizontal");

    // A drag UP grows the shelf (top-edge handle).
    fireEvent.mouseDown(handle, { clientY: 300 });
    fireEvent.mouseMove(window, { clientY: 240 }); // up 60 -> 280 + 60 = 340
    expect(bottomRow.style.height).toBe("340px");
    fireEvent.mouseUp(window, { clientY: 240 });
  });

  it("bottom dock collapsed: thin bar (36px), no resize handle, Inspector mount still rendered", () => {
    localStorage.setItem(POSITION_KEY, "bottom");
    localStorage.setItem(COLLAPSED_KEY, "true");
    render(<AppShell />);

    const bottomRow = screen.getByTestId("inspector-bottom-row");
    expect(bottomRow.style.height).toBe("36px");
    expect(screen.queryByTestId("inspector-shelf-resize")).not.toBeInTheDocument();
    // Host still reachable for the portal.
    expect(screen.getByRole("region", { name: "Inspector" })).toBeInTheDocument();
  });

  it("provides dock context to children (proves the provider wraps children)", () => {
    localStorage.setItem(POSITION_KEY, "bottom");
    const { unmount } = render(
      <AppShell>
        <DockProbe />
      </AppShell>
    );
    expect(screen.getByTestId("dock-probe").textContent).toBe("bottom");
    unmount();

    localStorage.setItem(POSITION_KEY, "right");
    render(
      <AppShell>
        <DockProbe />
      </AppShell>
    );
    expect(screen.getByTestId("dock-probe").textContent).toBe("right");
  });
});
