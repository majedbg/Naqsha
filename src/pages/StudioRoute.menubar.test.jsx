// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";

// Issue #8 (Lane B / B5): the top menu bar is portaled into the shell's Menu bar
// region on the flag-ON desktop path, and the legacy loose top bar is suppressed
// there so no orphaned buttons remain. Flag-OFF stays a true no-op (legacy bar
// unchanged, no shell regions).
//
// As in the #6 inspector test, stub the p5 canvas surface + auth so the real
// Studio (and the real shell) render under jsdom.
vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({
    loading: false,
    user: null,
    tier: "guest",
    profile: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

describe("StudioRoute — menu bar in the shell's Menu bar region (B5)", () => {
  it("flag ON desktop: the menu bar renders inside the Menu bar region", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    const menuRegion = screen.getByRole("region", { name: "Menu bar" });
    // The five top-level menus live inside the Menu bar region.
    for (const menu of ["File", "Edit", "View", "Object", "Help"]) {
      expect(
        within(menuRegion).getByRole("button", { name: menu })
      ).toBeInTheDocument();
    }
  });

  it("flag ON desktop: no orphaned legacy loose top-bar buttons remain", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    // The legacy top bar rendered Examples / Load existing as loose buttons.
    // After folding into menus there must be no top-level (non-menuitem) button
    // labelled "Load existing" floating outside the menu region.
    expect(
      screen.queryByRole("button", { name: /load existing/i })
    ).not.toBeInTheDocument();
  });

  it("flag OFF: legacy loose top bar is unchanged and no shell region exists", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={false} />
      </MemoryRouter>
    );
    // Legacy loose buttons still present (true no-op).
    expect(
      screen.getByRole("button", { name: /load existing/i })
    ).toBeInTheDocument();
    // No shell regions at all.
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    // No menu bar.
    expect(
      screen.queryByRole("button", { name: "File" })
    ).not.toBeInTheDocument();
  });
});
