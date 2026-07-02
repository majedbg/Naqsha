// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";
import {
  getProfile,
  defaultBedSize,
  bedPresetsFor,
  PROFILE_IDS,
} from "../lib/machineProfiles";

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

  it("flag ON desktop: View > Bed size selects a named preset (bed updates + shows checked), and None un-checks it", () => {
    // UX reframe: the bed is now a machine reference overlay chosen from the
    // View menu, decoupled from Document Setup. This exercises the menu wiring
    // Studio owns (bedPresets/activeBedPresetId/bedVisible/onSelectBedPreset/
    // onHideBed) end-to-end against the REAL MenuBar + StatusBar (only
    // RightPanel/CanvasChrome are mocked in this suite, so the actual dashed
    // bed-overlay hide/show on the canvas itself needs a manual browser check —
    // see docs note in the run report).
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    // Default profile is the pen plotter (outputMode default). Pick a preset
    // that is NOT the profile's default bed, so selecting it is observable as
    // a real change in the status-bar readout.
    const plotterPresets = bedPresetsFor("plotter");
    const targetPreset = plotterPresets.find(
      (p) => p.width !== defaultBedSize("plotter").width
    );
    expect(targetPreset).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByRole("button", { name: "Bed size" }));
    const presetItem = screen.getByRole("menuitemcheckbox", {
      name: targetPreset.label,
    });
    fireEvent.click(presetItem);

    // Status bar bed reading follows the selected preset.
    let region = screen.getByRole("region", { name: "Status bar" });
    let bed = within(region).getByLabelText(/bed|material|machine/i);
    expect(bed).toHaveTextContent(new RegExp(String(targetPreset.width)));

    // Reopen View > Bed size — the selected preset is checked.
    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByRole("button", { name: "Bed size" }));
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: targetPreset.label,
      })
    ).toHaveAttribute("aria-checked", "true");

    // Selecting "None" un-checks the preset (bedVisible flips false). The
    // status-bar dims are unaffected (bedSize itself doesn't change on hide) —
    // only the overlay's visibility does, which is verified manually in-browser.
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "None" }));

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    fireEvent.click(screen.getByRole("button", { name: "Bed size" }));
    expect(
      screen.getByRole("menuitemcheckbox", { name: "None" })
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("menuitemcheckbox", {
        name: targetPreset.label,
      })
    ).toHaveAttribute("aria-checked", "false");
  });

  it("below the breakpoint (mobile) renders no status bar (desktop-only)", () => {
    // #16: legacy removed; below the breakpoint StudioRoute renders MobileStudio,
    // which has no AppShell Status bar region. (Was: "flag OFF → legacy no-op".)
    const prevWidth = window.innerWidth;
    window.innerWidth = 500;
    render(
      <MemoryRouter>
        <StudioRoute />
      </MemoryRouter>
    );
    expect(screen.queryByTestId("status-bar")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    window.innerWidth = prevWidth;
  });
});
