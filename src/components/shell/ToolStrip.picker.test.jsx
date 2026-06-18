// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ToolStrip from "./ToolStrip";
import { seedOperations } from "../../lib/operations";

// Issue #11 (Lane C / C2): the tool-strip base operation chip opens the SAME
// operation picker as the control-bar swatch and routes picks through
// onAssignOperation.

describe("ToolStrip — operation chip → picker (C2)", () => {
  it("renders the chip in the current operation's color", () => {
    const operations = seedOperations();
    render(
      <ToolStrip
        activeTool="select"
        onToolChange={vi.fn()}
        operation={operations.find((o) => o.id === "op-score")}
        operations={operations}
        onAssignOperation={() => {}}
      />
    );
    const chip = screen.getByRole("button", { name: /operation/i });
    expect(chip.querySelector("[data-op-color]")).toHaveStyle({ backgroundColor: "#0000FF" });
  });

  it("clicking the chip opens the operation picker (not a color wheel)", () => {
    const operations = seedOperations();
    const { container } = render(
      <ToolStrip
        activeTool="select"
        onToolChange={vi.fn()}
        operation={operations[0]}
        operations={operations}
        onAssignOperation={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /operation/i }));
    const menu = screen.getByRole("menu", { name: /operation/i });
    expect(within(menu).getByRole("menuitem", { name: /cut/i })).toBeInTheDocument();
    expect(container.querySelector('input[type="color"]')).toBeNull();
  });

  it("picking an operation calls onAssignOperation with its id", () => {
    const operations = seedOperations();
    const onAssignOperation = vi.fn();
    render(
      <ToolStrip
        activeTool="select"
        onToolChange={vi.fn()}
        operation={operations[0]}
        operations={operations}
        onAssignOperation={onAssignOperation}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /operation/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /score/i }));
    expect(onAssignOperation).toHaveBeenCalledWith("op-score");
  });

  it("still renders the chip with no operation props (bare)", () => {
    render(<ToolStrip activeTool="select" onToolChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /operation|stroke|fill/i })).toBeInTheDocument();
  });
});
