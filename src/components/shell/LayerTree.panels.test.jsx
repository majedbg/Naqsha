// @vitest-environment jsdom
//
// WI-5 Naqsha Panels: the grouped panel tier in LayerTree. Panels render as
// collapsible header rows above their layers; layers nest under their panel by
// `panelId`. The grouped tier renders ONLY when a non-empty `panels` array is
// passed — without it the tree stays the flat list (back-compat). Desktop only.
//
// Mirrors the existing LayerTree harness: controlled props, `makeLayer` helper,
// `data-testid`, `within(region)`, `fireEvent`. The grouped tier is props-driven
// (handlers injected — no store access).

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import LayerTree from "./LayerTree";
import { seedOperations } from "../../lib/operations";

function makeLayer(id, { name, panelId } = {}) {
  return {
    id,
    name: name || id,
    patternType: "flowfield",
    params: {},
    visible: true,
    locked: false,
    operationId: "op-cut",
    panelId,
  };
}

function makePanel(id, order, overrides = {}) {
  return {
    id,
    name: `Panel ${order + 1}`,
    substrate: { kind: "acrylic", thickness: 3, color: "#cccccc" },
    visible: true,
    order,
    ...overrides,
  };
}

// Render the grouped tier with sensible defaults; `extra` overrides any prop.
function renderGrouped(extra = {}) {
  const props = {
    layers: [
      makeLayer("l1", { name: "Alpha", panelId: "p1" }),
      makeLayer("l2", { name: "Beta", panelId: "p1" }),
      makeLayer("l3", { name: "Gamma", panelId: "p2" }),
    ],
    panels: [makePanel("p1", 0), makePanel("p2", 1)],
    operations: seedOperations(),
    profileId: "laser",
    selectedLayerId: null,
    onSelectLayer: vi.fn(),
    onUpdateLayer: vi.fn(),
    onReorderLayers: vi.fn(),
    onProfileChange: vi.fn(),
    onAddPanel: vi.fn(),
    onDeletePanel: vi.fn(),
    onUpdatePanel: vi.fn(),
    onAssignLayerToPanel: vi.fn(),
    ...extra,
  };
  render(<LayerTree {...props} />);
  return props;
}

// One dataTransfer stub shared across dragStart + drop so setData persists.
function makeDataTransfer() {
  return {
    data: {},
    setData(k, v) {
      this.data[k] = String(v);
    },
    getData(k) {
      return this.data[k];
    },
  };
}

describe("LayerTree — grouped panel tier (WI-5, spec §6)", () => {
  // 1. A header per panel (name, substrate summary, visibility toggle, collapse
  //    chevron); each panel's layers nest under it by panelId.
  it("renders one panel-header per panel with name + substrate summary, nesting layers by panelId", () => {
    renderGrouped();
    const headers = screen.getAllByTestId("panel-header");
    expect(headers).toHaveLength(2);

    // Header 1 — name + substrate summary (kind + thickness) + controls.
    const h1 = headers[0];
    expect(within(h1).getByText("Panel 1")).toBeInTheDocument();
    expect(within(h1).getByText(/acrylic/i)).toHaveTextContent("3");
    expect(
      within(h1).getByRole("button", { name: /collapse panel|expand panel/i })
    ).toBeInTheDocument();
    expect(
      within(h1).getByRole("button", { name: /hide panel|show panel/i })
    ).toBeInTheDocument();

    // Layers nest under their panel: p1 has Alpha + Beta, p2 has Gamma.
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    const rows = screen.getAllByTestId("layer-row");
    expect(rows).toHaveLength(3);
  });

  // 2. Collapse chevron hides that panel's layer rows; toggling again shows them;
  //    state persists across the toggle.
  it("collapses and expands a panel's layer rows via the chevron (state persists)", () => {
    renderGrouped();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();

    const h1 = screen.getAllByTestId("panel-header")[0];
    const chevron = within(h1).getByRole("button", { name: /collapse panel/i });
    fireEvent.click(chevron);

    // p1 layers hidden; p2 (Gamma) still visible.
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();

    // Toggle again → shows them.
    fireEvent.click(within(h1).getByRole("button", { name: /expand panel/i }));
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  // 3. "+ Add panel" calls onAddPanel; disabled at 3 with the cap tooltip.
  it("calls onAddPanel from the add button; disables it at 3 panels with the cap title", () => {
    const onAddPanel = vi.fn();
    renderGrouped({ onAddPanel });
    const add = screen.getByRole("button", { name: "Add panel" });
    expect(add).not.toBeDisabled();
    fireEvent.click(add);
    expect(onAddPanel).toHaveBeenCalledTimes(1);
  });

  it("disables Add panel at the 3-panel cap with title 'Max 3 panels per document'", () => {
    renderGrouped({
      panels: [makePanel("p1", 0), makePanel("p2", 1), makePanel("p3", 2)],
    });
    const add = screen.getByRole("button", { name: "Add panel" });
    expect(add).toBeDisabled();
    expect(add).toHaveAttribute("title", "Max 3 panels per document");
  });

  // 4. Delete opens the danger ConfirmDialog; checkbox unchecked → deleteLayers
  //    false; checked → true. Delete disabled when only one panel.
  it("deletes a panel through a danger confirm dialog, threading the 'delete layers too' checkbox", () => {
    const onDeletePanel = vi.fn();
    renderGrouped({ onDeletePanel });
    const h1 = screen.getAllByTestId("panel-header")[0];

    // Open the delete confirm.
    fireEvent.click(within(h1).getByRole("button", { name: /delete panel/i }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();

    // Confirm with the checkbox UNCHECKED → deleteLayers: false.
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDeletePanel).toHaveBeenCalledWith("p1", { deleteLayers: false });
  });

  it("passes deleteLayers:true when the 'delete layers too' checkbox is checked", () => {
    const onDeletePanel = vi.fn();
    renderGrouped({ onDeletePanel });
    const h1 = screen.getAllByTestId("panel-header")[0];
    fireEvent.click(within(h1).getByRole("button", { name: /delete panel/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: /delete the layers on this panel too/i })
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDeletePanel).toHaveBeenCalledWith("p1", { deleteLayers: true });
  });

  it("disables panel delete when only one panel exists (always >= 1)", () => {
    renderGrouped({
      panels: [makePanel("p1", 0)],
      layers: [makeLayer("l1", { panelId: "p1" })],
    });
    const h1 = screen.getByTestId("panel-header");
    expect(within(h1).getByRole("button", { name: /delete panel/i })).toBeDisabled();
  });

  // 5. Dragging a layer row and dropping on another panel's header reassigns it.
  it("reassigns a layer's panel when its row is dropped on another panel's header", () => {
    const onAssignLayerToPanel = vi.fn();
    renderGrouped({ onAssignLayerToPanel });
    const rows = screen.getAllByTestId("layer-row");
    const alpha = rows[0]; // l1, in p1
    const targetHeader = screen.getAllByTestId("panel-header")[1]; // p2

    const dt = makeDataTransfer();
    fireEvent.dragStart(alpha, { dataTransfer: dt });
    fireEvent.dragOver(targetHeader, { dataTransfer: dt });
    fireEvent.drop(targetHeader, { dataTransfer: dt });

    expect(onAssignLayerToPanel).toHaveBeenCalledWith("l1", "p2");
  });

  // 6. Double-click panel name → input; commit calls onUpdatePanel(id,{name}).
  //    Clicking substrate summary opens the editor; selecting 'other' reveals the
  //    free-text label input.
  it("renames a panel inline and edits its substrate (other reveals a label input)", () => {
    const onUpdatePanel = vi.fn();
    renderGrouped({ onUpdatePanel });
    const h1 = screen.getAllByTestId("panel-header")[0];

    // Inline rename.
    fireEvent.doubleClick(within(h1).getByText("Panel 1"));
    const nameInput = within(h1).getByRole("textbox");
    fireEvent.change(nameInput, { target: { value: "  Front  " } });
    fireEvent.keyDown(nameInput, { key: "Enter" });
    expect(onUpdatePanel).toHaveBeenCalledWith("p1", { name: "Front" });

    // Open the substrate editor.
    fireEvent.click(within(h1).getByRole("button", { name: /acrylic/i }));
    const kind = within(h1).getByRole("combobox", { name: "Substrate kind" });
    expect(kind).toBeInTheDocument();
    expect(within(h1).getByLabelText("Substrate thickness")).toBeInTheDocument();
    expect(within(h1).getByLabelText("Substrate color")).toBeInTheDocument();

    // Selecting 'other' reveals the free-text label input.
    expect(within(h1).queryByLabelText("Substrate label")).not.toBeInTheDocument();
    fireEvent.change(kind, { target: { value: "other" } });
    expect(within(h1).getByLabelText("Substrate label")).toBeInTheDocument();
  });

  // Global-index reorder in grouped mode (advisor #1): a row's index must be its
  // position in the FULL layers array, not its within-group index. Gamma (l3) is
  // global index 2; moving it "up" must call onReorderLayers(2, 1).
  it("reorders grouped rows using GLOBAL layer indices, not within-group indices", () => {
    const onReorderLayers = vi.fn();
    renderGrouped({ onReorderLayers });
    const rows = screen.getAllByTestId("layer-row");
    const gamma = rows[2]; // l3 — global index 2
    fireEvent.click(within(gamma).getByRole("button", { name: "Move layer up" }));
    expect(onReorderLayers).toHaveBeenCalledWith(2, 1);
  });

  // Acceptance (§6): one substrate editor open at a time — opening p2's closes
  // p1's, mirroring the row-menu single-open pattern (owned by LayerTree).
  it("keeps only one panel's substrate editor open at a time", () => {
    renderGrouped();
    const [h1, h2] = screen.getAllByTestId("panel-header");

    fireEvent.click(within(h1).getByRole("button", { name: /acrylic/i }));
    expect(within(h1).getByRole("combobox", { name: "Substrate kind" })).toBeInTheDocument();

    fireEvent.click(within(h2).getByRole("button", { name: /acrylic/i }));
    expect(within(h2).getByRole("combobox", { name: "Substrate kind" })).toBeInTheDocument();
    expect(within(h1).queryByRole("combobox", { name: "Substrate kind" })).not.toBeInTheDocument();
  });

  // 7. Back-compat: WITHOUT panels, the flat list renders and NO panel headers.
  it("renders the flat list with NO panel headers when panels is omitted", () => {
    render(
      <LayerTree
        layers={[makeLayer("l1", { name: "Solo" })]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
      />
    );
    expect(screen.queryByTestId("panel-header")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add panel" })).not.toBeInTheDocument();
    expect(screen.getByText("Solo")).toBeInTheDocument();
    expect(screen.getByTestId("layer-row")).toBeInTheDocument();
  });

  it("renders the flat list with NO panel headers when panels is an empty array", () => {
    render(
      <LayerTree
        layers={[makeLayer("l1", { name: "Solo" })]}
        panels={[]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
      />
    );
    expect(screen.queryByTestId("panel-header")).not.toBeInTheDocument();
    expect(screen.getByTestId("layer-row")).toBeInTheDocument();
  });
});
