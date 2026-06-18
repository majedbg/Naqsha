// @vitest-environment jsdom
//
// AC2 re-home (#16): the legacy Prepare tab's OptimizeSection let the user
// enable/configure the simplify / merge / reorder optimizations that flow into
// export + the plot overlay. When the two-pane layout was removed, those controls
// lost their home. OptimizeControls is the compact shell re-home — it is
// presentational and routes every mutation OUT through the surviving
// useOptimizations API (updateOptimization / applyOptimization / revertOptimization)
// so export reads the SAME applied state as before.
//
// NEW component + test (touches no existing file/test).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import OptimizeControls from "./OptimizeControls";

const INITIAL = {
  simplify: { enabled: false, tolerance: 0.3, appliedTolerance: null },
  merge: { enabled: false, tolerance: 0.5, appliedTolerance: null },
  reorder: { enabled: false },
};

function renderControls(extra = {}) {
  const props = {
    optimizations: INITIAL,
    onUpdate: vi.fn(),
    onApply: vi.fn(),
    onRevert: vi.fn(),
    ...extra,
  };
  render(<OptimizeControls {...props} />);
  return props;
}

describe("OptimizeControls — re-homed optimize controls (#16 AC2)", () => {
  it("renders a row for each optimization (simplify, merge, reorder)", () => {
    renderControls();
    expect(screen.getByTestId("optimize-row-simplify")).toBeInTheDocument();
    expect(screen.getByTestId("optimize-row-merge")).toBeInTheDocument();
    expect(screen.getByTestId("optimize-row-reorder")).toBeInTheDocument();
  });

  it("editing the simplify tolerance routes through onUpdate('simplify', { tolerance })", () => {
    const { onUpdate } = renderControls();
    const row = screen.getByTestId("optimize-row-simplify");
    fireEvent.change(within(row).getByLabelText(/tolerance/i), {
      target: { value: "0.8" },
    });
    expect(onUpdate).toHaveBeenCalledWith("simplify", { tolerance: 0.8 });
  });

  it("Apply on a row routes through onApply(key)", () => {
    const { onApply } = renderControls();
    const row = screen.getByTestId("optimize-row-merge");
    fireEvent.click(within(row).getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith("merge");
  });

  it("reorder (no slider) applies through onApply('reorder')", () => {
    const { onApply } = renderControls();
    const row = screen.getByTestId("optimize-row-reorder");
    fireEvent.click(within(row).getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledWith("reorder");
    // reorder has no tolerance slider.
    expect(within(row).queryByLabelText(/tolerance/i)).not.toBeInTheDocument();
  });

  it("an applied optimization exposes a Revert that routes through onRevert(key)", () => {
    const applied = {
      ...INITIAL,
      simplify: { enabled: true, tolerance: 0.3, appliedTolerance: 0.3 },
    };
    const { onRevert } = renderControls({ optimizations: applied });
    const row = screen.getByTestId("optimize-row-simplify");
    fireEvent.click(within(row).getByRole("button", { name: /revert/i }));
    expect(onRevert).toHaveBeenCalledWith("simplify");
  });
});
