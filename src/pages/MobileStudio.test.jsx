// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";
import MobileStudio from "./MobileStudio";

// Lane B / B7 (issue #16): below the 768px desktop breakpoint StudioRoute drops
// the pro shell and renders the simplified single-column mobile editing view
// (NOT the removed legacy two-pane layout). Stub the p5 canvas surface + auth so
// the real MobileStudio renders its real chrome under jsdom.
vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ loading: false, user: null, tier: "guest" }),
  AuthProvider: ({ children }) => children,
}));

describe("StudioRoute mobile gate (B7 / #16)", () => {
  let prevWidth;
  beforeEach(() => {
    prevWidth = window.innerWidth;
  });
  afterEach(() => {
    window.innerWidth = prevWidth;
  });

  it("below the desktop breakpoint renders the simplified mobile view (no shell regions)", () => {
    window.innerWidth = 500; // below 768
    render(
      <MemoryRouter>
        <StudioRoute />
      </MemoryRouter>
    );
    // The mobile view is single-column: it has NONE of the eight shell regions.
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    // It hosts the same canvas surface.
    expect(screen.getByTestId("canvas-surface")).toBeInTheDocument();
    // The "best viewed on desktop" expectation-setting note is present.
    expect(screen.getByText(/best viewed on desktop/i)).toBeInTheDocument();
  });

  it("at/above the breakpoint renders the pro shell, not the mobile view", () => {
    window.innerWidth = 1024; // desktop
    render(
      <MemoryRouter>
        <StudioRoute />
      </MemoryRouter>
    );
    expect(screen.getAllByRole("region")).toHaveLength(8);
    expect(screen.queryByText(/best viewed on desktop/i)).not.toBeInTheDocument();
  });
});

describe("MobileStudio — essentials", () => {
  it("shows the canvas, an add-layer affordance, and an export action", () => {
    render(
      <MemoryRouter>
        <MobileStudio />
      </MemoryRouter>
    );
    expect(screen.getByTestId("canvas-surface")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /\+ Layer/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Export SVG/ })
    ).toBeInTheDocument();
  });

  it("opens the pattern picker when the add-layer affordance is tapped", () => {
    render(
      <MemoryRouter>
        <MobileStudio />
      </MemoryRouter>
    );
    // Pattern picker (the "periodic table") is closed initially — its heading
    // is not rendered.
    expect(screen.queryByText("Choose a pattern")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /\+ Layer/ }));
    // The modal actually opens — its "Choose a pattern" heading + Close
    // affordance render.
    expect(screen.getByText("Choose a pattern")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close" })
    ).toBeInTheDocument();
  });

  it("renders the default document's layers as selectable chips", () => {
    render(
      <MemoryRouter>
        <MobileStudio />
      </MemoryRouter>
    );
    // useLayers seeds a default document with at least one layer, so the layer
    // strip has at least one selectable chip plus the "+ Layer" affordance.
    const strip = screen.getByRole("button", { name: /\+ Layer/ }).parentElement;
    const buttons = within(strip).getAllByRole("button");
    // "+ Layer" plus one or more layer chips.
    expect(buttons.length).toBeGreaterThan(1);
  });

  it("enables Edit only when a layer chip is selected, and opens the inspector drawer", () => {
    render(
      <MemoryRouter>
        <MobileStudio />
      </MemoryRouter>
    );
    const editBtn = screen.getByRole("button", { name: /^Edit$/ });
    // No selection yet → Edit disabled.
    expect(editBtn).toBeDisabled();
    // Select the first layer chip (the sibling of "+ Layer" in the strip).
    const strip = screen.getByRole("button", { name: /\+ Layer/ }).parentElement;
    const layerChip = within(strip)
      .getAllByRole("button")
      .find((b) => !/\+ Layer/.test(b.textContent));
    fireEvent.click(layerChip);
    // Selecting opens the inspector drawer (Parameters panel) directly.
    expect(screen.getByText(/Parameters/)).toBeInTheDocument();
    // Closing it, Edit is now enabled (a selection exists).
    fireEvent.click(screen.getByRole("button", { name: /Close parameters/ }));
    expect(
      screen.getByRole("button", { name: /^Edit$/ })
    ).not.toBeDisabled();
  });
});
