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
import { useState } from "react";
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
    // A laser run never pays Pen Swaps (runEstimate: plotter only) — keep the
    // default fixture honest so laser assertions mean what they say.
    estimate: { totalSec: 240, perOp: [], penSwaps: 0 },
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

  it("annotates an Etch-bearing engrave row with 'raster · N DPI' (S8, #87)", () => {
    // runPlanModel tags an engrave opRow that carries an Etch with a `raster`
    // annotation; the panel must render it so the maker sees the est is a scan.
    renderPanel({
      runPlan: makeRunPlan({
        opRows: [
          { opId: "op-engrave", name: "Engrave", process: "engrave", color: "#000",
            layerCount: 1, drawMm: 0, travelMm: 0, passes: 1, sec: 1002,
            raster: { dpi: 254, layerCount: 1, sec: 1002 } },
        ],
      }),
    });
    const note = screen.getByTestId("run-plan-raster-note");
    expect(note).toHaveTextContent("raster 254 DPI");
  });

  it("does NOT show a raster note on a plain vector row", () => {
    renderPanel();
    expect(screen.queryByTestId("run-plan-raster-note")).not.toBeInTheDocument();
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
    // 240s → 4 min, 180s → 3 min. "Estimated" spelled out (principle 7 — a
    // projection, not a promise), matching the headline's convention.
    expect(screen.getByTestId("optimize-deltas")).toHaveTextContent(
      "Travel 12.4 m → 3.1 m · Estimated 4 → 3 min"
    );
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

// ---------------------------------------------------------------------------
// Two-way locate highlight (PRD story 25). Clicking a row paints a calm violet
// ring on it (a painted cell, not a glow); locating FROM the canvas arrives as
// the `locate` prop and rings the matching row. Ephemeral: the next click
// (same row = toggle off) or Esc clears it and reports null out, so the shared
// state agrees in both directions.
// ---------------------------------------------------------------------------
describe("RunPlanPanel — two-way locate highlight", () => {
  it("clicking an Operation row paints the violet locate ring on that row", () => {
    renderPanel();
    const rows = screen.getAllByTestId("run-plan-op-row");
    fireEvent.click(rows[1]);
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(rows[1].className).toMatch(/violet/);
    expect(rows[0]).not.toHaveAttribute("aria-current");
    expect(rows[2]).not.toHaveAttribute("aria-current");
  });

  it("locating from the canvas (locate prop) rings the matching row", () => {
    renderPanel({ locate: { opId: "op-score" } });
    const rows = screen.getAllByTestId("run-plan-op-row");
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(rows[0]).not.toHaveAttribute("aria-current");
  });

  it("is ephemeral — clicking the located row again clears it and reports null", () => {
    const { props } = renderPanel();
    const rows = screen.getAllByTestId("run-plan-op-row");
    fireEvent.click(rows[1]);
    fireEvent.click(rows[1]);
    expect(rows[1]).not.toHaveAttribute("aria-current");
    expect(props.onLocate).toHaveBeenLastCalledWith(null);
  });

  it("Esc clears the locate ring and reports null", () => {
    const { props } = renderPanel();
    const rows = screen.getAllByTestId("run-plan-op-row");
    fireEvent.click(rows[0]);
    expect(rows[0]).toHaveAttribute("aria-current", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(rows[0]).not.toHaveAttribute("aria-current");
    expect(props.onLocate).toHaveBeenLastCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Optimize deltas — the live before→after readout. Preview values drive the
// "after" figures live (the Lane-I loop: tolerance change → onUpdateOptimization
// → recomputed optimizeDeltas prop); a fully-applied stack collapses to the
// single current figure. The harness below plays Lane I's part.
// ---------------------------------------------------------------------------
describe("RunPlanPanel — optimizeDeltas live readout", () => {
  // Fake Lane-I model: a coarser preview tolerance removes more travel.
  const fakeAfter = (tol) =>
    tol >= 1
      ? { travelAfterM: 2.0, timeAfterSec: 120 }
      : { travelAfterM: 3.1, timeAfterSec: 180 };

  function LaneIHarness() {
    const [opts, setOpts] = useState(OPTIMIZATIONS);
    const [deltas, setDeltas] = useState({
      travelBeforeM: 12.4,
      travelAfterM: 3.1,
      timeBeforeSec: 240,
      timeAfterSec: 180,
    });
    const onUpdate = (key, patch) => {
      setOpts((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
      if (typeof patch.tolerance === "number")
        setDeltas((d) => ({ ...d, ...fakeAfter(patch.tolerance) }));
    };
    const onApply = (key) => {
      setOpts((o) => ({
        ...o,
        [key]: { ...o[key], enabled: true, appliedTolerance: o[key].tolerance },
      }));
    };
    return (
      <RunPlanPanel
        runPlan={makeRunPlan()}
        profileLabel="Laser cutting"
        sheetLine="Sheet 200 × 300 mm · Bed 300 × 400 mm"
        optimizations={opts}
        optimizeDeltas={deltas}
        onUpdateOptimization={onUpdate}
        onApplyOptimization={onApply}
      />
    );
  }

  it("changing a preview tolerance drives the after figures live, and applying collapses the readout", () => {
    render(<LaneIHarness />);
    const readout = () => screen.getByTestId("optimize-deltas");
    expect(readout()).toHaveTextContent("Travel 12.4 m → 3.1 m · Estimated 4 → 3 min");

    // Preview: coarsen the simplify tolerance → the "after" figures move live.
    const simplifyRow = screen.getByTestId("optimize-row-simplify");
    fireEvent.change(within(simplifyRow).getByLabelText("Tolerance (mm)"), {
      target: { value: "1.5" },
    });
    expect(readout()).toHaveTextContent("Travel 12.4 m → 2.0 m · Estimated 4 → 2 min");

    // Apply: the readout collapses to the single current figure.
    fireEvent.click(within(simplifyRow).getByRole("button", { name: "Apply" }));
    expect(readout()).toHaveTextContent("Travel 2.0 m · Estimated 2 min");
    expect(readout().textContent).not.toContain("→");

    // Drift the tolerance after applying (stale) → the before→after returns.
    fireEvent.change(within(simplifyRow).getByLabelText("Tolerance (mm)"), {
      target: { value: "0.4" },
    });
    expect(readout()).toHaveTextContent("Travel 12.4 m → 3.1 m · Estimated 4 → 3 min");
  });

  it("collapses to the single current figure when the applied stack has no pending preview", () => {
    renderPanel({
      optimizations: {
        simplify: { enabled: true, tolerance: 0.3, appliedTolerance: 0.3 },
        merge: { enabled: false, tolerance: 0.5, appliedTolerance: null },
        reorder: { enabled: false },
      },
    });
    const readout = screen.getByTestId("optimize-deltas");
    expect(readout).toHaveTextContent("Travel 3.1 m · Estimated 3 min");
    expect(readout.textContent).not.toContain("→");
  });

  it("renders no readout at all when optimizeDeltas is absent", () => {
    renderPanel({ optimizeDeltas: undefined });
    expect(screen.queryByTestId("optimize-deltas")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pen Swap markers (user story 27). The estimate already pays PEN_SWAP_SEC per
// swap (plotter only); the breakdown shows WHERE: a quiet "Pen change" marker
// between adjacent Operation groups whose pen differs, and the swap count in
// the Operations header. Laser/drag runs have no pens → nothing renders.
// ---------------------------------------------------------------------------
describe("RunPlanPanel — Pen Swap markers (plotter)", () => {
  function plotterRunPlan() {
    return {
      opRows: [
        { opId: "op-fine", name: "Fine liner", process: "pen", color: "#26324d", layerCount: 2, drawMm: 900, travelMm: 200, passes: 1, sec: 60, penSlot: 1 },
        { opId: "op-brush", name: "Brush pen", process: "pen", color: "#b23a48", layerCount: 1, drawMm: 400, travelMm: 90, passes: 1, sec: 30, penSlot: 2 },
      ],
      estimate: { totalSec: 120, perOp: [], penSwaps: 1 },
      warnings: [],
      route: [],
      crops: [],
    };
  }

  it("a plotter plan with two pens renders one quiet Pen change marker between the groups", () => {
    renderPanel({ runPlan: plotterRunPlan(), profileLabel: "Pen plotting" });
    const markers = screen.getAllByTestId("pen-swap-marker");
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveTextContent("Pen change");
    // The marker sits BETWEEN the two Operation rows in document order.
    const rows = screen.getAllByTestId("run-plan-op-row");
    expect(
      rows[0].compareDocumentPosition(markers[0]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      markers[0].compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("shows the swap count in the Operations header when > 0", () => {
    renderPanel({ runPlan: plotterRunPlan(), profileLabel: "Pen plotting" });
    expect(screen.getByTestId("pen-swap-count")).toHaveTextContent("1 Pen Swap");
  });

  it("a laser plan renders no Pen change markers and no header count", () => {
    renderPanel(); // default laser fixture — penSwaps 0, no penSlot on rows
    expect(screen.queryAllByTestId("pen-swap-marker")).toHaveLength(0);
    expect(screen.queryByTestId("pen-swap-count")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sampled overlap warning (defensive contract with the model lane). The
// overlap checker may hit its sampling cap: `truncated` marks `count` as a
// LOWER BOUND. Render "at least N overlaps · sampled"; when the sweep was too
// dense to count anything (count 0 + truncated), say that — never "0", never
// suppressed. Absent flag → today's exact count.
// ---------------------------------------------------------------------------
describe("RunPlanPanel — sampled overlap warning", () => {
  const overlapPlan = (warning) => makeRunPlan({ warnings: [warning] });

  it("renders a truncated count as a calm lower bound", () => {
    renderPanel({
      runPlan: overlapPlan({ type: "overlaps", count: 12, truncated: true, samples: [], locate: { samples: [] } }),
    });
    expect(screen.getByTestId("run-plan-warning")).toHaveTextContent(
      "Some paths overlap. Show where. (at least 12 overlaps · sampled)"
    );
  });

  it("renders truncated count 0 as too dense to fully check — never as zero overlaps", () => {
    renderPanel({
      runPlan: overlapPlan({ type: "overlaps", count: 0, truncated: true, samples: [], locate: { samples: [] } }),
    });
    const warning = screen.getByTestId("run-plan-warning");
    expect(warning).toHaveTextContent("Paths are too dense to fully check for overlaps. Show the area.");
    expect(warning.textContent).not.toMatch(/\b0 overlaps|\(0\)/);
  });

  it("renders the exact count normally when the truncated flag is absent", () => {
    renderPanel({
      runPlan: overlapPlan({ type: "overlaps", count: 3, locate: { samples: [] } }),
    });
    expect(screen.getByTestId("run-plan-warning")).toHaveTextContent(
      "Some paths overlap. Show where. (3)"
    );
  });
});
