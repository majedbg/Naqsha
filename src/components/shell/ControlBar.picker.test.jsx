// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ControlBar from "./ControlBar";
import { seedOperations } from "../../lib/operations";

// Issue #11 (Lane C / C2): the control-bar stroke/operation swatch opens the
// operation picker; the swatch reflects the current operation's color; picking
// an operation routes through onAssignOperation.

const docInfo = { canvasW: 400, canvasH: 600, unit: "mm", layerCount: 2 };

describe("ControlBar — operation swatch → picker (C2)", () => {
  // (a) RENDER — the swatch shows the current operation's color.
  it("renders the swatch in the operation's color", () => {
    const operations = seedOperations();
    const operation = operations.find((o) => o.id === "op-score"); // blue
    render(
      <ControlBar
        activeTool="select"
        hasSelection
        docInfo={docInfo}
        operation={operation}
        operations={operations}
        onAssignOperation={() => {}}
      />
    );
    const swatch = screen.getByRole("button", { name: /operation/i });
    expect(swatch.querySelector("[data-op-color]")).toHaveStyle({
      backgroundColor: "#0000FF",
    });
  });

  // (b) INTERACTION — clicking opens the operation picker (list, not a wheel).
  it("clicking the swatch opens the operation picker (not a color wheel)", () => {
    const operations = seedOperations();
    const { container } = render(
      <ControlBar
        activeTool="select"
        hasSelection
        docInfo={docInfo}
        operation={operations[0]}
        operations={operations}
        onAssignOperation={() => {}}
      />
    );
    expect(screen.queryByRole("menu", { name: /operation/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /operation/i }));
    const menu = screen.getByRole("menu", { name: /operation/i });
    expect(within(menu).getByRole("menuitem", { name: /score/i })).toBeInTheDocument();
    expect(container.querySelector('input[type="color"]')).toBeNull();
  });

  // (c) INTERACTION — picking an operation calls onAssignOperation(operationId).
  it("picking an operation calls onAssignOperation with its id", () => {
    const operations = seedOperations();
    const onAssignOperation = vi.fn();
    render(
      <ControlBar
        activeTool="select"
        hasSelection
        docInfo={docInfo}
        operation={operations[0]}
        operations={operations}
        onAssignOperation={onAssignOperation}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /operation/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /engrave/i }));
    expect(onAssignOperation).toHaveBeenCalledWith("op-engrave");
  });

  // Backward-compat: bare render (no operations/onAssign) still shows the swatch.
  it("still renders the swatch with no operation/operations props (bare)", () => {
    render(<ControlBar activeTool="select" hasSelection={false} docInfo={docInfo} />);
    expect(screen.getByRole("button", { name: /operation|stroke|fill/i })).toBeInTheDocument();
  });
});
