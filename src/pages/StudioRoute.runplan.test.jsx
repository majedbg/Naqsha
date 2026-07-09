// @vitest-environment jsdom
//
// Wave-3 Lane I (Run Plan, PRD #73) — the Studio wiring. The plan is the
// pre-flight destination: opening it MORPHS the right column (RunPlanPanel
// REPLACES the Inspector in the same slot) and the canvas (the machine view),
// both fed by the ONE runPlanModel. These integration tests drive the REAL
// Studio + shell (only the p5 RightPanel + auth are stubbed), open the plan from
// its entries, and assert the morph, the two-way locate, the live pedagogical
// recompute, and the exit.
//
// jsdom is required: runPlanModel's extraction (buildPlottableLayers) needs
// DOMParser. The stubbed RightPanel populates patternInstancesRef with a minimal
// fake instance per layer so the model resolves real op rows.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StudioRoute from "./StudioRoute";

// A polyline fully inside a generous Sheet — mirrors the shape wrapSVGSymmetry
// emits (layer <g> → per-copy <g transform> → <path>), so the extraction yields
// real geometry and the model produces non-empty op rows.
const INSIDE_GROUP =
  '<g id="L"><g transform="translate(0,0)"><path d="M0,0 L40,0 L40,40" stroke="#000"/></g></g>';

vi.mock("../components/RightPanel", () => ({
  // Populate the pattern-instance ref the plan model reads. Done on every render
  // (idempotent) so it is present the moment the plan opens and recomputes.
  default: ({ layers, patternInstancesRef }) => {
    if (patternInstancesRef && Array.isArray(layers)) {
      const map = {};
      for (const l of layers) map[l.id] = { toSVGGroup: () => INSIDE_GROUP };
      patternInstancesRef.current = map;
    }
    return <div data-testid="canvas-surface">canvas</div>;
  },
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ loading: false, user: null, tier: "guest", signIn: vi.fn() }),
  AuthProvider: ({ children }) => children,
}));

function renderStudio() {
  return render(
    <MemoryRouter>
      <StudioRoute />
    </MemoryRouter>
  );
}

const openPlanViaStatusBar = () =>
  fireEvent.click(screen.getByRole("button", { name: "Active bed" }));

beforeEach(() => {
  localStorage.clear();
});

describe("StudioRoute — Run Plan morph + entries (Lane I)", () => {
  it("opening the plan replaces the Inspector with the Run Plan panel; closing restores it", () => {
    renderStudio();
    // Design surface first: the Inspector params live in the Inspector region.
    const inspectorRegion = screen.getByRole("region", { name: "Inspector" });
    expect(within(inspectorRegion).getByTestId("inspector-params")).toBeInTheDocument();
    expect(screen.queryByTestId("run-plan-panel")).not.toBeInTheDocument();

    // Open the plan from the status-bar machine cluster → the RunPlanPanel takes
    // over the SAME slot, and the Inspector is gone.
    openPlanViaStatusBar();
    expect(within(inspectorRegion).getByTestId("run-plan-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("inspector-params")).not.toBeInTheDocument();
    // The machine-qualified title uses the CONTEXT.md fabrication phrasing.
    expect(screen.getByText(/Run Plan: (Pen plotting|Laser cutting|Drag cutting)/)).toBeInTheDocument();

    // The panel's own ✕ ("Close Run Plan") restores the design surface.
    fireEvent.click(screen.getByRole("button", { name: /close run plan/i }));
    expect(within(inspectorRegion).getByTestId("inspector-params")).toBeInTheDocument();
    expect(screen.queryByTestId("run-plan-panel")).not.toBeInTheDocument();
  });

  it("⇧⌘E opens the Run Plan from anywhere", () => {
    renderStudio();
    expect(screen.queryByTestId("run-plan-panel")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "e", metaKey: true, shiftKey: true });
    expect(screen.getByTestId("run-plan-panel")).toBeInTheDocument();
  });

  it("clicking an Operation row locates its Operation (two-way locate)", () => {
    renderStudio();
    openPlanViaStatusBar();
    const rows = screen.getAllByTestId("run-plan-op-row");
    expect(rows.length).toBeGreaterThan(0);
    fireEvent.click(rows[0]);
    // The shared highlight target is surfaced as a data hook on the studio root
    // (the committed panel/overlay expose no highlight-IN prop). It names the
    // located Operation.
    const located = document.querySelector("[data-run-plan-locate]");
    expect(located).not.toBeNull();
    expect(located.getAttribute("data-run-plan-locate")).toMatch(/"opId":"op-/);
  });

  it("keeps the live pedagogical path: changing an Operation's speed updates the estimate", () => {
    renderStudio();
    // Switch to the laser so operations expose a speed parameter to edit.
    const objectTree = screen.getByRole("region", { name: "Object tree" });
    fireEvent.change(within(objectTree).getByLabelText(/machine profile/i), {
      target: { value: "laser" },
    });

    openPlanViaStatusBar();
    const panel = screen.getByTestId("run-plan-panel");
    const before = panel.textContent;

    // Drive a large speed change through the (still-mounted) Operations panel;
    // the plan recomputes from the SAME runPlanModel, so its numbers move live.
    const speed = screen.getByLabelText(/cut speed/i);
    fireEvent.change(speed, { target: { value: "5" } });

    expect(screen.getByTestId("run-plan-panel").textContent).not.toBe(before);
  });
});
