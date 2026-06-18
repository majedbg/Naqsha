// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";

// Issue #11 (Lane C / C2): the stroke/operation swatch → operation picker, wired
// end-to-end through the real Studio + pro shell. The swatch (control bar) and
// the base chip (tool strip) open the picker; with a layer selected a pick
// ASSIGNS that layer (undoable), with nothing selected it sets the document
// default for the next added layer. The LayerTree row chip reassigns its row.
//
// As in the other shell integration tests, stub the p5 canvas + auth so the real
// Studio renders under jsdom.
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

describe("StudioRoute — operation picker wiring (C2)", () => {
  beforeEach(() => localStorage.clear());

  it("the control-bar swatch opens the operation picker (operations, not a wheel)", () => {
    renderPro();
    const bar = screen.getByRole("region", { name: "Contextual control bar" });
    const swatch = within(bar).getByRole("button", { name: /operation/i });
    fireEvent.click(swatch);
    const menu = within(bar).getByRole("menu", { name: /operation/i });
    expect(within(menu).getByRole("menuitem", { name: /cut/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /score/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /engrave/i })).toBeInTheDocument();
    // The picker itself is an operation list, NOT a color wheel.
    expect(menu.querySelector('input[type="color"]')).toBeNull();
  });

  it("with a layer selected, picking from the row chip reassigns that layer's operation", () => {
    renderPro();
    const tree = screen.getByRole("region", { name: /object tree|layers/i });
    const rows = within(tree).getAllByTestId("layer-row");
    // The top row defaults to Cut (red). Open its chip and pick Score.
    const chip = within(rows[0]).getByTestId("operation-chip");
    // The row chip shows the operation INITIAL inline + full name in its `title`
    // (spec §3.1: no operation-name text inline). Assert identity via the title.
    expect(chip).toHaveAttribute("title", expect.stringMatching(/cut/i));
    fireEvent.click(chip);
    fireEvent.click(screen.getByRole("menuitem", { name: /score/i }));
    // The chip now reflects the reassigned operation.
    const reassigned = within(within(tree).getAllByTestId("layer-row")[0]).getByTestId("operation-chip");
    expect(reassigned).toHaveAttribute("title", expect.stringMatching(/score/i));
  });

  it("with NOTHING selected, picking from the swatch sets the document default (not an assignment)", () => {
    // On load nothing is explicitly selected (selectedLayerIdState === null), so
    // a control-bar swatch pick must set the document DEFAULT operation for the
    // next layer — NOT reassign any existing layer.
    renderPro();
    const tree = screen.getByRole("region", { name: /object tree|layers/i });
    const topChipBefore = within(within(tree).getAllByTestId("layer-row")[0]).getByTestId("operation-chip");
    // Row chip identity via title (initial-only inline, spec §3.1).
    expect(topChipBefore).toHaveAttribute("title", expect.stringMatching(/cut/i));

    const bar = screen.getByRole("region", { name: "Contextual control bar" });
    fireEvent.click(within(bar).getByRole("button", { name: /operation/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /engrave/i }));

    // The existing top layer is UNCHANGED (still Cut) — proving it was a default-
    // set, not an assignment.
    const topChipAfter = within(within(tree).getAllByTestId("layer-row")[0]).getByTestId("operation-chip");
    expect(topChipAfter).toHaveAttribute("title", expect.stringMatching(/cut/i));
    // The control-bar swatch now reflects the new document default (Engrave).
    expect(
      within(screen.getByRole("region", { name: "Contextual control bar" })).getByRole("button", {
        name: /operation: engrave/i,
      })
    ).toBeInTheDocument();
  });

  it("the row-chip reassignment is undoable via the operations history", () => {
    renderPro();
    const tree = screen.getByRole("region", { name: /object tree|layers/i });
    const chip0 = within(within(tree).getAllByTestId("layer-row")[0]).getByTestId("operation-chip");
    fireEvent.click(chip0);
    fireEvent.click(screen.getByRole("menuitem", { name: /engrave/i }));
    expect(
      within(within(tree).getAllByTestId("layer-row")[0]).getByTestId("operation-chip")
    ).toHaveAttribute("title", expect.stringMatching(/engrave/i));

    // Undo (Ctrl+Z) reverts the assignment back to Cut.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(
      within(within(tree).getAllByTestId("layer-row")[0]).getByTestId("operation-chip")
    ).toHaveAttribute("title", expect.stringMatching(/cut/i));
  });
});
