// @vitest-environment jsdom
//
// Inline rename (Object Tree Panel plan, spec §7). Double-clicking the name turns
// it into an <input> (text select-all on entry); Enter or blur commits a trimmed
// name via onUpdateLayer(id, { name, nameIsCustom: true }); Esc reverts; empty /
// whitespace-only reverts to the previous name. The ⋯ → Rename menu item focuses
// the same input. Single click still just selects the row (covered elsewhere).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import LayerTree from "./LayerTree";
import { seedOperations } from "../../lib/operations";

function makeLayer(id, { name } = {}) {
  return {
    id,
    name: name || id,
    patternType: "flowfield",
    params: {},
    visible: true,
    locked: false,
    operationId: "op-cut",
  };
}

function renderTree(extra = {}) {
  const props = {
    layers: [makeLayer("l1", { name: "Alpha" })],
    operations: seedOperations(),
    profileId: "laser",
    selectedLayerId: null,
    onSelectLayer: vi.fn(),
    onUpdateLayer: vi.fn(),
    onReorderLayers: vi.fn(),
    onProfileChange: vi.fn(),
    ...extra,
  };
  render(<LayerTree {...props} />);
  return props;
}

// Double-click the row's name element to enter inline edit, returning the input.
function startEdit(row, name = "Alpha") {
  fireEvent.doubleClick(within(row).getByText(name));
  return within(row).getByRole("textbox");
}

describe("LayerTree — inline rename (spec §7)", () => {
  it("double-clicking the name shows an input with the text selected", () => {
    renderTree();
    const row = screen.getByTestId("layer-row");
    const input = startEdit(row);
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Alpha");
    // Entry select-all: the whole value is selected so typing replaces it.
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("Alpha".length);
  });

  it("Enter commits a trimmed name via onUpdateLayer(id, { name, nameIsCustom:true })", () => {
    const onUpdateLayer = vi.fn();
    renderTree({ onUpdateLayer });
    const row = screen.getByTestId("layer-row");
    const input = startEdit(row);
    fireEvent.change(input, { target: { value: "  Renamed  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdateLayer).toHaveBeenCalledWith("l1", { name: "Renamed", nameIsCustom: true });
    // Input is gone after commit.
    expect(within(row).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("blur commits a trimmed name via onUpdateLayer", () => {
    const onUpdateLayer = vi.fn();
    renderTree({ onUpdateLayer });
    const row = screen.getByTestId("layer-row");
    const input = startEdit(row);
    fireEvent.change(input, { target: { value: "Beta" } });
    fireEvent.blur(input);
    expect(onUpdateLayer).toHaveBeenCalledWith("l1", { name: "Beta", nameIsCustom: true });
  });

  it("Esc reverts without calling onUpdateLayer", () => {
    const onUpdateLayer = vi.fn();
    renderTree({ onUpdateLayer });
    const row = screen.getByTestId("layer-row");
    const input = startEdit(row);
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onUpdateLayer).not.toHaveBeenCalled();
    // Reverts to the displayed name.
    expect(within(row).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(row).getByText("Alpha")).toBeInTheDocument();
  });

  it("empty / whitespace-only commit reverts to the previous name (no call)", () => {
    const onUpdateLayer = vi.fn();
    renderTree({ onUpdateLayer });
    const row = screen.getByTestId("layer-row");
    const input = startEdit(row);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdateLayer).not.toHaveBeenCalled();
    expect(within(row).getByText("Alpha")).toBeInTheDocument();
  });

  it("⋯ → Rename focuses the inline input", () => {
    renderTree();
    const row = screen.getByTestId("layer-row");
    fireEvent.click(within(row).getByRole("button", { name: "Row actions" }));
    const menu = within(row).getByTestId("row-menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Rename" }));
    const input = within(row).getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveFocus();
  });
});
