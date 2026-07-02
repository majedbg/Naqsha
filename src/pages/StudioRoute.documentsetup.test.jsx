// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";
import { getProfile, defaultBedSize } from "../lib/machineProfiles";

// Issue #14 (Lane C / C6; UX reframe). The Document Setup dialog now edits the
// WORK PIECE (design canvas, canvasW/canvasH @96 PPI) as its primary control —
// the machine BED is no longer configured here (it moved to the View menu's
// "Bed size" submenu, tested in StudioRoute.statusbar.test.jsx). Opened from
// the File menu in the pro shell; applying updates the document's canvas size,
// and switching profile in the dialog still updates the default bed AND the
// operation library (same remap path as the LayerTree selector) — that half of
// Document Setup is unchanged.
//
// As in the other StudioRoute integration tests, stub the p5 canvas surface +
// auth so the real Studio + shell render under jsdom. RightPanel (and so
// CanvasChrome) is mocked, so the WORK PIECE observable here is reopening the
// dialog itself (it is CONTROLLED off Studio's live canvasW/canvasH, so a
// stale value would mean the apply never reached Studio state) — while the
// StatusBar bed readout is used to prove the bed is UNTOUCHED by a work-piece-
// only apply. (Studio always falls back to selecting the first layer when
// nothing is explicitly clicked, so the ControlBar's "nothing selected"
// document quick-info is not reachable here — ControlBar.test.jsx already
// covers that surface directly.)
vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ loading: false, user: null, tier: "guest" }),
  AuthProvider: ({ children }) => children,
}));

function openDocumentSetup() {
  // File menu → Document Setup… item.
  fireEvent.click(screen.getByRole("button", { name: "File" }));
  fireEvent.click(
    screen.getByRole("menuitem", { name: /document setup/i })
  );
}

describe("StudioRoute — Document Setup dialog (C6 / #14)", () => {
  it("flag ON: File menu opens the Document Setup dialog", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    openDocumentSetup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("flag ON: applying a custom size updates the WORK PIECE (persists across reopen), leaving the bed untouched", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    // Snapshot the status-bar bed reading BEFORE applying, so we can prove the
    // bed is NOT driven by Document Setup anymore (UX reframe — the bed is a
    // View-menu-only reference overlay).
    const statusRegion = screen.getByRole("region", { name: "Status bar" });
    const bedBefore = within(statusRegion).getByLabelText(
      /bed|material|machine/i
    ).textContent;

    openDocumentSetup();
    let dialog = screen.getByRole("dialog");
    // Confirm the dialog shows dimensions in the active unit (inches here) —
    // these are the WORK PIECE (canvasW/canvasH) controls, not the bed.
    expect(within(dialog).getByText(/width \(in\)/i)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/width/i), {
      target: { value: "20" },
    });
    fireEvent.change(within(dialog).getByLabelText(/height/i), {
      target: { value: "12" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Reopen: the dialog is CONTROLLED off Studio's live canvasW/canvasH, so
    // seeing 20/12 again proves the apply actually reached Studio state (a
    // stale value would mean it never left the dialog's local draft).
    openDocumentSetup();
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/width/i)).toHaveValue(20);
    expect(within(dialog).getByLabelText(/height/i)).toHaveValue(12);
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));

    // The bed reading is UNCHANGED by the work-piece-only apply (same profile,
    // no bed preset selected) — proving the two are decoupled.
    const bedAfter = within(statusRegion).getByLabelText(
      /bed|material|machine/i
    ).textContent;
    expect(bedAfter).toBe(bedBefore);
  });

  it("flag ON: switching profile in the dialog updates the default bed AND operation params", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    // Switch to laser in the dialog and apply — the operation library remaps to
    // laser's process/param vocabulary, so the operations panel shows laser
    // params (Power) and no plotter Pen #.
    openDocumentSetup();
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/machine profile/i), {
      target: { value: "laser" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    // Default bed followed the profile → status bar shows the laser bed.
    let region = screen.getByRole("region", { name: "Status bar" });
    let bed = within(region).getByLabelText(/bed|material|machine/i);
    expect(bed).toHaveTextContent(new RegExp(getProfile("laser").label, "i"));
    expect(bed).toHaveTextContent(
      new RegExp(String(defaultBedSize("laser").width))
    );

    // Operation library remapped through the SAME path the selector uses →
    // laser params (Power) now show.
    let opsPanel = screen.getByTestId("operations-panel");
    expect(within(opsPanel).queryAllByLabelText(/power/i).length).toBeGreaterThan(0);
    expect(within(opsPanel).queryAllByLabelText(/pen/i).length).toBe(0);

    // Switch to the pen plotter — params follow again (Pen # shows, Power gone),
    // and the default bed follows to the plotter bed.
    openDocumentSetup();
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/machine profile/i), {
      target: { value: "plotter" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    region = screen.getByRole("region", { name: "Status bar" });
    bed = within(region).getByLabelText(/bed|material|machine/i);
    expect(bed).toHaveTextContent(new RegExp(getProfile("plotter").label, "i"));
    expect(bed).toHaveTextContent(
      new RegExp(String(defaultBedSize("plotter").width))
    );

    opsPanel = screen.getByTestId("operations-panel");
    expect(within(opsPanel).queryAllByLabelText(/pen/i).length).toBeGreaterThan(0);
    expect(within(opsPanel).queryAllByLabelText(/power/i).length).toBe(0);
  });

  it("flag ON: reopening shows current settings; a custom work-piece size survives a same-Apply profile switch", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    // Default profile is the pen plotter. In ONE Apply, switch to a DIFFERENT
    // profile (laser) AND set custom work-piece dims. Unlike the bed (which
    // handleProfileChange resets to the new profile's default), canvasW/canvasH
    // is untouched by a profile switch — so the custom size must simply persist
    // through the combined apply and be reflected on reopen.
    openDocumentSetup();
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/machine profile/i)).toHaveValue("plotter");
    fireEvent.change(within(dialog).getByLabelText(/machine profile/i), {
      target: { value: "laser" },
    });
    fireEvent.change(within(dialog).getByLabelText(/width/i), {
      target: { value: "175" },
    });
    fireEvent.change(within(dialog).getByLabelText(/height/i), {
      target: { value: "125" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    // Reopen — controls reflect the live document state (laser + the custom
    // work-piece size), NOT stale defaults.
    openDocumentSetup();
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/machine profile/i)).toHaveValue("laser");
    expect(within(dialog).getByLabelText(/width/i)).toHaveValue(175);
    expect(within(dialog).getByLabelText(/height/i)).toHaveValue(125);
  });

  it("below the breakpoint (mobile) exposes no Document Setup entry/dialog (desktop-only)", () => {
    // #16: legacy removed; below the breakpoint StudioRoute renders MobileStudio,
    // which has no menu bar / Document Setup. (Was: "flag OFF → legacy no-op".)
    const prevWidth = window.innerWidth;
    window.innerWidth = 500;
    try {
      render(
        <MemoryRouter>
          <StudioRoute />
        </MemoryRouter>
      );
      expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: /document setup/i })
      ).not.toBeInTheDocument();
    } finally {
      window.innerWidth = prevWidth;
    }
  });
});
