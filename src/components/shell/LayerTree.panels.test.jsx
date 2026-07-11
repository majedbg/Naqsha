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

    // Header 1 — name + material chip (Auto) + thickness chip (1/8 in) + controls.
    const h1 = headers[0];
    expect(within(h1).getByText("Panel 1")).toBeInTheDocument();
    expect(within(h1).getByRole("button", { name: "Panel material" })).toHaveTextContent("Auto");
    expect(within(h1).getByRole("button", { name: "Panel thickness" })).toHaveTextContent("1/8 in");
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

  // 3. The old dashed "+ Add panel" is replaced by <NewPanelRow> at the foot
  //    (P6.4). Its neutral "Create panel" button fires onAddPanel() (no preset);
  //    disabled at the 3-panel cap with the cap title.
  it("creates a panel via NewPanelRow's 'Create panel' (neutral → onAddPanel(), no preset)", () => {
    const onAddPanel = vi.fn();
    renderGrouped({ onAddPanel });
    // The old dashed button is gone.
    expect(screen.queryByRole("button", { name: "Add panel" })).not.toBeInTheDocument();

    const create = screen.getByRole("button", { name: "Create panel" });
    expect(create).not.toBeDisabled();
    fireEvent.click(create);
    expect(onAddPanel).toHaveBeenCalledTimes(1);
    expect(onAddPanel).toHaveBeenCalledWith();
  });

  it("disables NewPanelRow's create at the 3-panel cap with title 'Max 3 panels per document'", () => {
    renderGrouped({
      panels: [makePanel("p1", 0), makePanel("p2", 1), makePanel("p3", 2)],
    });
    const create = screen.getByRole("button", { name: "Create panel" });
    expect(create).toBeDisabled();
    expect(create).toHaveAttribute("title", "Max 3 panels per document");
  });

  // P6.4 — NewPanelRow is ALWAYS mounted at the foot (grouped AND flat) so flat
  // mode can create the first panel. Only when onAddPanel is supplied.
  it("mounts NewPanelRow at the foot in flat mode (no panels) when onAddPanel is given", () => {
    const onAddPanel = vi.fn();
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
        onAddPanel={onAddPanel}
      />
    );
    expect(screen.getByLabelText("New panel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create panel" }));
    expect(onAddPanel).toHaveBeenCalledWith();
  });

  // 4. Delete (via the ⋯ "Panel options" menu — the standalone trash icon was
  //    removed in P5) opens the danger ConfirmDialog; checkbox unchecked →
  //    deleteLayers false; checked → true. With one panel Delete is a no-op.
  it("deletes a panel through the ⋯ menu + danger confirm dialog, threading the 'delete layers too' checkbox", () => {
    const onDeletePanel = vi.fn();
    renderGrouped({ onDeletePanel });
    const h1 = screen.getAllByTestId("panel-header")[0];

    // Open the ⋯ options menu, then choose Delete → opens the confirm dialog.
    fireEvent.click(within(h1).getByRole("button", { name: "Panel options" }));
    fireEvent.click(within(h1).getByRole("menuitem", { name: "Delete" }));
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
    fireEvent.click(within(h1).getByRole("button", { name: "Panel options" }));
    fireEvent.click(within(h1).getByRole("menuitem", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: /delete the layers on this panel too/i })
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(onDeletePanel).toHaveBeenCalledWith("p1", { deleteLayers: true });
  });

  it("does not delete when only one panel exists (Delete via ⋯ is a guarded no-op)", () => {
    const onDeletePanel = vi.fn();
    renderGrouped({
      panels: [makePanel("p1", 0)],
      layers: [makeLayer("l1", { panelId: "p1" })],
      onDeletePanel,
    });
    const h1 = screen.getByTestId("panel-header");
    fireEvent.click(within(h1).getByRole("button", { name: "Panel options" }));
    fireEvent.click(within(h1).getByRole("menuitem", { name: "Delete" }));
    // canDelete=false → handleDelete is a no-op: no confirm dialog, no callback.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onDeletePanel).not.toHaveBeenCalled();
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

    // Open the substrate-details editor via the ⋯ menu (material + thickness
    // moved to their own row chips).
    fireEvent.click(within(h1).getByRole("button", { name: "Panel options" }));
    fireEvent.click(within(h1).getByRole("menuitem", { name: "Substrate details…" }));
    const kind = within(h1).getByRole("combobox", { name: "Substrate kind" });
    expect(kind).toBeInTheDocument();
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

    const openDetails = (h) => {
      fireEvent.click(within(h).getByRole("button", { name: "Panel options" }));
      fireEvent.click(within(h).getByRole("menuitem", { name: "Substrate details…" }));
    };
    openDetails(h1);
    expect(within(h1).getByRole("combobox", { name: "Substrate kind" })).toBeInTheDocument();

    openDetails(h2);
    expect(within(h2).getByRole("combobox", { name: "Substrate kind" })).toBeInTheDocument();
    expect(within(h1).queryByRole("combobox", { name: "Substrate kind" })).not.toBeInTheDocument();
  });

  // P6.1 — grouped per-panel "+ Add layer": each panel row wrapper carries
  // data-testid={panel.id}; under each panel's layers a static-aria "+ Add layer"
  // button calls onAddLayer(panel.id). Names aren't unique → scope by id.
  it("renders a per-panel '+ Add layer' that calls onAddLayer(panel.id)", () => {
    const onAddLayer = vi.fn();
    renderGrouped({ onAddLayer });

    const p1 = screen.getByTestId("p1");
    const p2 = screen.getByTestId("p2");
    fireEvent.click(within(p1).getByRole("button", { name: "Add layer" }));
    expect(onAddLayer).toHaveBeenCalledWith("p1");

    fireEvent.click(within(p2).getByRole("button", { name: "Add layer" }));
    expect(onAddLayer).toHaveBeenCalledWith("p2");
  });

  // P6.2 — in grouped mode the bottom global "+ New Layer" button is gone; the
  // only add-layer affordances are the per-panel ones (one per panel).
  it("does not render the global '+ New Layer' button in grouped mode", () => {
    const onAddLayer = vi.fn();
    renderGrouped({ onAddLayer });
    expect(screen.queryByText("New Layer")).not.toBeInTheDocument();
    // Exactly one "Add layer" per panel — no extra global one.
    expect(screen.getAllByRole("button", { name: "Add layer" })).toHaveLength(2);
  });

  // P6.3 — flat mode (no panels) keeps ONE global add-layer; clicking it calls
  // onAddLayer() with NO panel id (zero args — guards the P7 panelId contract
  // against the click-event leak).
  it("keeps the global add-layer in flat mode and calls onAddLayer() with no panel id", () => {
    const onAddLayer = vi.fn();
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
        onAddLayer={onAddLayer}
      />
    );
    const add = screen.getByRole("button", { name: "Add layer" });
    fireEvent.click(add);
    expect(onAddLayer).toHaveBeenCalledWith();
  });

  // P6.5 — the per-panel "+ Add layer" honors the tier layer cap via addDisabled.
  it("disables every per-panel '+ Add layer' when addDisabled (layer cap reached)", () => {
    renderGrouped({ onAddLayer: vi.fn(), addDisabled: true });
    const adds = screen.getAllByRole("button", { name: "Add layer" });
    expect(adds).toHaveLength(2);
    adds.forEach((b) => expect(b).toBeDisabled());
  });

  // P6.6 — LayerTree threads the panel-action props through to PanelHeader:
  // onDuplicatePanel / onClearPanelLayers, plus the per-panel canDuplicate /
  // canClearLayers gates (cap defaults to Infinity → canDuplicate reduces to the
  // panel cap).
  it("threads Duplicate through the ⋯ menu → onDuplicatePanel(panel.id)", () => {
    const onDuplicatePanel = vi.fn();
    renderGrouped({ onDuplicatePanel });
    const h1 = screen.getAllByTestId("panel-header")[0];
    fireEvent.click(within(h1).getByRole("button", { name: "Panel options" }));
    fireEvent.click(within(h1).getByRole("menuitem", { name: "Duplicate" }));
    expect(onDuplicatePanel).toHaveBeenCalledWith("p1");
  });

  it("threads Clear all layers through the ⋯ menu + danger confirm → onClearPanelLayers(panel.id)", () => {
    const onClearPanelLayers = vi.fn();
    renderGrouped({ onClearPanelLayers });
    const h1 = screen.getAllByTestId("panel-header")[0];
    fireEvent.click(within(h1).getByRole("button", { name: "Panel options" }));
    const clear = within(h1).getByRole("menuitem", { name: "Clear all layers" });
    // p1 holds Alpha+Beta and the doc has Gamma left over → clearing is allowed.
    expect(clear).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(clear);
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    expect(onClearPanelLayers).toHaveBeenCalledWith("p1");
  });

  it("disables Clear all layers when it would empty the document (single panel, all layers)", () => {
    renderGrouped({
      panels: [makePanel("p1", 0)],
      layers: [makeLayer("l1", { panelId: "p1" })],
      onClearPanelLayers: vi.fn(),
    });
    const h1 = screen.getByTestId("panel-header");
    fireEvent.click(within(h1).getByRole("button", { name: "Panel options" }));
    expect(
      within(h1).getByRole("menuitem", { name: "Clear all layers" })
    ).toHaveAttribute("aria-disabled", "true");
  });

  // P6.6b (plan §8.4) — when Duplicate is disabled, LayerTree threads the PRECISE
  // reason to PanelHeader's tooltip: panel cap hit → "Max 3 panels per document".
  it("disables Duplicate with the panel-cap tooltip at the 3-panel cap", () => {
    renderGrouped({
      panels: [makePanel("p1", 0), makePanel("p2", 1), makePanel("p3", 2)],
      onDuplicatePanel: vi.fn(),
    });
    const p1 = screen.getByTestId("p1");
    fireEvent.click(within(p1).getByRole("button", { name: "Panel options" }));
    const dup = within(p1).getByRole("menuitem", { name: "Duplicate" });
    expect(dup).toHaveAttribute("aria-disabled", "true");
    expect(dup).toHaveAttribute("title", "Max 3 panels per document");
  });

  // Layer-cap scenario: under the panel cap but copying would overflow the layer
  // cap → reason is "Not enough layer slots to duplicate". (Default harness: 3
  // layers total, p1 holds 2; cap=3 → 3+2 > 3.)
  it("disables Duplicate with the layer-cap tooltip when copying would overflow the layer cap", () => {
    renderGrouped({ cap: 3, onDuplicatePanel: vi.fn() });
    const p1 = screen.getByTestId("p1");
    fireEvent.click(within(p1).getByRole("button", { name: "Panel options" }));
    const dup = within(p1).getByRole("menuitem", { name: "Duplicate" });
    expect(dup).toHaveAttribute("aria-disabled", "true");
    expect(dup).toHaveAttribute("title", "Not enough layer slots to duplicate");
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

// "Move to panel…" — the ⋯ row-menu path for reassigning a layer's panel (the
// menu-driven sibling of the drag-onto-header path above). Selecting the item
// opens the MoveToPanelPicker popper (OperationPicker-style: role="menu",
// swatch + panel name per entry); picking another panel fires
// onAssignLayerToPanel(layerId, panelId).
describe("LayerTree — Move to panel… (row ⋯ menu → picker popper)", () => {
  // Open the ⋯ menu on the row whose layer-name matches `name`.
  function openMenuFor(name) {
    const row = screen
      .getAllByTestId("layer-row")
      .find((r) => within(r).queryByText(name));
    fireEvent.click(within(row).getByRole("button", { name: "Row actions" }));
    return { row, menu: within(row).getByTestId("row-menu") };
  }

  it("moves a layer to the chosen panel: ⋯ → Move to panel… → pick → onAssignLayerToPanel", () => {
    const props = renderGrouped();
    const { row, menu } = openMenuFor("Alpha"); // Alpha lives on p1
    fireEvent.click(within(menu).getByRole("menuitem", { name: /move to panel/i }));

    // The row menu closed and the picker popper opened in its place.
    expect(within(row).queryByTestId("row-menu")).not.toBeInTheDocument();
    const picker = within(row).getByTestId("move-to-panel-picker");

    // One entry per panel, sorted by order; the CURRENT panel is marked.
    const entries = within(picker).getAllByRole("menuitem");
    expect(entries.map((e) => e.textContent)).toEqual(["Panel 1", "Panel 2"]);
    expect(entries[0]).toHaveAttribute("aria-current", "true");

    fireEvent.click(entries[1]);
    expect(props.onAssignLayerToPanel).toHaveBeenCalledWith("l1", "p2");
    expect(within(row).queryByTestId("move-to-panel-picker")).not.toBeInTheDocument();
  });

  it("picking the CURRENT panel just closes the picker without reassigning", () => {
    const props = renderGrouped();
    const { row, menu } = openMenuFor("Gamma"); // Gamma lives on p2
    fireEvent.click(within(menu).getByRole("menuitem", { name: /move to panel/i }));
    const picker = within(row).getByTestId("move-to-panel-picker");
    const current = within(picker)
      .getAllByRole("menuitem")
      .find((e) => e.getAttribute("aria-current") === "true");
    expect(current).toHaveTextContent("Panel 2");
    fireEvent.click(current);
    expect(props.onAssignLayerToPanel).not.toHaveBeenCalled();
    expect(within(row).queryByTestId("move-to-panel-picker")).not.toBeInTheDocument();
  });

  it("closes the picker on Escape without reassigning", () => {
    const props = renderGrouped();
    const { row, menu } = openMenuFor("Alpha");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /move to panel/i }));
    const picker = within(row).getByTestId("move-to-panel-picker");
    fireEvent.keyDown(picker, { key: "Escape" });
    expect(within(row).queryByTestId("move-to-panel-picker")).not.toBeInTheDocument();
    expect(props.onAssignLayerToPanel).not.toHaveBeenCalled();
  });

  it("omits 'Move to panel…' when the document has a single panel (nowhere to move to)", () => {
    renderGrouped({
      layers: [makeLayer("l1", { name: "Alpha", panelId: "p1" })],
      panels: [makePanel("p1", 0)],
    });
    const { menu } = openMenuFor("Alpha");
    expect(
      within(menu).queryByRole("menuitem", { name: /move to panel/i })
    ).not.toBeInTheDocument();
  });

  it("omits 'Move to panel…' in flat mode (no panels)", () => {
    renderGrouped({
      layers: [makeLayer("l1", { name: "Alpha" })],
      panels: [],
    });
    const { menu } = openMenuFor("Alpha");
    expect(
      within(menu).queryByRole("menuitem", { name: /move to panel/i })
    ).not.toBeInTheDocument();
  });

  it("also works on a freshly duplicated layer (duplicate → move the copy)", () => {
    // Duplicate is host-owned (onDuplicateLayer); simulate the host having
    // appended the copy to the same panel, then move the COPY via its own menu.
    const props = renderGrouped({
      layers: [
        makeLayer("l1", { name: "Alpha", panelId: "p1" }),
        makeLayer("l1-copy", { name: "Alpha copy", panelId: "p1" }),
        makeLayer("l3", { name: "Gamma", panelId: "p2" }),
      ],
    });
    const { row, menu } = openMenuFor("Alpha copy");
    fireEvent.click(within(menu).getByRole("menuitem", { name: /move to panel/i }));
    const picker = within(row).getByTestId("move-to-panel-picker");
    fireEvent.click(within(picker).getByRole("menuitem", { name: /panel 2/i }));
    expect(props.onAssignLayerToPanel).toHaveBeenCalledWith("l1-copy", "p2");
  });
});
