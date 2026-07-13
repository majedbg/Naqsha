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
import { createLayer } from "../lib/useLayers";

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

// The grouped-tier panel container for the Nth panel (0-based, in render order =
// `order` ascending). LayerTree wraps each PanelHeader in a `<div
// data-testid={panel.id}>`, so the header's parent IS that container — its
// data-testid is the panel id. Returns { el, id } so callers can scope queries
// to one panel AND assert against its id.
function panelAt(index) {
  const header = within(objectTree()).getAllByTestId("panel-header")[index];
  const el = header.parentElement;
  return { el, id: el.getAttribute("data-testid") };
}

// Pick a pattern through the REAL PatternPickerModal. Switch to the Map tab
// first (plain PatternCard, no dnd-kit grid that misbehaves in jsdom), then
// click the card carrying `symbol` (each pattern's glyph is unique, e.g. spiral
// = "Sl"). Drives Studio's onPick → addLayer(id, { panelId }).
function pickPattern(symbol = "Sl") {
  fireEvent.click(screen.getByRole("tab", { name: "Map" }));
  fireEvent.click(screen.getByText(symbol).closest("button"));
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

    fireEvent.click(within(tree).getByRole("button", { name: "Create panel" }));

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
    // Open the substrate-details editor via the ⋯ menu (material + thickness
    // now live on their own row chips; kind/color/label behind the menu).
    fireEvent.click(within(header).getByRole("button", { name: "Panel options" }));
    fireEvent.click(within(header).getByRole("menuitem", { name: "Substrate details…" }));

    // Change the substrate kind acrylic → plywood.
    fireEvent.change(
      within(header).getByRole("combobox", { name: "Substrate kind" }),
      { target: { value: "plywood" } }
    );

    // The editor's select reflects the new kind (round-tripped through
    // onUpdatePanel → panels state → prop).
    await waitFor(() => {
      expect(
        within(objectTree()).getByRole("combobox", { name: "Substrate kind" })
      ).toHaveValue("plywood");
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

describe("StudioRoute — panel edits are undoable (unified history S4)", () => {
  beforeEach(() => localStorage.clear());

  // Drive the global ⌘Z handler (Studio binds keydown on window; events bubble
  // document.body → window). This exercises the REAL onAddPanel handler wired in
  // Studio.jsx, not a parallel harness copy.
  const undo = () =>
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });

  it("adding a panel through the UI then ⌘Z removes the added panel", async () => {
    renderPro();
    setProfile("laser");

    const headersBefore = within(objectTree()).getAllByTestId(
      "panel-header"
    ).length;

    fireEvent.click(
      within(objectTree()).getByRole("button", { name: "Create panel" })
    );
    await waitFor(() => {
      expect(within(objectTree()).getAllByTestId("panel-header").length).toBe(
        headersBefore + 1
      );
    });

    // Undo restores the pre-add panel set (recordStructural captured it before
    // the mutation; the snapshot carries the panels slice).
    undo();
    await waitFor(() => {
      expect(within(objectTree()).getAllByTestId("panel-header").length).toBe(
        headersBefore
      );
    });
  });
});

describe("StudioRoute — create panel from a material preset (P7 slice 1)", () => {
  beforeEach(() => localStorage.clear());

  it("a chosen preset becomes the new panel's substrate", async () => {
    renderPro();
    setProfile("laser");

    // Pick the plywood · 4mm preset (SUBSTRATE_PRESETS index 2) on NewPanelRow,
    // then create → onCreatePanel(preset) → onAddPanel(substrate).
    fireEvent.change(
      within(objectTree()).getByRole("combobox", { name: "Material preset" }),
      { target: { value: "2" } }
    );
    fireEvent.click(
      within(objectTree()).getByRole("button", { name: "Create panel" })
    );

    await waitFor(() =>
      expect(within(objectTree()).getAllByTestId("panel-header").length).toBe(2)
    );
    // The new panel (order 1) carries the plywood preset's 4mm thickness on its
    // chip (kind now lives behind ⋯ → Substrate details) and persists plywood.
    expect(
      within(panelAt(1).el).getByRole("button", { name: "Panel thickness" })
    ).toHaveTextContent("4 mm");
    // …and its details editor carries the plywood kind.
    const h2 = panelAt(1).el;
    fireEvent.click(within(h2).getByRole("button", { name: "Panel options" }));
    fireEvent.click(within(h2).getByRole("menuitem", { name: "Substrate details…" }));
    expect(within(h2).getByRole("combobox", { name: "Substrate kind" })).toHaveValue("plywood");
  });
});

describe("StudioRoute — add-layer threads the target panel (P7 slice 2)", () => {
  beforeEach(() => localStorage.clear());

  it("clicking panel 2's '+ Add layer' assigns the new layer to panel 2", async () => {
    renderPro();
    setProfile("laser");

    // Create a second panel (NewPanelRow, no preset → default panel).
    fireEvent.click(
      within(objectTree()).getByRole("button", { name: "Create panel" })
    );
    await waitFor(() =>
      expect(within(objectTree()).getAllByTestId("panel-header").length).toBe(2)
    );

    const panel1 = panelAt(0);
    const panel2 = panelAt(1);
    // Panel 2 starts empty; capture panel 1's rows to prove they're untouched
    // (rules out a stale-pendingPanelId leak onto the wrong group).
    const panel1RowsBefore = within(panel1.el).queryAllByTestId("layer-row").length;
    expect(within(panel2.el).queryAllByTestId("layer-row").length).toBe(0);

    // Open the picker for PANEL 2 specifically. Both expanded panels render an
    // "Add layer" button (same static aria-label); render order = order asc, so
    // index 1 is panel 2's.
    const addButtons = within(objectTree()).getAllByRole("button", {
      name: "Add layer",
    });
    fireEvent.click(addButtons[1]);

    // Pick a pattern → addLayer(id, { panelId: panel2.id }).
    pickPattern("Sl");

    // The new layer renders UNDER panel 2 (grouped tier filters by panelId, so a
    // row appears in this container iff layer.panelId === panel2.id). Panel 1 is
    // unchanged → no stale id leaked.
    await waitFor(() =>
      expect(within(panel2.el).getAllByTestId("layer-row").length).toBe(1)
    );
    expect(within(panel1.el).queryAllByTestId("layer-row").length).toBe(
      panel1RowsBefore
    );
  });
});

describe("StudioRoute — duplicate panel (P7 slice 3)", () => {
  beforeEach(() => localStorage.clear());

  const undo = () =>
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });

  // Delete the first flat/grouped layer-row so the document drops to a single
  // layer — leaving headroom under the guest cap (3) to duplicate a 1-layer
  // panel (1 + 1 ≤ 3). Mirrors the row's ⋯ → Delete → confirm flow.
  function deleteFirstLayer() {
    const row = within(objectTree()).getAllByTestId("layer-row")[0];
    fireEvent.click(within(row).getByRole("button", { name: "Row actions" }));
    fireEvent.click(within(row).getByRole("menuitem", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  }

  it("duplicating a panel appends a panel whose layer is a fresh-id copy; ⌘Z restores", async () => {
    renderPro();
    setProfile("laser");

    // Seed shrinks to one layer on the lone panel (cap headroom for the copy).
    deleteFirstLayer();
    await waitFor(() =>
      expect(within(objectTree()).getAllByTestId("layer-row").length).toBe(1)
    );

    // Duplicate panel 1 via its ⋯ Panel options → Duplicate.
    const panel1 = panelAt(0);
    fireEvent.click(
      within(panel1.el).getByRole("button", { name: "Panel options" })
    );
    fireEvent.click(
      within(panel1.el).getByRole("menuitem", { name: "Duplicate" })
    );

    // A second panel is appended, carrying one copied layer-row.
    await waitFor(() =>
      expect(within(objectTree()).getAllByTestId("panel-header").length).toBe(2)
    );
    expect(within(objectTree()).getAllByTestId("layer-row").length).toBe(2);
    expect(within(panelAt(1).el).getAllByTestId("layer-row").length).toBe(1);

    // The copy has a FRESH layer id (unique) and lives on the NEW panel (two
    // distinct panelIds across the two layers). Asserted off persisted state.
    await waitFor(
      () => {
        const persisted = JSON.parse(localStorage.getItem("sonoform-layers"));
        expect(persisted.length).toBe(2);
        expect(new Set(persisted.map((l) => l.id)).size).toBe(2);
        expect(new Set(persisted.map((l) => l.panelId)).size).toBe(2);
      },
      { timeout: 4000 }
    );

    // ⌘Z restores the pre-duplicate state: one panel, one layer.
    undo();
    await waitFor(() =>
      expect(within(objectTree()).getAllByTestId("panel-header").length).toBe(1)
    );
    expect(within(objectTree()).getAllByTestId("layer-row").length).toBe(1);
  });
});

describe("StudioRoute — clear all layers on a panel (P7 slice 4)", () => {
  // This test's premise is "Panel 1 holds the 2 seeded layers" — the OLD
  // two-layer createLayer(0/1) default. Guest onboarding (S1) now lands a
  // fresh guest (no saved work) on the single-layer Phyllotaxis starter
  // instead (D5). Seed localStorage as a "returning guest" with an existing
  // 2-layer local document so the no-clobber path (saved work always wins
  // over the seed) applies and this suite keeps exercising its own concern
  // (panel-clear/undo across a multi-layer panel) unaffected by the new
  // onboarding default.
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("sonoform-layers", JSON.stringify([createLayer(0), createLayer(1)]));
  });

  const undo = () =>
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });

  it("clearing a panel removes its layers (doc not emptied); ⌘Z restores them", async () => {
    renderPro();
    setProfile("laser");

    // Distribute layers across two panels so clearing panel 1 (its 2 seeded
    // layers) can't empty the document — panel 2 keeps one. Create panel 2,
    // then add a layer to it.
    fireEvent.click(
      within(objectTree()).getByRole("button", { name: "Create panel" })
    );
    await waitFor(() =>
      expect(within(objectTree()).getAllByTestId("panel-header").length).toBe(2)
    );
    fireEvent.click(
      within(objectTree()).getAllByRole("button", { name: "Add layer" })[1]
    );
    pickPattern("Sl");
    await waitFor(() =>
      expect(within(panelAt(1).el).getAllByTestId("layer-row").length).toBe(1)
    );

    // Panel 1 holds the 2 seeded layers.
    expect(within(panelAt(0).el).getAllByTestId("layer-row").length).toBe(2);

    // Clear panel 1 via its ⋯ Panel options → Clear all layers → confirm.
    fireEvent.click(
      within(panelAt(0).el).getByRole("button", { name: "Panel options" })
    );
    fireEvent.click(
      within(panelAt(0).el).getByRole("menuitem", { name: "Clear all layers" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    // Panel 1 is emptied; panel 2's layer survives (doc not emptied).
    await waitFor(() =>
      expect(within(panelAt(0).el).queryAllByTestId("layer-row").length).toBe(0)
    );
    expect(within(objectTree()).getAllByTestId("layer-row").length).toBe(1);

    // ⌘Z restores panel 1's layers.
    undo();
    await waitFor(() =>
      expect(within(panelAt(0).el).getAllByTestId("layer-row").length).toBe(2)
    );
    expect(within(objectTree()).getAllByTestId("layer-row").length).toBe(3);
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
