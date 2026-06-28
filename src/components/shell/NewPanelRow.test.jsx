// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import NewPanelRow from "./NewPanelRow";
import { SUBSTRATE_PRESETS, presetLabel } from "../../lib/panels";

// P4 (panel-row redesign, spec §7): the "New panel" creation row that lives at
// the foot of the sidebar. Mirrors PanelHeader's row chrome (a panel-row look,
// NOT the old dashed CTA). Carries a material-preset <select> + a "Create panel"
// button.
//
// Interaction model (Model A): the "Create panel" BUTTON is the sole trigger.
// The <select> only sets local state; the button reads it — a chosen preset →
// onCreatePanel(substrate), the neutral option → onCreatePanel() (no arg). The
// select never fires a callback on its own.

function renderRow(props = {}) {
  return render(
    <NewPanelRow onCreatePanel={() => {}} canAdd {...props} />
  );
}

describe("NewPanelRow (P4 — panel creation row)", () => {
  it("renders a row labelled 'New panel' with a + glyph and the 'New panel' text", () => {
    renderRow();
    const row = screen.getByLabelText("New panel");
    expect(row).toBeInTheDocument();
    expect(within(row).getByText("New panel")).toBeInTheDocument();
    // The '+' glyph occupies the chevron slot — an svg with two lines.
    expect(row.querySelector("svg")).toBeInTheDocument();
  });

  it("renders a preset <select> listing the 5 presets via presetLabel plus a neutral first option", () => {
    renderRow();
    const select = screen.getByLabelText("Material preset");
    expect(select.tagName).toBe("SELECT");
    const options = within(select).getAllByRole("option");
    // 5 presets + 1 neutral (no-preset) first option.
    expect(options).toHaveLength(SUBSTRATE_PRESETS.length + 1);
    // The neutral option is first and carries an empty value.
    expect(options[0]).toHaveValue("");
    // The 5 preset options read via presetLabel ("acrylic · 3mm", …).
    SUBSTRATE_PRESETS.forEach((preset, i) => {
      expect(options[i + 1]).toHaveTextContent(presetLabel(preset));
    });
  });

  it("choosing a preset then clicking 'Create panel' calls onCreatePanel with that preset's substrate", () => {
    const onCreatePanel = vi.fn();
    renderRow({ onCreatePanel });
    // Pick the second preset (acrylic · 5mm) to prove index-keyed disambiguation.
    fireEvent.change(screen.getByLabelText("Material preset"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Create panel" }));
    expect(onCreatePanel).toHaveBeenCalledTimes(1);
    expect(onCreatePanel).toHaveBeenCalledWith(SUBSTRATE_PRESETS[1]);
  });

  it("clicking 'Create panel' with no preset selected calls onCreatePanel with no argument", () => {
    const onCreatePanel = vi.fn();
    renderRow({ onCreatePanel });
    fireEvent.click(screen.getByRole("button", { name: "Create panel" }));
    expect(onCreatePanel).toHaveBeenCalledTimes(1);
    expect(onCreatePanel).toHaveBeenCalledWith();
    expect(onCreatePanel.mock.calls[0]).toHaveLength(0);
  });

  it("canAdd={false} disables the dropdown and create action with the cap tooltip and fires no callbacks", () => {
    const onCreatePanel = vi.fn();
    renderRow({ onCreatePanel, canAdd: false });
    const select = screen.getByLabelText("Material preset");
    const button = screen.getByRole("button", { name: "Create panel" });
    expect(select).toBeDisabled();
    expect(button).toBeDisabled();
    expect(select).toHaveAttribute("title", "Max 3 panels per document");
    expect(button).toHaveAttribute("title", "Max 3 panels per document");
    // No callback on interaction attempts (button click is suppressed when
    // disabled; the create handler also guards on canAdd).
    fireEvent.click(button);
    fireEvent.change(select, { target: { value: "0" } });
    fireEvent.click(button);
    expect(onCreatePanel).not.toHaveBeenCalled();
  });
});
