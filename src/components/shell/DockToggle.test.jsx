// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DockToggle from "./DockToggle";
import Inspector from "./Inspector";
import { InspectorDockProvider } from "./inspectorDockContext";
import { DEFAULT_PARAMS } from "../../constants";

// Inspector composes PatternTabs + PatternParams, both of which read the gate via
// useAuth. Mock useAuth so the integration render (test 5) doesn't crash on a
// missing provider (mirrors Inspector.test.jsx).
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: "studio" }),
}));

// Mirror Inspector.test.jsx's layer factory for the integration case.
function makeLayer(id, patternType, name) {
  return {
    id,
    name: name || id,
    patternType,
    params: { ...DEFAULT_PARAMS[patternType] },
    randomizeKeys: [],
    paramsCache: {},
  };
}

describe("DockToggle (WI-5 — header dock-toggle + collapse chevron)", () => {
  // 1. No provider → renders nothing (keeps standalone Inspector unchanged).
  it("renders nothing when there is no dock provider", () => {
    const { container } = render(<DockToggle />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("inspector-dock-header")).not.toBeInTheDocument();
  });

  // 2. Right dock → "Dock Bottom" button, no collapse chevron.
  it("right dock: shows a Dock Bottom toggle and no collapse chevron", () => {
    const toggleDock = vi.fn();
    const toggleCollapsed = vi.fn();
    render(
      <InspectorDockProvider
        value={{
          dockPosition: "right",
          toggleDock,
          collapsed: false,
          toggleCollapsed,
        }}
      >
        <DockToggle />
      </InspectorDockProvider>
    );
    const btn = screen.getByLabelText("Dock Bottom");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(toggleDock).toHaveBeenCalledTimes(1);
    // No collapse/expand chevron in right dock.
    expect(screen.queryByLabelText(/collapse|expand/i)).toBeNull();
  });

  // 3. Bottom dock, expanded → "Dock Right" toggle + "Collapse properties" chevron.
  it("bottom dock (expanded): shows Dock Right + Collapse properties chevron", () => {
    const toggleDock = vi.fn();
    const toggleCollapsed = vi.fn();
    render(
      <InspectorDockProvider
        value={{
          dockPosition: "bottom",
          toggleDock,
          collapsed: false,
          toggleCollapsed,
        }}
      >
        <DockToggle />
      </InspectorDockProvider>
    );
    const dockBtn = screen.getByLabelText("Dock Right");
    fireEvent.click(dockBtn);
    expect(toggleDock).toHaveBeenCalledTimes(1);

    const chevron = screen.getByLabelText("Collapse properties");
    expect(chevron).toBeInTheDocument();
    fireEvent.click(chevron);
    expect(toggleCollapsed).toHaveBeenCalledTimes(1);
  });

  // 4. Bottom dock, collapsed → "Expand properties" chevron carries -rotate-90.
  it("bottom dock (collapsed): chevron is Expand properties and is rotated", () => {
    render(
      <InspectorDockProvider
        value={{
          dockPosition: "bottom",
          toggleDock: vi.fn(),
          collapsed: true,
          toggleCollapsed: vi.fn(),
        }}
      >
        <DockToggle />
      </InspectorDockProvider>
    );
    const chevron = screen.getByLabelText("Expand properties");
    expect(chevron).toBeInTheDocument();
    const svg = chevron.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("class")).toContain("-rotate-90");
  });

  // 5. Inspector integration — toggle appears with a provider, absent without one.
  it("Inspector renders the dock header when a provider is present, and not otherwise", () => {
    render(
      <InspectorDockProvider
        value={{
          dockPosition: "bottom",
          collapsed: false,
          toggleDock: vi.fn(),
          toggleCollapsed: vi.fn(),
        }}
      >
        <Inspector
          layers={[makeLayer("l1", "flowfield", "Flow")]}
          selectedLayerId="l1"
          onUpdateLayer={() => {}}
          onChangeLayerPattern={() => {}}
        />
      </InspectorDockProvider>
    );
    expect(screen.getByLabelText("Dock Right")).toBeInTheDocument();

    // Without a provider: no dock header (existing standalone behavior preserved).
    // Scope the query to THIS render's container so the provider render above is
    // not matched (both share document.body otherwise).
    const { container } = render(
      <Inspector
        layers={[makeLayer("l2", "flowfield", "Flow")]}
        selectedLayerId="l2"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(
      within(container).queryByTestId("inspector-dock-header")
    ).toBeNull();
  });
});
