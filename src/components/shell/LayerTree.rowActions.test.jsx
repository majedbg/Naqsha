// @vitest-environment jsdom
//
// AC2 re-homing (#16): the legacy LayersSection per-layer + header actions —
// delete, duplicate, randomize seed, randomize params, and per-layer SVG export,
// plus the header-level randomize-all (seeds + params) — lost their home when the
// two-pane layout was removed. This re-homes them onto the shell's LayerTree:
// per-row actions on each layer row, and randomize-all in the tree header. Each
// asserts the new control invokes the surviving handler with the row's id.
//
// NEW test file (does not touch LayerTree.test.jsx). The handler props are
// optional on LayerTree, so the existing component tests (which don't pass them)
// stay green.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import LayerTree from "./LayerTree";
import { seedOperations } from "../../lib/operations";

function makeLayer(id, { name, operationId = "op-cut", locked = false } = {}) {
  return {
    id,
    name: name || id,
    patternType: "flowfield",
    params: {},
    visible: true,
    locked,
    operationId,
  };
}

// Open the ⋯ row menu for a given row and return its menu element.
function openRowMenu(row) {
  fireEvent.click(within(row).getByRole("button", { name: "Row actions" }));
  return within(row).getByTestId("row-menu");
}

function renderTree(extra = {}) {
  const props = {
    layers: [makeLayer("l1", { name: "A" }), makeLayer("l2", { name: "B" })],
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

describe("LayerTree — re-homed per-row + header actions (#16 AC2)", () => {
  it("per-row Delete (⋯ → Delete → confirm danger dialog) invokes onDeleteLayer (and does not select the row)", () => {
    const onDeleteLayer = vi.fn();
    const onSelectLayer = vi.fn();
    renderTree({ onDeleteLayer, onSelectLayer });
    const rows = screen.getAllByTestId("layer-row");
    const menu = openRowMenu(rows[1]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));
    // ConfirmDialog (danger): truthful copy, no undo.
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent('Delete "B"?');
    expect(dialog).toHaveTextContent("This can't be undone.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDeleteLayer).toHaveBeenCalledWith("l2");
    // Opening the menu / confirming never selects the row.
    expect(onSelectLayer).not.toHaveBeenCalled();
  });

  it("per-row Duplicate (⋯ → Duplicate) invokes onDuplicateLayer with the row's id", () => {
    const onDuplicateLayer = vi.fn();
    renderTree({ onDuplicateLayer });
    const rows = screen.getAllByTestId("layer-row");
    const menu = openRowMenu(rows[0]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));
    expect(onDuplicateLayer).toHaveBeenCalledWith("l1");
  });

  it("per-row dice (Randomize params → confirm) invokes onRandomizeLayerParams with the row's id", () => {
    const onRandomizeLayerParams = vi.fn();
    renderTree({ onRandomizeLayerParams });
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Randomize layer params" }));
    // ConfirmDialog (NOT danger): truthful copy.
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Randomize parameters?");
    expect(dialog).toHaveTextContent("This overwrites the current values for this layer.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Randomize" }));
    expect(onRandomizeLayerParams).toHaveBeenCalledWith("l1");
  });

  it("per-row dice is disabled on a LOCKED layer: title='Layer locked', opens no confirm, calls no handler", () => {
    const onRandomizeLayerParams = vi.fn();
    renderTree({
      onRandomizeLayerParams,
      layers: [makeLayer("l1", { name: "A", locked: true })],
    });
    const dice = screen.getByRole("button", { name: "Randomize layer params" });
    expect(dice).toBeDisabled();
    expect(dice).toHaveAttribute("title", "Layer locked");
    fireEvent.click(dice);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onRandomizeLayerParams).not.toHaveBeenCalled();
  });

  it("per-row Download (⋯ → Download) invokes onExportLayer with the row's id", () => {
    const onExportLayer = vi.fn();
    renderTree({ onExportLayer });
    const rows = screen.getAllByTestId("layer-row");
    const menu = openRowMenu(rows[0]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Download" }));
    expect(onExportLayer).toHaveBeenCalledWith("l1");
  });

  it("header Randomize all invokes onRandomizeAll", () => {
    const onRandomizeAll = vi.fn();
    renderTree({ onRandomizeAll });
    fireEvent.click(screen.getByRole("button", { name: "Randomize all seeds" }));
    expect(onRandomizeAll).toHaveBeenCalledTimes(1);
  });

  it("header Randomize all params invokes onRandomizeAllParams", () => {
    const onRandomizeAllParams = vi.fn();
    renderTree({ onRandomizeAllParams });
    fireEvent.click(screen.getByRole("button", { name: "Randomize all params" }));
    expect(onRandomizeAllParams).toHaveBeenCalledTimes(1);
  });

  // Back-compat policy (ported intent, not deleted): the legacy INLINE per-row
  // action buttons must NOT appear in the new layout — that's the real regression
  // guard. The ⋯ trigger ALWAYS renders (Rename needs only onUpdateLayer, always
  // supplied). RowMenu's API is frozen at 4 items (WI-4), so all items always
  // render; unwired Duplicate/Download/Delete are SAFE no-ops (RowMenu's default
  // no-op props + LayerTree's `undefined` pass-through) — clicking them throws
  // nothing and never selects the row. Dice + header randomize-all are gated on
  // their handlers and absent here.
  it("omitting the new handler props removes legacy inline actions; ⋯ stays, unwired items are safe no-ops (back-compat)", () => {
    const onSelectLayer = vi.fn();
    renderTree({ onSelectLayer });
    const rows = screen.getAllByTestId("layer-row");

    // Legacy INLINE buttons are gone (re-homed into ⋯ / removed). This is the
    // ported version of the old "no extra inline controls" assertion.
    expect(within(rows[0]).queryByRole("button", { name: "Delete layer" })).not.toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button", { name: "Duplicate layer" })).not.toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button", { name: "Export layer" })).not.toBeInTheDocument();
    expect(within(rows[0]).queryByRole("button", { name: "Randomize layer" })).not.toBeInTheDocument();

    // Dice + header randomize-all are gated on their handlers.
    expect(within(rows[0]).queryByRole("button", { name: "Randomize layer params" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Randomize all seeds" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Randomize all params" })).not.toBeInTheDocument();

    // ⋯ still renders; opening it and clicking an unwired item is a safe no-op.
    const menu = openRowMenu(rows[0]);
    expect(within(menu).getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(() =>
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }))
    ).not.toThrow();
    expect(onSelectLayer).not.toHaveBeenCalled();
  });
});
