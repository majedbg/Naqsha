// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";

// Issue #6 (Lane B / B3): the param inspector is portaled into the shell's right
// Inspector region on the flag-ON desktop path, and is a true no-op on flag-OFF.
//
// As in StudioRoute.test.jsx, stub the p5 canvas surface + auth so the real
// Studio (and the real shell) render under jsdom. A signed-out "guest" still
// gets a populated inspector for the default-selected top layer.
vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ loading: false, user: null, tier: "guest" }),
  AuthProvider: ({ children }) => children,
}));

describe("StudioRoute — param inspector in the right column (B3)", () => {
  it("flag ON desktop: the inspector renders inside the Inspector region with the selected layer's params", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    const inspectorRegion = screen.getByRole("region", { name: "Inspector" });
    // The param editor is portaled into the Inspector region (not the canvas /
    // legacy left panel).
    const params = within(inspectorRegion).getByTestId("inspector-params");
    expect(params).toBeInTheDocument();
    // The pattern-type swap control (PatternTabs) is present at the top of the
    // inspector — its "Pattern" heading + at least one pattern tab button.
    expect(
      within(inspectorRegion).getByText("Pattern")
    ).toBeInTheDocument();
    // At least one real param slider from the default layer renders here.
    expect(
      within(inspectorRegion).getAllByRole("slider").length
    ).toBeGreaterThan(0);
  });

  it("below the breakpoint (mobile) renders no shell inspector region (desktop-only)", () => {
    // #16: legacy removed; below the breakpoint StudioRoute renders MobileStudio,
    // which has no AppShell Inspector region (its param drawer is closed by
    // default). (Was: "flag OFF → legacy no-op".)
    const prevWidth = window.innerWidth;
    window.innerWidth = 500;
    try {
      render(
        <MemoryRouter>
          <StudioRoute />
        </MemoryRouter>
      );
      expect(screen.queryByRole("region", { name: "Inspector" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("inspector-params")).not.toBeInTheDocument();
      expect(screen.queryAllByRole("region")).toHaveLength(0);
    } finally {
      window.innerWidth = prevWidth;
    }
  });
});
