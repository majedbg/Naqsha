// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ToolStrip from "./ToolStrip";

// Issue #9 (Lane B / B6): the left vertical tool strip. Driven by the tool
// registry / active-tool state; renders Select / Text / Hand / Zoom and a
// fill/stroke (operation) chip at the base. NO freehand drawing tools.

describe("ToolStrip (B6 — tool buttons + operation chip)", () => {
  it("renders a button for each of select / text / hand / zoom", () => {
    render(<ToolStrip activeTool="select" onToolChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /select/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /text/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hand|pan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom/i })).toBeInTheDocument();
  });

  it("marks the active tool as pressed", () => {
    render(<ToolStrip activeTool="text" onToolChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /text/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /select/i })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("invokes onToolChange with the tool id when a tool is clicked", () => {
    const onToolChange = vi.fn();
    render(<ToolStrip activeTool="select" onToolChange={onToolChange} />);
    fireEvent.click(screen.getByRole("button", { name: /text/i }));
    expect(onToolChange).toHaveBeenCalledWith("text");
  });

  it("renders the fill/stroke operation chip at the base", () => {
    render(<ToolStrip activeTool="select" onToolChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /operation|stroke|fill/i })
    ).toBeInTheDocument();
  });

  it("does not render any freehand drawing tool", () => {
    render(<ToolStrip activeTool="select" onToolChange={vi.fn()} />);
    for (const banned of [/pen/i, /pencil/i, /brush/i, /freehand/i]) {
      expect(screen.queryByRole("button", { name: banned })).not.toBeInTheDocument();
    }
  });
});
