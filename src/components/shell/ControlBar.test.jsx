// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ControlBar from "./ControlBar";

// Issue #9 (Lane B / B6): the row-2 contextual control bar swaps its contents
// by the active tool / selection (decision 9):
//   Text   -> font / size / align + outline<->single-line toggle
//   Select -> align / arrange
//   nothing selected -> document quick-info

const docInfo = { canvasW: 400, canvasH: 600, unit: "mm", layerCount: 2 };

describe("ControlBar (B6 — contextual, swaps by tool)", () => {
  it("Text tool shows font / size / align controls", () => {
    render(<ControlBar activeTool="text" hasSelection={false} docInfo={docInfo} />);
    expect(screen.getByLabelText(/font/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/size/i)).toBeInTheDocument();
    // Alignment control group present.
    expect(
      screen.getByRole("group", { name: /align/i })
    ).toBeInTheDocument();
  });

  it("Text tool exposes the outline <-> single-line toggle", () => {
    render(<ControlBar activeTool="text" hasSelection={false} docInfo={docInfo} />);
    expect(
      screen.getByRole("button", { name: /outline|single.?line/i })
    ).toBeInTheDocument();
  });

  it("Select tool shows align / arrange controls (not text controls)", () => {
    render(
      <ControlBar activeTool="select" hasSelection={true} docInfo={docInfo} />
    );
    expect(screen.getByRole("group", { name: /align/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /arrange/i })).toBeInTheDocument();
    // No font selector in select mode.
    expect(screen.queryByLabelText(/font/i)).not.toBeInTheDocument();
  });

  it("nothing selected (select tool, empty selection) shows document quick-info", () => {
    render(
      <ControlBar activeTool="select" hasSelection={false} docInfo={docInfo} />
    );
    // Document quick-info reflects canvas size + unit.
    const info = screen.getByLabelText(/document|quick.?info/i);
    expect(info).toHaveTextContent(/400/);
    expect(info).toHaveTextContent(/600/);
    expect(info).toHaveTextContent(/mm/i);
  });

  it("Zoom tool shows zoom controls wired to the view", () => {
    const zoomIn = vi.fn();
    const zoomOut = vi.fn();
    const view = { zoom: 1, zoomIn, zoomOut, reset: vi.fn() };
    render(
      <ControlBar
        activeTool="zoom"
        hasSelection={false}
        docInfo={docInfo}
        view={view}
      />
    );
    const group = screen.getByRole("group", { name: /zoom/i });
    fireEvent.click(within(group).getByRole("button", { name: /zoom in/i }));
    expect(zoomIn).toHaveBeenCalledTimes(1);
    fireEvent.click(within(group).getByRole("button", { name: /zoom out/i }));
    expect(zoomOut).toHaveBeenCalledTimes(1);
    expect(within(group).getByLabelText(/reset zoom/i)).toHaveTextContent("100%");
  });

  it("Hand tool shows the pan hint (not text or align controls)", () => {
    render(<ControlBar activeTool="hand" hasSelection={true} docInfo={docInfo} />);
    expect(screen.getByLabelText(/hand/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/font/i)).not.toBeInTheDocument();
  });

  it("always renders the stroke/operation swatch", () => {
    render(<ControlBar activeTool="select" hasSelection={false} docInfo={docInfo} />);
    expect(
      screen.getByRole("button", { name: /operation|stroke|fill/i })
    ).toBeInTheDocument();
  });

  it("renders undo/redo in their own far-left History group", () => {
    render(<ControlBar activeTool="select" hasSelection={false} docInfo={docInfo} />);
    const group = screen.getByRole("group", { name: /history/i });
    expect(within(group).getByRole("button", { name: /undo/i })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: /redo/i })).toBeInTheDocument();
  });

  it("undo/redo fire their handlers when enabled", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(
      <ControlBar
        activeTool="select"
        hasSelection={false}
        docInfo={docInfo}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo
        canRedo
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /redo/i }));
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it("undo/redo are disabled (and inert) when !canUndo / !canRedo", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(
      <ControlBar
        activeTool="select"
        hasSelection={false}
        docInfo={docInfo}
        onUndo={onUndo}
        onRedo={onRedo}
        canUndo={false}
        canRedo={false}
      />
    );
    const undo = screen.getByRole("button", { name: /undo/i });
    const redo = screen.getByRole("button", { name: /redo/i });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    fireEvent.click(undo);
    fireEvent.click(redo);
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it("outline toggle flips its label/state when clicked", () => {
    render(<ControlBar activeTool="text" hasSelection={false} docInfo={docInfo} />);
    const toggle = screen.getByRole("button", { name: /outline|single.?line/i });
    const before = toggle.getAttribute("aria-pressed");
    fireEvent.click(toggle);
    // Re-query: the label changes when the mode flips, so re-resolve the button.
    const after = screen.getByRole("button", { name: /outline|single.?line/i });
    expect(after.getAttribute("aria-pressed")).not.toBe(before);
  });
});
