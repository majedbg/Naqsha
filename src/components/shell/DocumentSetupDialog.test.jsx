// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DocumentSetupDialog from "./DocumentSetupDialog";
import { getProfile } from "../../lib/machineProfiles";
import { PRESET_SIZES, PPI } from "../../constants";

// Issue #14 (Lane C / C6), reframed: the Document Setup dialog sets the
// machine PROFILE and the WORK PIECE (design canvas) size — the machine BED
// no longer lives here (it moved to the View menu). It is presentational —
// the profile + canvas size live in Studio; the dialog reads them in and
// reports changes OUT through `onApply({ profileId, canvasW, canvasH, unit })`
// so the SAME profile-change path the LayerTree selector uses stays
// single-sourced.

function makeProps(overrides = {}) {
  return {
    open: true,
    profileId: "laser",
    unit: "mm",
    canvasW: PRESET_SIZES[1].width * PPI,
    canvasH: PRESET_SIZES[1].height * PPI,
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("DocumentSetupDialog (C6 — render + work piece presets)", () => {
  it("renders nothing when closed", () => {
    render(<DocumentSetupDialog {...makeProps({ open: false })} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists the work-piece presets from PRESET_SIZES", () => {
    render(<DocumentSetupDialog {...makeProps()} />);
    const select = screen.getByLabelText(/work piece preset/i);
    for (const preset of PRESET_SIZES) {
      expect(
        within(select).getByRole("option", { name: preset.label })
      ).toBeInTheDocument();
    }
  });

  it("seeds its controls from the live profile + canvas size (reopening shows current settings)", () => {
    render(
      <DocumentSetupDialog
        {...makeProps({ profileId: "plotter", canvasW: 444, canvasH: 222 })}
      />
    );
    expect(screen.getByLabelText(/machine profile/i)).toHaveValue("plotter");
    expect(screen.getByLabelText(/width/i)).toHaveValue(
      Math.round((444 / PPI) * 25.4)
    );
    expect(screen.getByLabelText(/height/i)).toHaveValue(
      Math.round((222 / PPI) * 25.4)
    );
  });

  it("Apply reports the chosen profile + work piece size (px) out through onApply", () => {
    const onApply = vi.fn();
    render(<DocumentSetupDialog {...makeProps({ onApply })} />);
    // Type a custom size in the active unit (mm here) and apply.
    fireEvent.change(screen.getByLabelText(/width/i), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(arg.profileId).toBe("laser");
    // 300mm/200mm converted to px @96 PPI.
    expect(arg.canvasW).toBeCloseTo((300 / 25.4) * PPI, 0);
    expect(arg.canvasH).toBeCloseTo((200 / 25.4) * PPI, 0);
    expect(arg.unit).toBe("mm");
  });

  it("selecting a preset fills the custom dims and applies them (px)", () => {
    const onApply = vi.fn();
    render(<DocumentSetupDialog {...makeProps({ onApply })} />);
    // Pick a non-custom named preset — robust to the exact preset list order.
    const presetIndex = 2;
    const preset = PRESET_SIZES[presetIndex];
    fireEvent.change(screen.getByLabelText(/work piece preset/i), {
      target: { value: String(presetIndex) },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    const arg = onApply.mock.calls[0][0];
    // Round-trips through the mm display unit (integer mm), so allow a few px
    // of rounding slack rather than requiring bit-exact px.
    expect(Math.abs(arg.canvasW - preset.width * PPI)).toBeLessThan(5);
    expect(Math.abs(arg.canvasH - preset.height * PPI)).toBeLessThan(5);
  });

  it("toggling to inches converts the displayed dims; Apply still emits px", () => {
    const onApply = vi.fn();
    // 254mm = 10in, 127mm = 5in — clean round-trip values, expressed in px.
    const canvasW = (254 / 25.4) * PPI;
    const canvasH = (127 / 25.4) * PPI;
    render(
      <DocumentSetupDialog
        {...makeProps({ profileId: "laser", canvasW, canvasH, unit: "mm", onApply })}
      />
    );
    // Seeded in mm.
    expect(screen.getByLabelText(/width/i)).toHaveValue(254);
    expect(screen.getByLabelText(/height/i)).toHaveValue(127);
    // Toggle to inches — the same physical size now shows in inches.
    fireEvent.click(screen.getByRole("button", { name: "in" }));
    expect(screen.getByLabelText(/width/i)).toHaveValue(10);
    expect(screen.getByLabelText(/height/i)).toHaveValue(5);
    // Apply: size comes back in canonical px, and the chosen unit rides along.
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    const arg = onApply.mock.calls[0][0];
    expect(arg.unit).toBe("in");
    expect(arg.canvasW).toBeCloseTo(canvasW, 0);
    expect(arg.canvasH).toBeCloseTo(canvasH, 0);
  });

  it("profile label appears for each profile option", () => {
    render(<DocumentSetupDialog {...makeProps()} />);
    const machineSelect = screen.getByLabelText(/machine profile/i);
    expect(
      within(machineSelect).getByRole("option", { name: getProfile("laser").label })
    ).toBeInTheDocument();
    expect(
      within(machineSelect).getByRole("option", { name: getProfile("plotter").label })
    ).toBeInTheDocument();
  });
});
