// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ToolStrip from "./ToolStrip";

// Issue #9 (Lane B / B6): the left vertical tool strip. Driven by the tool
// registry / active-tool state; renders Select / Text / Hand / Zoom. NO freehand
// drawing tools, and NO operation chip (operations are assigned per-layer).

describe("ToolStrip (B6 — tool buttons)", () => {
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

  it("does not render an operation chip (operations are per-layer)", () => {
    render(<ToolStrip activeTool="select" onToolChange={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /operation|stroke|fill/i })
    ).not.toBeInTheDocument();
  });

  it("does not render any freehand drawing tool", () => {
    render(<ToolStrip activeTool="select" onToolChange={vi.fn()} />);
    for (const banned of [/pen/i, /pencil/i, /brush/i, /freehand/i]) {
      expect(screen.queryByRole("button", { name: banned })).not.toBeInTheDocument();
    }
  });
});
