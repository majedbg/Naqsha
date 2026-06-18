// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import DocumentSetupDialog from "./DocumentSetupDialog";
import { bedPresetsFor, defaultBedSize, getProfile } from "../../lib/machineProfiles";

// Issue #14 (Lane C / C6): the Document Setup dialog sets the machine profile and
// the bed (= artboard). It is presentational — the machine profile + bed live in
// Studio; the dialog reads them in and reports changes OUT through callbacks so
// the SAME profile-change path the LayerTree selector uses stays single-sourced.

function makeProps(overrides = {}) {
  return {
    open: true,
    profileId: "laser",
    bedSize: defaultBedSize("laser"),
    unit: "mm",
    onApply: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("DocumentSetupDialog (C6 — render + presets)", () => {
  it("renders nothing when closed", () => {
    render(<DocumentSetupDialog {...makeProps({ open: false })} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists bed presets filtered to the active machine profile (laser)", () => {
    render(<DocumentSetupDialog {...makeProps({ profileId: "laser" })} />);
    const select = screen.getByLabelText(/bed preset/i);
    for (const preset of bedPresetsFor("laser")) {
      expect(
        within(select).getByRole("option", { name: preset.label })
      ).toBeInTheDocument();
    }
    // A drag-cutter-only preset must NOT appear under laser.
    const cameo = bedPresetsFor("dragCutter")[0];
    expect(
      within(select).queryByRole("option", { name: cameo.label })
    ).not.toBeInTheDocument();
  });

  it("presets change when the machine profile is switched in the dialog", () => {
    render(<DocumentSetupDialog {...makeProps({ profileId: "laser" })} />);
    const machineSelect = screen.getByLabelText(/machine profile/i);
    fireEvent.change(machineSelect, { target: { value: "dragCutter" } });
    const bedSelect = screen.getByLabelText(/bed preset/i);
    for (const preset of bedPresetsFor("dragCutter")) {
      expect(
        within(bedSelect).getByRole("option", { name: preset.label })
      ).toBeInTheDocument();
    }
  });

  it("seeds its controls from the live profile + bed (reopening shows current settings)", () => {
    const bed = { width: 444, height: 222, unit: "mm" };
    render(
      <DocumentSetupDialog {...makeProps({ profileId: "plotter", bedSize: bed })} />
    );
    expect(screen.getByLabelText(/machine profile/i)).toHaveValue("plotter");
    expect(screen.getByLabelText(/width/i)).toHaveValue(444);
    expect(screen.getByLabelText(/height/i)).toHaveValue(222);
  });

  it("Apply reports the chosen profile + bed (mm) out through onApply", () => {
    const onApply = vi.fn();
    render(<DocumentSetupDialog {...makeProps({ onApply })} />);
    // Type a custom bed in the active unit (mm here) and apply.
    fireEvent.change(screen.getByLabelText(/width/i), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText(/height/i), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const arg = onApply.mock.calls[0][0];
    expect(arg.profileId).toBe("laser");
    expect(arg.bedSize.width).toBeCloseTo(300, 0);
    expect(arg.bedSize.height).toBeCloseTo(200, 0);
    expect(arg.bedSize.unit).toBe("mm");
  });

  it("selecting a preset fills the custom dims and applies them (mm)", () => {
    const onApply = vi.fn();
    render(<DocumentSetupDialog {...makeProps({ profileId: "laser", onApply })} />);
    const preset = bedPresetsFor("laser").find((p) => p.label.includes("A4"));
    fireEvent.change(screen.getByLabelText(/bed preset/i), {
      target: { value: preset.id },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    const arg = onApply.mock.calls[0][0];
    expect(arg.bedSize.width).toBeCloseTo(preset.width, 0);
    expect(arg.bedSize.height).toBeCloseTo(preset.height, 0);
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
