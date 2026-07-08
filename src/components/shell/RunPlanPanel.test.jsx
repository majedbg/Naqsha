// @vitest-environment jsdom
//
// Wave-3 UI Lane F (Run Plan, PRD #73). RunPlanPanel is the presentational
// pre-flight face: it shows what the machine will do — the machine-qualified
// title, the Sheet + Bed line, the estimated run time, the per-Operation
// breakdown in execution order, the moved-in Optimize stack, warnings, and the
// single saffron "Export run" action. It talks ONLY via props/callbacks; Lane I
// (Studio) conforms to this contract.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import RunPlanPanel from "./RunPlanPanel";

const OPTIMIZATIONS = {
  simplify: { enabled: false, tolerance: 0.3, appliedTolerance: null },
  merge: { enabled: false, tolerance: 0.5, appliedTolerance: null },
  reorder: { enabled: false },
};

function makeRunPlan(overrides = {}) {
  return {
    opRows: [
      { opId: "op-cut", name: "Cut", process: "cut", color: "#c81e1e", layerCount: 2, drawMm: 1240, travelMm: 300, passes: 1, sec: 90 },
      { opId: "op-score", name: "Score", process: "score", color: "#1e40c8", layerCount: 1, drawMm: 600, travelMm: 150, passes: 1, sec: 30 },
      { opId: "op-engrave", name: "Engrave", process: "engrave", color: "#556b2f", layerCount: 1, drawMm: 2000, travelMm: 80, passes: 2, sec: 120 },
    ],
    estimate: { totalSec: 240, perOp: [], penSwaps: 1 },
    warnings: [
      { type: "sheet-exceeds-bed", locate: { sheetRect: { w: 300 }, bedSize: { w: 200 } } },
      { type: "cropped-paths", count: 3, locate: { paths: [1, 2, 3] } },
    ],
    route: [],
    crops: [],
    ...overrides,
  };
}

function renderPanel(extra = {}) {
  const props = {
    runPlan: makeRunPlan(),
    profileLabel: "Laser cutting",
    sheetLine: "Sheet 200 × 300 mm · Bed 300 × 400 mm",
    onLocate: vi.fn(),
    optimizations: OPTIMIZATIONS,
    onUpdateOptimization: vi.fn(),
    onApplyOptimization: vi.fn(),
    onRevertOptimization: vi.fn(),
    optimizeDeltas: { travelBeforeM: 12.4, travelAfterM: 3.1, timeBeforeSec: 240, timeAfterSec: 180 },
    onExportRun: vi.fn(),
    onClose: vi.fn(),
    ...extra,
  };
  const utils = render(<RunPlanPanel {...props} />);
  return { ...utils, props };
}

describe("RunPlanPanel (Run Plan pre-flight face, PRD #73)", () => {
  it("titles the plan with the active Machine Profile", () => {
    renderPanel();
    expect(screen.getByText("Run Plan: Laser cutting")).toBeInTheDocument();
  });

  it("shows the Sheet + Bed line", () => {
    renderPanel();
    expect(
      screen.getByText("Sheet 200 × 300 mm · Bed 300 × 400 mm")
    ).toBeInTheDocument();
  });

  it("renders the per-Operation rows in execution order", () => {
    renderPanel();
    const rows = screen.getAllByTestId("run-plan-op-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText("Cut")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Score")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Engrave")).toBeInTheDocument();
  });

  it("shows the headline estimate 'Estimated · N min' from estimate.totalSec", () => {
    renderPanel();
    // 240s → round(240/60) = 4 min.
    expect(screen.getByText("Estimated · 4 min")).toBeInTheDocument();
  });

  it("updates the headline when a new runPlan arrives with a different totalSec (operation speed change)", () => {
    const { rerender, props } = renderPanel();
    expect(screen.getByText("Estimated · 4 min")).toBeInTheDocument();
    // Simulate the maker slowing an operation → the model recomputes a longer run.
    rerender(
      <RunPlanPanel
        {...props}
        runPlan={makeRunPlan({ estimate: { totalSec: 330, perOp: [], penSwaps: 1 } })}
      />
    );
    // 330s → round(330/60) = 6 min (5.5 rounds to 6).
    expect(screen.getByText("Estimated · 6 min")).toBeInTheDocument();
    expect(screen.queryByText("Estimated · 4 min")).not.toBeInTheDocument();
  });

  it("clicking an Operation row calls onLocate with that operation's opId", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getAllByTestId("run-plan-op-row")[1]);
    expect(props.onLocate).toHaveBeenCalledWith({ opId: "op-score" });
  });

  it("clicking a warning row calls onLocate with that warning's locate", () => {
    const { props } = renderPanel();
    const warnings = screen.getAllByTestId("run-plan-warning");
    fireEvent.click(warnings[0]);
    expect(props.onLocate).toHaveBeenCalledWith(props.runPlan.warnings[0].locate);
  });

  it("shows the live Optimize travel + time deltas from optimizeDeltas", () => {
    renderPanel();
    expect(screen.getByText(/Travel 12\.4 m → 3\.1 m/)).toBeInTheDocument();
    // 240s → 4:00, 180s → 3:00.
    expect(screen.getByText(/Time 4:00 → 3:00/)).toBeInTheDocument();
  });

  it("Apply on an optimize row routes through onApplyOptimization(key)", () => {
    const { props } = renderPanel();
    const row = screen.getByTestId("optimize-row-merge");
    fireEvent.click(within(row).getByRole("button", { name: /apply/i }));
    expect(props.onApplyOptimization).toHaveBeenCalledWith("merge");
  });

  it("closes through the panel's own Close affordance (onClose)", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /close run plan/i }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("exports the run through the primary Export run action", () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /export run/i }));
    expect(props.onExportRun).toHaveBeenCalledTimes(1);
  });

  it("uses saffron on exactly one element — the Export run action", () => {
    const { container } = renderPanel();
    const saffron = container.querySelectorAll('[class*="saffron"]');
    expect(saffron).toHaveLength(1);
    expect(saffron[0]).toHaveTextContent(/export run/i);
  });
});
