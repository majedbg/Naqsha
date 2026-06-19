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

function makeLayer(id, { name, operationId = "op-cut" } = {}) {
  return {
    id,
    name: name || id,
    patternType: "flowfield",
    params: {},
    visible: true,
    locked: false,
    operationId,
  };
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
  it("per-row Delete invokes onDeleteLayer with the row's id (and does not select the row)", () => {
    const onDeleteLayer = vi.fn();
    const onSelectLayer = vi.fn();
    renderTree({ onDeleteLayer, onSelectLayer });
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Delete layer" }));
    expect(onDeleteLayer).toHaveBeenCalledWith("l2");
    // The action button stops propagation, so clicking it never selects the row.
    expect(onSelectLayer).not.toHaveBeenCalled();
  });

  it("per-row Duplicate invokes onDuplicateLayer with the row's id", () => {
    const onDuplicateLayer = vi.fn();
    renderTree({ onDuplicateLayer });
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Duplicate layer" }));
    expect(onDuplicateLayer).toHaveBeenCalledWith("l1");
  });

  it("per-row Randomize invokes onRandomizeLayer with the row's id", () => {
    const onRandomizeLayer = vi.fn();
    renderTree({ onRandomizeLayer });
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[1]).getByRole("button", { name: "Randomize layer" }));
    expect(onRandomizeLayer).toHaveBeenCalledWith("l2");
  });

  it("per-row Randomize params invokes onRandomizeLayerParams with the row's id", () => {
    const onRandomizeLayerParams = vi.fn();
    renderTree({ onRandomizeLayerParams });
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Randomize layer params" }));
    expect(onRandomizeLayerParams).toHaveBeenCalledWith("l1");
  });

  it("per-row Export invokes onExportLayer with the row's id", () => {
    const onExportLayer = vi.fn();
    renderTree({ onExportLayer });
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Export layer" }));
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

  it("omitting the new handler props renders no extra action controls (back-compat)", () => {
    renderTree();
    expect(screen.queryByRole("button", { name: "Delete layer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Duplicate layer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Randomize layer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export layer" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Randomize all seeds" })).not.toBeInTheDocument();
  });
});

describe("LayerTree — full lock enforcement on the row (#lock)", () => {
  function renderWithLockedFirst(handlers = {}) {
    const props = {
      layers: [
        { ...makeLayer("l1", { name: "A" }), locked: true },
        makeLayer("l2", { name: "B" }),
      ],
      operations: seedOperations(),
      profileId: "laser",
      selectedLayerId: null,
      onSelectLayer: vi.fn(),
      onUpdateLayer: vi.fn(),
      onReorderLayers: vi.fn(),
      onProfileChange: vi.fn(),
      onDeleteLayer: vi.fn(),
      onDuplicateLayer: vi.fn(),
      onRandomizeLayer: vi.fn(),
      onRandomizeLayerParams: vi.fn(),
      onExportLayer: vi.fn(),
      onAssignOperation: vi.fn(),
      ...handlers,
    };
    render(<LayerTree {...props} />);
    return props;
  }

  it("disables every mutating row action on a locked layer", () => {
    renderWithLockedFirst();
    const locked = screen.getAllByTestId("layer-row")[0];
    for (const name of [
      "Randomize layer",
      "Randomize layer params",
      "Duplicate layer",
      "Export layer",
      "Delete layer",
      "Move layer up",
      "Move layer down",
    ]) {
      expect(within(locked).getByRole("button", { name })).toBeDisabled();
    }
  });

  it("clicking a disabled action on a locked layer does not fire its handler", () => {
    const onDeleteLayer = vi.fn();
    const onRandomizeLayer = vi.fn();
    renderWithLockedFirst({ onDeleteLayer, onRandomizeLayer });
    const locked = screen.getAllByTestId("layer-row")[0];
    fireEvent.click(within(locked).getByRole("button", { name: "Delete layer" }));
    fireEvent.click(within(locked).getByRole("button", { name: "Randomize layer" }));
    expect(onDeleteLayer).not.toHaveBeenCalled();
    expect(onRandomizeLayer).not.toHaveBeenCalled();
  });

  it("keeps visibility + lock toggles live and the row selectable when locked", () => {
    const onUpdateLayer = vi.fn();
    const onSelectLayer = vi.fn();
    renderWithLockedFirst({ onUpdateLayer, onSelectLayer });
    const locked = screen.getAllByTestId("layer-row")[0];

    // Visibility toggle stays usable (so a locked layer can still be hidden).
    expect(within(locked).getByRole("button", { name: "Hide layer" })).toBeEnabled();
    // The lock control reads "Unlock layer" and stays usable.
    fireEvent.click(within(locked).getByRole("button", { name: "Unlock layer" }));
    expect(onUpdateLayer).toHaveBeenCalledWith("l1", { locked: false });

    // The row itself stays selectable (so the inspector can show it read-only).
    fireEvent.click(within(locked).getByText("A"));
    expect(onSelectLayer).toHaveBeenCalledWith("l1");
  });

  it("does not disable actions on an UNLOCKED sibling row", () => {
    renderWithLockedFirst();
    const unlocked = screen.getAllByTestId("layer-row")[1];
    expect(within(unlocked).getByRole("button", { name: "Delete layer" })).toBeEnabled();
    expect(within(unlocked).getByRole("button", { name: "Randomize layer" })).toBeEnabled();
  });
});
