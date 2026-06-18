// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";
import { getProfile, defaultBedSize, PROFILE_IDS } from "../lib/machineProfiles";

// Issue #7 (Lane B / B4): the canvas chrome's status bar is portaled into the
// shell's Status bar region on the flag-ON desktop path, and is a true no-op on
// flag-OFF. As in the other StudioRoute integration tests, stub the p5 canvas
// surface + auth so the real Studio + shell render under jsdom.
vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ loading: false, user: null, tier: "guest" }),
  AuthProvider: ({ children }) => children,
}));

describe("StudioRoute — canvas-chrome status bar (B4)", () => {
  it("flag ON desktop: status bar renders inside the Status bar region with units, zoom, bed", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    const region = screen.getByRole("region", { name: "Status bar" });
    const bar = within(region).getByTestId("status-bar");
    expect(bar).toBeInTheDocument();
    // Active unit (whatever the document's current unit is — mm/in/px).
    expect(within(bar).getByLabelText(/unit/i)).toHaveTextContent(/mm|in|px/i);
    // Zoom % (100% at rest).
    expect(within(bar).getByLabelText(/zoom/i)).toHaveTextContent("100%");
    // Active machine/bed — the bar shows whichever profile is active, and its
    // bed dims must match defaultBedSize() for THAT profile (bed = profile, not
    // canvas px). Resolve the active profile from the rendered label, then check
    // its bed width is present.
    const bed = within(bar).getByLabelText(/bed|material|machine/i);
    const activeId = PROFILE_IDS.find((id) =>
      bed.textContent.includes(getProfile(id).label)
    );
    expect(activeId).toBeTruthy();
    expect(bed).toHaveTextContent(
      new RegExp(String(defaultBedSize(activeId).width))
    );
  });

  it("flag ON desktop: the bed readout tracks the active machine profile", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    const objectTree = screen.getByRole("region", { name: "Object tree" });
    const selector = within(objectTree).getByLabelText(/machine profile/i);
    // Switch to the pen plotter — the status-bar bed should follow.
    fireEvent.change(selector, { target: { value: "plotter" } });

    const region = screen.getByRole("region", { name: "Status bar" });
    const bed = within(region).getByLabelText(/bed|material|machine/i);
    expect(bed).toHaveTextContent(new RegExp(getProfile("plotter").label, "i"));
    const plotter = defaultBedSize("plotter");
    expect(bed).toHaveTextContent(new RegExp(String(plotter.width)));
  });

  it("flag OFF: legacy layout renders no status bar (true no-op)", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={false} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("status-bar")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
  });
});
