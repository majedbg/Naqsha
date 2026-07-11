// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
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
  it("opens a menu of exactly Rename · Duplicate · Substrate details… · Clear all layers · Delete (no Download; Delete danger-styled)", () => {
    render(<PanelHeader panel={makePanel()} />);
    const menu = openMenu();
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "Rename",
      "Duplicate",
      "Substrate details…",
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

  it("Duplicate is disabled (aria-disabled + tooltip) and does not fire when canDuplicate is false", () => {
    const onDuplicatePanel = vi.fn();
    render(
      <PanelHeader
        panel={makePanel()}
        canDuplicate={false}
        onDuplicatePanel={onDuplicatePanel}
      />
    );
    const menu = openMenu();
    const item = within(menu).getByRole("menuitem", { name: /duplicate/i });
    expect(item).toHaveAttribute("aria-disabled", "true");
    // Default generic reason (P6 threads the precise one via duplicateDisabledReason).
    expect(item).toHaveAttribute(
      "title",
      "Can't duplicate — panel or layer cap reached"
    );
    fireEvent.click(item);
    expect(onDuplicatePanel).not.toHaveBeenCalled();
  });

  it("Duplicate disabled tooltip uses a custom duplicateDisabledReason when provided", () => {
    render(
      <PanelHeader
        panel={makePanel()}
        canDuplicate={false}
        duplicateDisabledReason="Max 3 panels per document"
        onDuplicatePanel={() => {}}
      />
    );
    const menu = openMenu();
    expect(
      within(menu).getByRole("menuitem", { name: /duplicate/i })
    ).toHaveAttribute("title", "Max 3 panels per document");
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
    expect(item).toHaveAttribute("title", "Document needs at least one layer");
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

  it("Delete is disabled (aria-disabled + tooltip), opens no dialog and does not fire when canDelete is false", () => {
    const onDeletePanel = vi.fn();
    render(
      <PanelHeader
        panel={makePanel()}
        canDelete={false}
        onDeletePanel={onDeletePanel}
      />
    );
    const menu = openMenu();
    const item = within(menu).getByRole("menuitem", { name: /delete/i });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "Can't delete the only panel");
    fireEvent.click(item);
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

  it("the ⋯ menu's 'Substrate details…' opens the editor via onToggleEditor", () => {
    const onToggleEditor = vi.fn();
    const panel = makePanel();
    render(
      <PanelHeader panel={panel} onToggleEditor={onToggleEditor} />
    );
    const menu = openMenu();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Substrate details…" }));
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
    // Thickness moved to its own row chip — no longer an editor field.
    expect(screen.queryByLabelText("Substrate thickness")).not.toBeInTheDocument();
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

describe("PanelHeader — material chip + popover (auto-collapse)", () => {
  function renderPanel(panelOverrides = {}, props = {}) {
    const onUpdatePanel = vi.fn();
    render(
      <PanelHeader panel={makePanel(panelOverrides)} onUpdatePanel={onUpdatePanel} {...props} />
    );
    return onUpdatePanel;
  }
  const openMaterial = () => {
    fireEvent.click(screen.getByRole("button", { name: "Panel material" }));
    return screen.getByTestId("panel-material-popover");
  };

  it("chip reads 'Auto' by default and opens a listbox with Auto first + the catalog", () => {
    renderPanel();
    const chip = screen.getByRole("button", { name: "Panel material" });
    expect(chip).toHaveTextContent("Auto");
    const pop = openMaterial();
    const options = within(pop).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Auto (canvas material)");
    expect(options.map((o) => o.textContent)).toContain("Green Fluorescent");
  });

  it("picking a material commits { materialId } AND auto-collapses the popover", () => {
    const onUpdatePanel = renderPanel();
    const pop = openMaterial();
    fireEvent.click(within(pop).getByRole("option", { name: /Green Fluorescent/ }));
    expect(onUpdatePanel).toHaveBeenCalledWith("panel-1-abc123", {
      materialId: "green-fluorescent",
    });
    expect(screen.queryByTestId("panel-material-popover")).not.toBeInTheDocument();
  });

  it("picking Auto commits { materialId: null } and collapses", () => {
    const onUpdatePanel = renderPanel({ materialId: "green-fluorescent" });
    const pop = openMaterial();
    fireEvent.click(within(pop).getByRole("option", { name: /Auto \(canvas material\)/ }));
    expect(onUpdatePanel).toHaveBeenCalledWith("panel-1-abc123", { materialId: null });
    expect(screen.queryByTestId("panel-material-popover")).not.toBeInTheDocument();
  });

  it("Escape collapses the popover without committing", () => {
    const onUpdatePanel = renderPanel();
    openMaterial();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("panel-material-popover")).not.toBeInTheDocument();
    expect(onUpdatePanel).not.toHaveBeenCalled();
  });

  it("chip shows the chosen material's name + swatch dot", () => {
    renderPanel({ materialId: "green-fluorescent" });
    const chip = screen.getByRole("button", { name: "Panel material" });
    expect(chip).toHaveTextContent("Green Fluorescent");
    expect(within(chip).getByTestId("panel-material-swatch")).toBeInTheDocument();
  });
});

describe("PanelHeader — thickness chip + in/mm dropdown", () => {
  function renderPanel(panelOverrides = {}) {
    const onUpdatePanel = vi.fn();
    render(<PanelHeader panel={makePanel(panelOverrides)} onUpdatePanel={onUpdatePanel} />);
    return onUpdatePanel;
  }
  const openThickness = () => {
    fireEvent.click(screen.getByRole("button", { name: "Panel thickness" }));
    return screen.getByTestId("panel-thickness-popover");
  };

  it("a fresh 3mm panel reads '1/8 in' (nominal stock naming, inch default)", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Panel thickness" })).toHaveTextContent("1/8 in");
  });

  it("inch mode lists the common acrylic increments; picking commits the nominal mm and collapses", () => {
    const onUpdatePanel = renderPanel();
    const pop = openThickness();
    for (const frac of ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2"]) {
      expect(within(pop).getByRole("button", { name: `${frac} inch` })).toBeInTheDocument();
    }
    fireEvent.click(within(pop).getByRole("button", { name: "1/4 inch" }));
    expect(onUpdatePanel).toHaveBeenCalledWith("panel-1-abc123", {
      substrate: { kind: "acrylic", thickness: 6, color: "#cccccc", thicknessUnit: "in" },
    });
    expect(screen.queryByTestId("panel-thickness-popover")).not.toBeInTheDocument();
  });

  it("the mm tab shows a float input (seeded from the panel) committed on Enter", () => {
    const onUpdatePanel = renderPanel({
      substrate: { kind: "acrylic", thickness: 3, color: "#cccccc", thicknessUnit: "mm" },
    });
    // chip reads mm when the panel's unit is mm
    expect(screen.getByRole("button", { name: "Panel thickness" })).toHaveTextContent("3 mm");
    const pop = openThickness();
    const input = within(pop).getByLabelText("Thickness in millimeters");
    expect(input.value).toBe("3");
    fireEvent.change(input, { target: { value: "5.5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdatePanel).toHaveBeenCalledWith("panel-1-abc123", {
      substrate: { kind: "acrylic", thickness: 5.5, color: "#cccccc", thicknessUnit: "mm" },
    });
    expect(screen.queryByTestId("panel-thickness-popover")).not.toBeInTheDocument();
  });

  it("the unit toggle persists thicknessUnit on the substrate", () => {
    const onUpdatePanel = renderPanel();
    const pop = openThickness();
    fireEvent.click(within(pop).getByRole("button", { name: "mm" }));
    expect(onUpdatePanel).toHaveBeenCalledWith("panel-1-abc123", {
      substrate: { kind: "acrylic", thickness: 3, color: "#cccccc", thicknessUnit: "mm" },
    });
  });

  it("a non-nominal thickness shows mm by default, decimal inches only when 'in' is explicit", () => {
    renderPanel({ substrate: { kind: "acrylic", thickness: 4, color: "#cccccc" } });
    expect(screen.getByRole("button", { name: "Panel thickness" })).toHaveTextContent("4 mm");
    cleanup();
    renderPanel({ substrate: { kind: "acrylic", thickness: 4, color: "#cccccc", thicknessUnit: "in" } });
    expect(screen.getByRole("button", { name: "Panel thickness" })).toHaveTextContent("0.157 in");
  });
});
