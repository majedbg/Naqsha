// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import LayerTree from "./LayerTree";
import { seedOperations } from "../../lib/operations";
import { remapOperationsToProfile } from "../../lib/machineProfiles";

// Minimal layer matching useLayers' shape, defaulting to the Cut operation.
function makeLayer(id, { patternType = "flowfield", operationId = "op-cut", name, visible = true, locked = false } = {}) {
  return {
    id,
    name: name || id,
    patternType,
    params: {},
    visible,
    locked,
    operationId,
  };
}

describe("LayerTree (B2 — layer tree + machine-profile selector)", () => {
  // (a) RENDER — a row shows the correct chip color/label for its operation.
  it("renders one row per layer with an operation chip showing the resolved color + name", () => {
    const operations = seedOperations();
    render(
      <LayerTree
        layers={[
          makeLayer("l1", { operationId: "op-cut", name: "Top" }),
          makeLayer("l2", { operationId: "op-score", name: "Mid" }),
        ]}
        operations={operations}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
      />
    );
    const rows = screen.getAllByTestId("layer-row");
    expect(rows).toHaveLength(2);

    // Inline now shows the operation's uppercase INITIAL only (Cut→C, Score→S);
    // the full name lives in the chip's `title` tooltip, never inline (spec §3.1).
    const chip1 = within(rows[0]).getByTestId("operation-chip");
    expect(chip1).toHaveTextContent("C");
    expect(chip1).not.toHaveTextContent("Cut");
    expect(chip1).toHaveAttribute("title", expect.stringContaining("Cut"));
    expect(chip1.querySelector("[data-chip-swatch]")).toHaveStyle({
      backgroundColor: "#FF0000",
    });

    const chip2 = within(rows[1]).getByTestId("operation-chip");
    expect(chip2).toHaveTextContent("S");
    expect(chip2).not.toHaveTextContent("Score");
    expect(chip2).toHaveAttribute("title", expect.stringContaining("Score"));
    expect(chip2.querySelector("[data-chip-swatch]")).toHaveStyle({
      backgroundColor: "#0000FF",
    });
  });

  // (b) RENDER — the chip reflects the assigned operation and updates when the
  // layer's operationId is reassigned (the reassign action itself is #11).
  it("updates the chip when the layer's operationId changes", () => {
    const operations = seedOperations();
    function Harness() {
      const [layers, setLayers] = useState([makeLayer("l1", { operationId: "op-cut" })]);
      return (
        <div>
          <button onClick={() => setLayers((p) => p.map((l) => ({ ...l, operationId: "op-engrave" })))}>
            reassign
          </button>
          <LayerTree
            layers={layers}
            operations={operations}
            profileId="laser"
            selectedLayerId={null}
            onSelectLayer={() => {}}
            onUpdateLayer={() => {}}
            onReorderLayers={() => {}}
            onProfileChange={() => {}}
          />
        </div>
      );
    }
    render(<Harness />);
    const chip = screen.getByTestId("operation-chip");
    expect(chip).toHaveTextContent("C");
    expect(chip).toHaveAttribute("title", expect.stringContaining("Cut"));
    expect(chip.querySelector("[data-chip-swatch]")).toHaveStyle({ backgroundColor: "#FF0000" });

    fireEvent.click(screen.getByRole("button", { name: "reassign" }));

    const chipAfter = screen.getByTestId("operation-chip");
    expect(chipAfter).toHaveTextContent("E");
    expect(chipAfter).not.toHaveTextContent("Engrave");
    expect(chipAfter).toHaveAttribute("title", expect.stringContaining("Engrave"));
    expect(chipAfter.querySelector("[data-chip-swatch]")).toHaveStyle({ backgroundColor: "#000000" });
  });

  // (c) INTERACTION — reorder updates layer order via onReorderLayers(from, to).
  it("reorders a layer by stepping it down (calls onReorderLayers with from/to)", () => {
    const onReorderLayers = vi.fn();
    render(
      <LayerTree
        layers={[makeLayer("l1", { name: "A" }), makeLayer("l2", { name: "B" })]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={onReorderLayers}
        onProfileChange={() => {}}
      />
    );
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Move layer down" }));
    expect(onReorderLayers).toHaveBeenCalledWith(0, 1);
  });

  // (c) INTERACTION — toggling visibility + lock persists via onUpdateLayer.
  it("toggles visibility and lock through onUpdateLayer", () => {
    const onUpdateLayer = vi.fn();
    render(
      <LayerTree
        layers={[makeLayer("l1", { visible: true, locked: false })]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={onUpdateLayer}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Hide layer" }));
    expect(onUpdateLayer).toHaveBeenCalledWith("l1", { visible: false });

    fireEvent.click(screen.getByRole("button", { name: "Lock layer" }));
    expect(onUpdateLayer).toHaveBeenCalledWith("l1", { locked: true });
  });

  // (c) INTERACTION — switching machine profile updates chip color options.
  // The selector at the top emits the new profile id; the host re-maps the
  // operation library, and the chips reflect the remapped colors. Here we drive
  // the remap in a harness (matching how Studio will wire it) and assert the
  // chip color follows the active profile.
  it("updates chip color options when the machine profile switches", () => {
    function Harness() {
      const [profileId, setProfileId] = useState("plotter");
      // Start on an editable (plotter) profile with a custom green operation
      // color — i.e. NOT the locked laser convention.
      const [operations, setOperations] = useState(() =>
        seedOperations().map((o) => (o.id === "op-cut" ? { ...o, color: "#00FF00" } : o))
      );
      const layers = [makeLayer("l1", { operationId: "op-cut" })];
      const onProfileChange = (next) => {
        setProfileId(next);
        setOperations((ops) => remapOperationsToProfile(ops, next));
      };
      return (
        <LayerTree
          layers={layers}
          operations={operations}
          profileId={profileId}
          selectedLayerId={null}
          onSelectLayer={() => {}}
          onUpdateLayer={() => {}}
          onReorderLayers={() => {}}
          onProfileChange={onProfileChange}
        />
      );
    }
    render(<Harness />);
    // Plotter: editable color shows through (custom green).
    let swatch = screen.getByTestId("operation-chip").querySelector("[data-chip-swatch]");
    expect(swatch).toHaveStyle({ backgroundColor: "#00FF00" });

    // Switch to Laser: cut color is now LOCKED to the red convention.
    fireEvent.change(screen.getByRole("combobox", { name: "Machine profile" }), {
      target: { value: "laser" },
    });
    swatch = screen.getByTestId("operation-chip").querySelector("[data-chip-swatch]");
    expect(swatch).toHaveStyle({ backgroundColor: "#FF0000" });
  });

  // (d) SELECTION — clicking a row sets the selected layer id.
  it("calls onSelectLayer with the row's id when clicked", () => {
    const onSelectLayer = vi.fn();
    render(
      <LayerTree
        layers={[makeLayer("l1", { name: "A" }), makeLayer("l2", { name: "B" })]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={onSelectLayer}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
      />
    );
    fireEvent.click(screen.getAllByTestId("layer-row")[1]);
    expect(onSelectLayer).toHaveBeenCalledWith("l2");
  });

  // (e) ROW LAYOUT (spec §3) — inline order is
  //   [reorder] glyph name op-swatch 🎲 👁 🔒 ⋯
  // asserted by DOM position so the ordering is actually pinned. Inline
  // dup/download/delete are GONE (they live only in the ⋯ menu now), and the
  // legacy rand-SEED die is removed entirely (§3.1).
  it("lays the row out as [reorder] glyph name op-swatch dice eye lock more, with no rand-seed and no inline dup/download/delete", () => {
    render(
      <LayerTree
        layers={[makeLayer("l1", { name: "A" })]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
        onRandomizeLayerParams={() => {}}
        onDuplicateLayer={() => {}}
        onExportLayer={() => {}}
        onDeleteLayer={() => {}}
      />
    );
    const row = screen.getByTestId("layer-row");

    const reorder = within(row).getByLabelText("Reorder layer");
    const chip = within(row).getByTestId("operation-chip");
    const dice = within(row).getByRole("button", { name: "Randomize layer params" });
    const eye = within(row).getByRole("button", { name: /Hide layer|Show layer/ });
    const lock = within(row).getByRole("button", { name: /Lock layer|Unlock layer/ });
    const more = within(row).getByRole("button", { name: "Row actions" });

    // Helper: a precedes b in document order.
    const precedes = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(precedes(reorder, chip)).toBe(true);
    expect(precedes(chip, dice)).toBe(true);
    expect(precedes(dice, eye)).toBe(true);
    expect(precedes(eye, lock)).toBe(true);
    expect(precedes(lock, more)).toBe(true);

    // No rand-SEED die anywhere (removed by §3.1).
    expect(within(row).queryByRole("button", { name: "Randomize layer" })).not.toBeInTheDocument();
    // Inline dup/download/delete are gone from the row (only behind ⋯).
    expect(within(row).queryByRole("button", { name: "Duplicate layer" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Export layer" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Download layer" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Delete layer" })).not.toBeInTheDocument();
  });

  // (e) ROW LAYOUT — the op element shows the swatch + initial only (no inline
  // operation-name text), with the full name in its title.
  it("renders the op element as swatch + initial only, full name in title", () => {
    render(
      <LayerTree
        layers={[makeLayer("l1", { operationId: "op-engrave" })]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
      />
    );
    const chip = screen.getByTestId("operation-chip");
    expect(chip).toHaveTextContent("E");
    expect(chip).not.toHaveTextContent("Engrave");
    expect(chip).toHaveAttribute("title", expect.stringContaining("Engrave"));
    expect(chip.querySelector("[data-chip-swatch]")).toBeInTheDocument();
  });

  // (e) RESPONSIVE (spec §3.2) — below 240px the dice is hidden. Mechanism: a
  // `compact` boolean prop (no container-query plugin is installed on this
  // Tailwind v3 build). When compact, the dice is not rendered; eye/lock/⋯ and
  // the op-swatch stay.
  it("hides the dice when compact, keeping eye/lock/more and the op-swatch", () => {
    render(
      <LayerTree
        layers={[makeLayer("l1")]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
        onRandomizeLayerParams={() => {}}
        compact
      />
    );
    const row = screen.getByTestId("layer-row");
    expect(within(row).queryByRole("button", { name: "Randomize layer params" })).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Hide layer|Show layer/ })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Lock layer|Unlock layer/ })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Row actions" })).toBeInTheDocument();
    expect(within(row).getByTestId("operation-chip")).toBeInTheDocument();
  });

  // (e) ONE MENU AT A TIME — opening row B's ⋯ closes row A's.
  it("keeps only one row menu open at a time", () => {
    render(
      <LayerTree
        layers={[makeLayer("l1", { name: "A" }), makeLayer("l2", { name: "B" })]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
        onDuplicateLayer={() => {}}
      />
    );
    const rows = screen.getAllByTestId("layer-row");
    fireEvent.click(within(rows[0]).getByRole("button", { name: "Row actions" }));
    expect(within(rows[0]).getByTestId("row-menu")).toBeInTheDocument();

    fireEvent.click(within(rows[1]).getByRole("button", { name: "Row actions" }));
    expect(within(rows[1]).getByTestId("row-menu")).toBeInTheDocument();
    expect(within(rows[0]).queryByTestId("row-menu")).not.toBeInTheDocument();
  });

  // (e) ⋯ toggles its OWN menu shut. The real-browser path is mousedown (RowMenu's
  // WI-4 click-away) then click (the toggle); the trigger stops mousedown reaching
  // document so the menu doesn't pre-close and reopen. This drives that sequence.
  it("toggles a row's own menu closed when its ⋯ is clicked again", () => {
    render(
      <LayerTree
        layers={[makeLayer("l1", { name: "A" })]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
        onDuplicateLayer={() => {}}
      />
    );
    const row = screen.getByTestId("layer-row");
    const trigger = within(row).getByRole("button", { name: "Row actions" });
    fireEvent.click(trigger);
    expect(within(row).getByTestId("row-menu")).toBeInTheDocument();
    // Real-browser open→close: mousedown (would trip click-away) then click.
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    expect(within(row).queryByTestId("row-menu")).not.toBeInTheDocument();
  });

  // The Document Setup gear beside the machine selector opens the dialog.
  it("invokes onDocumentSetup when the machine gear is clicked", () => {
    const onDocumentSetup = vi.fn();
    render(
      <LayerTree
        layers={[makeLayer("l1")]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
        onDocumentSetup={onDocumentSetup}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Document setup" }));
    expect(onDocumentSetup).toHaveBeenCalledTimes(1);
  });

  // Back-compat: omitting onDocumentSetup hides the gear (no crash).
  it("renders no gear when onDocumentSetup is omitted", () => {
    render(
      <LayerTree
        layers={[makeLayer("l1")]}
        operations={seedOperations()}
        profileId="laser"
        selectedLayerId={null}
        onSelectLayer={() => {}}
        onUpdateLayer={() => {}}
        onReorderLayers={() => {}}
        onProfileChange={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: "Document setup" })).not.toBeInTheDocument();
  });
});
