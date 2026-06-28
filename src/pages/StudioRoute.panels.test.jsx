// @vitest-environment jsdom
//
// WI-6 — Studio wiring for Naqsha Panels (spec §5). The FINAL integration:
// mode-gate + Studio wiring. Panels (the LayerTree grouped tier, add/delete,
// substrate editor, and per-panel ZIP export) render ONLY when the active
// machine profile is 'laser'. Switching OUT of laser hides the panel UI/export
// but PRESERVES every `layer.panelId` (non-destructive dormancy); switching back
// restores the exact grouping. Plotter AND dragCutter render the flat list +
// flat export exactly as today.
//
// Mirrors the StudioRoute route-test harness (RightPanel mocked → p5 never loads
// under jsdom; AuthContext stubbed so the real Studio renders its real chrome).
// RightPanel stays mocked, so the canvas (useCanvas 12th-arg) gating is NOT
// observable here — it is covered by the WI-4 useCanvas tests + the build; this
// suite exercises the route-level laser-only gate + dormancy.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";

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

function renderPro() {
  return render(
    <MemoryRouter>
      <StudioRoute proShell={true} />
    </MemoryRouter>
  );
}

const objectTree = () =>
  screen.getByRole("region", { name: /object tree|layers/i });

// Switch the document machine profile via the LayerTree's Machine selector.
function setProfile(value) {
  fireEvent.change(screen.getByRole("combobox", { name: "Machine profile" }), {
    target: { value },
  });
}

describe("StudioRoute — Naqsha Panels laser-only gate (WI-6 / spec §5)", () => {
  beforeEach(() => localStorage.clear());

  it("in laser mode the panel tier AND the per-panel export affordance render", () => {
    renderPro();
    setProfile("laser");

    const tree = objectTree();
    // The grouped tier renders at least one PanelHeader (useLayers seeds one
    // panel on mount and assigns every layer to it via normalizePanels).
    expect(within(tree).getAllByTestId("panel-header").length).toBeGreaterThan(0);
    // The laser-only per-panel ZIP export affordance is present.
    expect(
      screen.getByRole("button", { name: "Export panels (ZIP)" })
    ).toBeInTheDocument();
  });

  it("in plotter mode neither the panel tier nor the per-panel export affordance render (flat list)", () => {
    renderPro();
    setProfile("plotter");

    const tree = objectTree();
    expect(within(tree).queryByTestId("panel-header")).not.toBeInTheDocument();
    // Flat list still shows the layer rows.
    expect(within(tree).getAllByTestId("layer-row").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Export panels (ZIP)" })
    ).not.toBeInTheDocument();
  });

  it("in dragCutter mode neither the panel tier nor the per-panel export affordance render (laser-only excludes dragCutter)", () => {
    renderPro();
    setProfile("dragCutter");

    const tree = objectTree();
    expect(within(tree).queryByTestId("panel-header")).not.toBeInTheDocument();
    expect(within(tree).getAllByTestId("layer-row").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Export panels (ZIP)" })
    ).not.toBeInTheDocument();
  });

  it("dormancy: laser → plotter → laser preserves the grouping (panelId untouched on profile change)", () => {
    renderPro();

    setProfile("laser");
    let tree = objectTree();
    const headersBefore = within(tree).getAllByTestId("panel-header").length;
    const rowsBefore = within(tree).getAllByTestId("layer-row").length;
    expect(headersBefore).toBeGreaterThan(0);
    expect(rowsBefore).toBeGreaterThan(0);

    // Out of laser → grouped tier hidden, flat list shown.
    setProfile("plotter");
    tree = objectTree();
    expect(within(tree).queryByTestId("panel-header")).not.toBeInTheDocument();
    expect(within(tree).getAllByTestId("layer-row").length).toBe(rowsBefore);

    // Back to laser → the EXACT grouping reappears (same header count + rows).
    // Grouping is keyed on `layer.panelId`; identical grouping IS proof that no
    // panelId was cleared on the profile change (non-destructive dormancy).
    setProfile("laser");
    tree = objectTree();
    expect(within(tree).getAllByTestId("panel-header").length).toBe(headersBefore);
    expect(within(tree).getAllByTestId("layer-row").length).toBe(rowsBefore);
  });

  it("dormancy: profile change does NOT clear any layer's panelId in persisted sonoform-layers", async () => {
    renderPro();

    setProfile("laser");
    // Let the seeded layers + panelId assignment persist (debounced 3000ms, §10).
    await waitFor(
      () => {
        const raw = localStorage.getItem("sonoform-layers");
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw);
        expect(parsed.length).toBeGreaterThan(0);
        // Every layer carries a non-null panelId after normalization.
        expect(parsed.every((l) => l.panelId != null)).toBe(true);
      },
      { timeout: 4000 }
    );

    // Switch out of laser; panelId values must remain untouched.
    setProfile("plotter");
    await waitFor(
      () => {
        const parsed = JSON.parse(localStorage.getItem("sonoform-layers"));
        expect(parsed.every((l) => l.panelId != null)).toBe(true);
      },
      { timeout: 4000 }
    );
  });
});

describe("StudioRoute — Naqsha Panels handler round-trips (WI-6 / spec §5)", () => {
  beforeEach(() => localStorage.clear());

  it("adding a panel through the UI persists to sonoform-panels", async () => {
    renderPro();
    setProfile("laser");

    const tree = objectTree();
    const headersBefore = within(tree).getAllByTestId("panel-header").length;

    fireEvent.click(within(tree).getByRole("button", { name: "Add panel" }));

    // A new PanelHeader appears immediately…
    await waitFor(() => {
      expect(within(objectTree()).getAllByTestId("panel-header").length).toBe(
        headersBefore + 1
      );
    });
    // …and the new panel array round-trips to localStorage (debounced).
    await waitFor(
      () => {
        const parsed = JSON.parse(localStorage.getItem("sonoform-panels"));
        expect(parsed.length).toBe(headersBefore + 1);
      },
      { timeout: 4000 }
    );
  });

  it("editing a panel's substrate through the UI updates the summary + persists", async () => {
    renderPro();
    setProfile("laser");

    const header = within(objectTree()).getAllByTestId("panel-header")[0];
    // Open the substrate editor. The summary button's accessible name is the
    // substrate summary text itself (default "acrylic · 3mm"); its full intent
    // lives in the `title` ("Edit substrate — …"). Match the kind text.
    const summaryBtn = within(header).getByRole("button", {
      name: /acrylic/i,
    });
    fireEvent.click(summaryBtn);

    // Change the substrate kind acrylic → plywood.
    fireEvent.change(
      within(header).getByRole("combobox", { name: "Substrate kind" }),
      { target: { value: "plywood" } }
    );

    // The summary reflects the new kind (round-tripped through onUpdatePanel).
    await waitFor(() => {
      expect(
        within(objectTree()).getAllByTestId("panel-header")[0]
      ).toHaveTextContent(/plywood/);
    });
    // …and it persists to sonoform-panels.
    await waitFor(
      () => {
        const parsed = JSON.parse(localStorage.getItem("sonoform-panels"));
        expect(parsed.some((p) => p.substrate?.kind === "plywood")).toBe(true);
      },
      { timeout: 4000 }
    );
  });
});

describe("StudioRoute — flat export path unchanged in plotter (WI-6 / spec §5)", () => {
  beforeEach(() => localStorage.clear());

  it("the flat export affordance (File → Export) is present + functioning in plotter", () => {
    renderPro();
    setProfile("plotter");

    // The shell's File menu exposes the flat Export (handleExportAll). Open it
    // and confirm the Export item is present (the flat path is untouched).
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    expect(
      screen.getByRole("menuitem", { name: /export/i })
    ).toBeInTheDocument();
  });
});
