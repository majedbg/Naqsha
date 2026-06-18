// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";
import { getProfile, defaultBedSize } from "../lib/machineProfiles";

// Issue #14 (Lane C / C6): the Document Setup dialog (machine + bed). Opened from
// the File menu in the pro shell; applying updates the artboard (bed state the
// chrome/status bar read), and switching profile in the dialog updates the
// default bed AND the operation library (same remap path as the LayerTree
// selector). Flag-OFF is a true no-op.
//
// As in the other StudioRoute integration tests, stub the p5 canvas surface +
// auth so the real Studio + shell render under jsdom. RightPanel (and so
// CanvasChrome) is mocked, so the artboard's observable here is the StatusBar bed
// readout — which DOES render in the shell.
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

  it("flag ON: applying a custom bed updates the artboard dimensions (status-bar bed readout)", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    // The document's active unit isn't necessarily mm (the default preset hints
    // inches), but the status bar always reads the bed in mm. Use a custom width
    // in INCHES that maps to a clean, unmistakable mm value: 20 in → 508 mm.
    // (Keep the default profile so this isolates the bed override path.)
    openDocumentSetup();
    const dialog = screen.getByRole("dialog");
    // Confirm the dialog shows dimensions in the active unit (inches here).
    expect(within(dialog).getByText(/width \(in\)/i)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText(/width/i), {
      target: { value: "20" },
    });
    fireEvent.change(within(dialog).getByLabelText(/height/i), {
      target: { value: "12" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /apply/i }));

    // Dialog closes; the status bar bed readout reflects the custom bed in mm
    // (20 in = 508 mm, 12 in = 305 mm) — proving the artboard bed updated.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const region = screen.getByRole("region", { name: "Status bar" });
    const bed = within(region).getByLabelText(/bed|material|machine/i);
    expect(bed).toHaveTextContent(/508/);
    expect(bed).toHaveTextContent(/305/);
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

  it("flag ON: reopening shows current settings; a custom bed survives a same-Apply profile switch", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    // Default profile is the pen plotter. In ONE Apply, switch to a DIFFERENT
    // profile (laser) AND set custom dims. This exercises the clobber-ordering
    // guard: the shared profile-change path resets the bed to laser's default
    // FIRST, then the dialog's custom bed must override it (custom wins).
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

    // Reopen — controls reflect the live document state (laser + the custom bed),
    // NOT stale defaults and NOT laser's default bed (the custom value survived).
    openDocumentSetup();
    dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/machine profile/i)).toHaveValue("laser");
    expect(within(dialog).getByLabelText(/width/i)).toHaveValue(175);
    expect(within(dialog).getByLabelText(/height/i)).toHaveValue(125);
  });

  it("flag OFF: legacy layout renders no Document Setup entry/dialog (true no-op)", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={false} />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /document setup/i })
    ).not.toBeInTheDocument();
  });
});
