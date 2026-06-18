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

    const chip1 = within(rows[0]).getByTestId("operation-chip");
    expect(chip1).toHaveTextContent("Cut");
    expect(chip1.querySelector("[data-chip-swatch]")).toHaveStyle({
      backgroundColor: "#FF0000",
    });

    const chip2 = within(rows[1]).getByTestId("operation-chip");
    expect(chip2).toHaveTextContent("Score");
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
    expect(chip).toHaveTextContent("Cut");
    expect(chip.querySelector("[data-chip-swatch]")).toHaveStyle({ backgroundColor: "#FF0000" });

    fireEvent.click(screen.getByRole("button", { name: "reassign" }));

    const chipAfter = screen.getByTestId("operation-chip");
    expect(chipAfter).toHaveTextContent("Engrave");
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
});
