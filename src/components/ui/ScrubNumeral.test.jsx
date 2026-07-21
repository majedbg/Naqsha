// @vitest-environment jsdom
// ScrubNumeral — a draggable + typeable numeric value (the Figma/Blender idiom,
// Naqsha-native: currentColor ink, no synth knobs). Drag horizontally to scrub
// at CONSTANT sensitivity (pointer capture); click (no drag) to type; a hairline
// value-fill underline reads the value's position in [min,max]. Keyboard: focus +
// ArrowUp/Down step and commit. Every committed change flows through onCommit.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ScrubNumeral from "./ScrubNumeral";

const base = {
  value: 5,
  min: 0,
  max: 12,
  step: 1,
  label: "Every Nth",
  onCommit: () => {},
};

describe("ScrubNumeral — display + a11y", () => {
  it("renders a slider role with value/min/max and the label as accessible name", () => {
    render(<ScrubNumeral {...base} />);
    const s = screen.getByRole("slider", { name: "Every Nth" });
    expect(s).toHaveAttribute("aria-valuenow", "5");
    expect(s).toHaveAttribute("aria-valuemin", "0");
    expect(s).toHaveAttribute("aria-valuemax", "12");
  });

  it("shows the formatted value when a format fn is given", () => {
    render(
      <ScrubNumeral
        {...base}
        value={0.5}
        min={0}
        max={1}
        step={0.05}
        format={(v) => v.toFixed(2)}
      />
    );
    expect(screen.getByRole("slider")).toHaveTextContent("0.50");
  });

  it("carries a focus-visible violet ring (brief) and a value-fill underline", () => {
    const { container } = render(<ScrubNumeral {...base} testId="sn" />);
    const s = screen.getByTestId("sn");
    expect(s.className).toContain("focus-visible:ring-violet");
    // The hairline fill element is proportional to (value-min)/(max-min).
    const fill = container.querySelector("[data-scrub-fill]");
    expect(fill).toBeTruthy();
  });
});

describe("ScrubNumeral — keyboard commits through onCommit", () => {
  it("ArrowUp steps up and commits (clamped to max)", () => {
    const onCommit = vi.fn();
    render(<ScrubNumeral {...base} value={11} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    fireEvent.keyDown(s, { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith(12);
    fireEvent.keyDown(s, { key: "ArrowUp" }); // already at max → stays 12
    expect(onCommit).toHaveBeenLastCalledWith(12);
  });

  it("ArrowDown steps down and commits (clamped to min)", () => {
    const onCommit = vi.fn();
    render(<ScrubNumeral {...base} value={0} onCommit={onCommit} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowDown" });
    expect(onCommit).toHaveBeenLastCalledWith(0);
  });

  it("respects a fractional step without floating-point noise", () => {
    const onCommit = vi.fn();
    render(
      <ScrubNumeral value={0.5} min={0} max={1} step={0.05} label="Density" onCommit={onCommit} />
    );
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowUp" });
    expect(onCommit).toHaveBeenLastCalledWith(0.55);
  });
});

describe("ScrubNumeral — drag to scrub (pointer capture, constant sensitivity)", () => {
  it("dragging right raises the value in step units and commits", () => {
    const onCommit = vi.fn();
    render(<ScrubNumeral {...base} value={5} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    fireEvent.pointerDown(s, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(s, { clientX: 40, pointerId: 1 });
    // Some positive stepped commit happened, clamped to max.
    expect(onCommit).toHaveBeenCalled();
    const last = onCommit.mock.calls.at(-1)[0];
    expect(last).toBeGreaterThan(5);
    expect(last).toBeLessThanOrEqual(12);
    fireEvent.pointerUp(s, { clientX: 40, pointerId: 1 });
  });

  it("a click with no movement opens a type input; Enter commits the parsed value", () => {
    const onCommit = vi.fn();
    render(<ScrubNumeral {...base} value={5} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    fireEvent.pointerDown(s, { clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(s, { clientX: 10, pointerId: 1 }); // no move → type mode
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenLastCalledWith(8);
  });

  it("typing then Escape cancels without committing", () => {
    const onCommit = vi.fn();
    render(<ScrubNumeral {...base} value={5} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    fireEvent.pointerDown(s, { clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(s, { clientX: 10, pointerId: 1 });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "8" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    // Back to the slider display.
    expect(screen.getByRole("slider")).toBeInTheDocument();
  });

  it("a typed value out of range is clamped on commit", () => {
    const onCommit = vi.fn();
    render(<ScrubNumeral {...base} value={5} onCommit={onCommit} />);
    const s = screen.getByRole("slider");
    fireEvent.pointerDown(s, { clientX: 10, pointerId: 1 });
    fireEvent.pointerUp(s, { clientX: 10, pointerId: 1 });
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenLastCalledWith(12);
  });
});
