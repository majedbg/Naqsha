// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PanelHeader from "./PanelHeader";

// P5 (panel-row redesign §8): PanelHeader folds every per-panel action into a
// single "⋯" options menu (RowMenu) and DROPS the standalone trash button.
// Tested in isolation here, mirroring panels.js' createPanel shape via makePanel.
//
// Selector rule: panel names are NOT unique — never query per-panel controls by
// name. The ⋯ trigger uses the static aria-label "Panel options"; the row
// wrapper carries data-testid="panel-header".

function makePanel(overrides = {}) {
  return {
    id: "panel-1-abc123",
    name: "Panel 1",
    substrate: { kind: "acrylic", thickness: 3, color: "#cccccc" },
    visible: true,
    order: 0,
    ...overrides,
  };
}

// Open the ⋯ menu and return the RowMenu element for scoped queries.
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Panel options" }));
  return screen.getByRole("menu");
}

describe("PanelHeader (P5 — ⋯ options menu, trash removed)", () => {
  // Slice 1
  it("renders a ⋯ options button and NO standalone delete/trash button", () => {
    render(<PanelHeader panel={makePanel()} />);
    expect(
      screen.getByRole("button", { name: "Panel options" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete panel" })
    ).not.toBeInTheDocument();
  });

  // Slice 2
  it("opens a menu of exactly Rename · Duplicate · Clear all layers · Delete (no Download; Delete danger-styled)", () => {
    render(<PanelHeader panel={makePanel()} />);
    const menu = openMenu();
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Rename",
      "Duplicate",
      "Clear all layers",
      "Delete",
    ]);
    // No Download item (PanelHeader never passes onDownload).
    expect(
      within(menu).queryByRole("menuitem", { name: /download/i })
    ).not.toBeInTheDocument();
    // Delete is the sole destructive item.
    const del = within(menu).getByRole("menuitem", { name: /delete/i });
    expect(del.className).toMatch(/text-tone-strong/);
  });

  // Slice 3
  it("Rename menu item enters the inline rename edit mode (name input appears)", () => {
    render(<PanelHeader panel={makePanel()} />);
    expect(screen.queryByRole("textbox", { name: "Panel name" })).toBeNull();
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /rename/i }));
    expect(
      screen.getByRole("textbox", { name: "Panel name" })
    ).toBeInTheDocument();
  });

  // Slice 4
  it("Duplicate menu item calls onDuplicatePanel(panel.id) when canDuplicate", () => {
    const onDuplicatePanel = vi.fn();
    const panel = makePanel();
    render(
      <PanelHeader
        panel={panel}
        canDuplicate
        onDuplicatePanel={onDuplicatePanel}
      />
    );
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /duplicate/i }));
    expect(onDuplicatePanel).toHaveBeenCalledTimes(1);
    expect(onDuplicatePanel).toHaveBeenCalledWith(panel.id);
  });

  it("Duplicate is a no-op when canDuplicate is false (onDuplicatePanel NOT called)", () => {
    const onDuplicatePanel = vi.fn();
    render(
      <PanelHeader
        panel={makePanel()}
        canDuplicate={false}
        onDuplicatePanel={onDuplicatePanel}
      />
    );
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /duplicate/i }));
    expect(onDuplicatePanel).not.toHaveBeenCalled();
  });

  // Slice 5
  it("Clear all layers opens a danger confirm; confirm calls onClearPanelLayers(panel.id)", () => {
    const onClearPanelLayers = vi.fn();
    const panel = makePanel();
    render(
      <PanelHeader
        panel={panel}
        canClearLayers
        onClearPanelLayers={onClearPanelLayers}
      />
    );
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: /clear all layers/i })
    );
    const dialog = screen.getByRole("alertdialog");
    // Danger styling on the confirm action.
    const confirm = within(dialog).getByRole("button", { name: "Clear" });
    expect(confirm.className).toMatch(/bg-tone-strong/);
    // No "delete layers too?" checkbox on the clear dialog.
    expect(
      within(dialog).queryByRole("checkbox", {
        name: /delete the layers on this panel too/i,
      })
    ).toBeNull();
    fireEvent.click(confirm);
    expect(onClearPanelLayers).toHaveBeenCalledTimes(1);
    expect(onClearPanelLayers).toHaveBeenCalledWith(panel.id);
  });

  it("Clear all layers cancel does NOT call onClearPanelLayers", () => {
    const onClearPanelLayers = vi.fn();
    render(
      <PanelHeader
        panel={makePanel()}
        canClearLayers
        onClearPanelLayers={onClearPanelLayers}
      />
    );
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: /clear all layers/i })
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      })
    );
    expect(onClearPanelLayers).not.toHaveBeenCalled();
  });

  it("Clear all layers is aria-disabled when canClearLayers is false; clicking opens no dialog and fires no callback", () => {
    const onClearPanelLayers = vi.fn();
    render(
      <PanelHeader
        panel={makePanel()}
        canClearLayers={false}
        onClearPanelLayers={onClearPanelLayers}
      />
    );
    const menu = openMenu();
    const item = within(menu).getByRole("menuitem", {
      name: /clear all layers/i,
    });
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onClearPanelLayers).not.toHaveBeenCalled();
  });

  // Slice 6
  it("Delete opens the existing delete confirm; confirm passes { deleteLayers } from the checkbox", () => {
    const onDeletePanel = vi.fn();
    const panel = makePanel();
    render(
      <PanelHeader panel={panel} canDelete onDeletePanel={onDeletePanel} />
    );
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /delete/i }));
    const dialog = screen.getByRole("alertdialog");
    // The "delete layers too?" checkbox is present and defaults unchecked.
    const checkbox = within(dialog).getByRole("checkbox", {
      name: /delete the layers on this panel too/i,
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDeletePanel).toHaveBeenCalledTimes(1);
    expect(onDeletePanel).toHaveBeenCalledWith(panel.id, { deleteLayers: true });
  });

  it("Delete is a no-op when canDelete is false (no dialog, onDeletePanel NOT called)", () => {
    const onDeletePanel = vi.fn();
    render(
      <PanelHeader
        panel={makePanel()}
        canDelete={false}
        onDeletePanel={onDeletePanel}
      />
    );
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: /delete/i }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onDeletePanel).not.toHaveBeenCalled();
  });

  // Regression — preserved behaviors (eye, chip, substrate editor, drop target)
  it("eye toggle flips visibility via onUpdatePanel", () => {
    const onUpdatePanel = vi.fn();
    const panel = makePanel({ visible: true });
    render(<PanelHeader panel={panel} onUpdatePanel={onUpdatePanel} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide panel" }));
    expect(onUpdatePanel).toHaveBeenCalledWith(panel.id, { visible: false });
  });

  it("substrate chip toggles the editor via onToggleEditor", () => {
    const onToggleEditor = vi.fn();
    const panel = makePanel();
    render(
      <PanelHeader panel={panel} onToggleEditor={onToggleEditor} />
    );
    // The chip shows the substrate summary "acrylic · 3mm".
    fireEvent.click(screen.getByText(/acrylic · 3mm/i));
    expect(onToggleEditor).toHaveBeenCalledWith(panel.id);
  });

  it("renders the substrate editor fields when editorOpen and reveals the label input for 'other'", () => {
    const onUpdatePanel = vi.fn();
    const panel = makePanel({
      substrate: { kind: "other", thickness: 2, color: "#abcdef", label: "felt" },
    });
    render(
      <PanelHeader panel={panel} editorOpen onUpdatePanel={onUpdatePanel} />
    );
    expect(screen.getByLabelText("Substrate kind")).toBeInTheDocument();
    expect(screen.getByLabelText("Substrate thickness")).toBeInTheDocument();
    expect(screen.getByLabelText("Substrate color")).toBeInTheDocument();
    // 'other' kind reveals the free-text label field.
    expect(screen.getByLabelText("Substrate label")).toBeInTheDocument();
  });

  it("is a drop target — dropping a layer id assigns it to this panel", () => {
    const onAssignLayerToPanel = vi.fn();
    const panel = makePanel();
    render(
      <PanelHeader panel={panel} onAssignLayerToPanel={onAssignLayerToPanel} />
    );
    const row = screen.getByTestId("panel-header");
    fireEvent.drop(row, {
      dataTransfer: { getData: () => "layer-xyz" },
    });
    expect(onAssignLayerToPanel).toHaveBeenCalledWith("layer-xyz", panel.id);
  });
});
