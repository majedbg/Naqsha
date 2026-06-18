// @vitest-environment jsdom
// Slider unit-aware readout/entry (issue #13, Plan B).
//
// The slider stays a PX-space control: its native range input min/max/step/value
// remain px (so snapping, arrow keys and the geometry that consumes `value` are
// byte-identical to today). The optional `unit` prop ONLY changes how the value
// readout is formatted and how typed entry is parsed back to px.
//
// Default (no unit / "px") behaviour must be unchanged — covered by the existing
// Slider tests; here we assert the unit-aware overlay.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Slider from "./Slider";
import { PX_PER_MM } from "../../lib/units";

describe("Slider unit-aware display/entry", () => {
  it("displays the value in mm when unit='mm' (px stays on the range input)", () => {
    // 96px = 96 / PX_PER_MM mm. The native range input keeps the px value.
    render(
      <Slider label="Pen Offset" value={96} min={10} max={600} step={1} unit="mm" onChange={() => {}} />
    );
    // Range input still carries the px value (geometry contract).
    expect(screen.getByRole("slider", { name: "Pen Offset" })).toHaveValue("96");
    // Readout shows mm.
    const mm = 96 / PX_PER_MM; // ~25.4
    expect(
      screen.getByRole("button", { name: /Pen Offset:.*click to edit/ })
    ).toHaveTextContent(mm.toFixed(1));
  });

  it("converts typed mm entry back to px before calling onChange", () => {
    const onChange = vi.fn();
    render(
      <Slider label="Amplitude" value={96} min={5} max={500} step={1} unit="mm" onChange={onChange} />
    );
    // Open the editor and type a mm value.
    fireEvent.click(screen.getByRole("button", { name: /Amplitude:.*click to edit/ }));
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "10" } }); // 10 mm
    fireEvent.keyDown(input, { key: "Enter" });

    // 10 mm -> px, snapped to the px step (1). PX_PER_MM ~3.7795 -> ~37.795 -> 38.
    expect(onChange).toHaveBeenCalled();
    const got = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(got).toBeCloseTo(Math.round(10 * PX_PER_MM), 6);
  });

  it("with no unit prop behaves as a raw px slider (legacy / untagged)", () => {
    render(
      <Slider label="Revolutions" value={12} min={1} max={40} step={1} onChange={() => {}} />
    );
    expect(screen.getByRole("slider", { name: "Revolutions" })).toHaveValue("12");
    // Raw readout is the px number itself.
    expect(
      screen.getByRole("button", { name: /Revolutions:.*click to edit/ })
    ).toHaveTextContent("12");
  });
});
