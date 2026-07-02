// @vitest-environment jsdom
//
// UX reframe (#16 follow-up): the Document Setup dialog is now CONTROLLED on
// the WORK PIECE (design canvas) size — canvasW/canvasH in px @96 PPI — as
// its PRIMARY editable control. The machine BED no longer lives in this
// dialog (moved to the View menu). This file exercises the px seeding/round-
// tripping + preset-matching behavior specifically; DocumentSetupDialog.test
// covers the general render/interaction surface.
//
// NEW test file — does not touch the existing DocumentSetupDialog.test.jsx.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DocumentSetupDialog from "./DocumentSetupDialog";
import { PRESET_SIZES, PPI } from "../../constants";

function makeProps(overrides = {}) {
  return {
    open: true,
    profileId: "laser",
    unit: "mm",
    canvasW: 768,
    canvasH: 1024,
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("DocumentSetupDialog — work piece size is px-canonical (#16 follow-up)", () => {
  it("seeds the Width/Height inputs from canvasW/canvasH (px), converted to the active unit", () => {
    // 768px / 1024px @96 PPI = 8in / 10.667in = 203mm / 271mm (rounded).
    render(<DocumentSetupDialog {...makeProps({ canvasW: 768, canvasH: 1024, unit: "mm" })} />);
    expect(screen.getByLabelText(/width/i)).toHaveValue(Math.round((768 / PPI) * 25.4));
    expect(screen.getByLabelText(/height/i)).toHaveValue(Math.round((1024 / PPI) * 25.4));
  });

  it("Apply reports the edited size out through onApply as rounded canvasW/canvasH px", () => {
    const onApply = vi.fn();
    render(<DocumentSetupDialog {...makeProps({ onApply, unit: "in" })} />);
    fireEvent.change(screen.getByLabelText(/width/i), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(arg.canvasW).toBe(Math.round(9 * PPI));
    expect(arg.canvasH).toBe(Math.round(6 * PPI));
    expect(Number.isInteger(arg.canvasW)).toBe(true);
    expect(Number.isInteger(arg.canvasH)).toBe(true);
  });

  it("preselects the matching named preset when canvasW/canvasH exactly match one", () => {
    const idx = 2; // PRESET_SIZES[2] = 12x18in artwork preset
    const preset = PRESET_SIZES[idx];
    render(
      <DocumentSetupDialog
        {...makeProps({ canvasW: preset.width * PPI, canvasH: preset.height * PPI })}
      />
    );
    expect(screen.getByLabelText(/work piece preset/i)).toHaveValue(String(idx));
  });

  it("falls back to Custom when canvasW/canvasH don't match any named preset", () => {
    const customIndex = PRESET_SIZES.findIndex((p) => p.width === null);
    render(<DocumentSetupDialog {...makeProps({ canvasW: 501, canvasH: 337 })} />);
    expect(screen.getByLabelText(/work piece preset/i)).toHaveValue(String(customIndex));
  });

  it("editing Width/Height after a preset pick switches the preset selector to Custom", () => {
    const customIndex = PRESET_SIZES.findIndex((p) => p.width === null);
    const idx = 2;
    const preset = PRESET_SIZES[idx];
    render(
      <DocumentSetupDialog
        {...makeProps({ canvasW: preset.width * PPI, canvasH: preset.height * PPI })}
      />
    );
    expect(screen.getByLabelText(/work piece preset/i)).toHaveValue(String(idx));
    fireEvent.change(screen.getByLabelText(/width/i), { target: { value: "5" } });
    expect(screen.getByLabelText(/work piece preset/i)).toHaveValue(String(customIndex));
  });

  it("choosing a preset from Custom fills the Width/Height dims in the active unit", () => {
    render(<DocumentSetupDialog {...makeProps({ canvasW: 501, canvasH: 337, unit: "in" })} />);
    const idx = 3; // PRESET_SIZES[3] = 12x24in artwork preset
    const preset = PRESET_SIZES[idx];
    fireEvent.change(screen.getByLabelText(/work piece preset/i), {
      target: { value: String(idx) },
    });
    expect(screen.getByLabelText(/width/i)).toHaveValue(preset.width);
    expect(screen.getByLabelText(/height/i)).toHaveValue(preset.height);
  });
});
