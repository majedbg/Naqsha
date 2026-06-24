// @vitest-environment jsdom
//
// WI-8 — the git-graph modulation rail in LayerTree (PRD D6). A continuous ~18px
// left gutter draws an SVG bezier edge from each guide row down to every target
// it modulates, colored by polarity, dimmed by default, brightened when incident
// to the selected layer. The gutter spans BOTH the flat and grouped tiers (one
// continuous column → cross-panel relationships route naturally).
//
// jsdom TESTABILITY CONTRACT: jsdom reports 0 for getBoundingClientRect/offsetTop,
// so the bezier `d` string is meaningless here. These tests therefore assert
// STRUCTURE — element count, data attributes, emphasis class — and NEVER the `d`
// value or any measured geometry.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LayerTree from "./LayerTree";
import { seedOperations } from "../../lib/operations";

// A topographic guide CAN produce a field (canProduceField). Its modulator maps
// drive the edges. `range` sets polarity (here attract → +1 → garnet).
function makeGuide(id, maps, { range = { min: 0, max: 1 }, name, panelId } = {}) {
  return {
    id,
    name: name || id,
    patternType: "topographic",
    params: {},
    seed: 1,
    visible: true,
    locked: false,
    operationId: "op-cut",
    panelId,
    modulator: { range, maps },
  };
}

function makeTarget(id, { name, panelId } = {}) {
  return {
    id,
    name: name || id,
    patternType: "grainfield",
    params: {},
    visible: true,
    locked: false,
    operationId: "op-cut",
    panelId,
  };
}

function baseProps(extra = {}) {
  return {
    operations: seedOperations(),
    profileId: "laser",
    selectedLayerId: null,
    onSelectLayer: vi.fn(),
    onUpdateLayer: vi.fn(),
    onReorderLayers: vi.fn(),
    onProfileChange: vi.fn(),
    ...extra,
  };
}

describe("LayerTree — modulation rail (WI-8, PRD D6)", () => {
  it("renders exactly one modulation-edge per map with correct guide/target attrs", () => {
    const g = makeGuide("g", [
      { targetLayerId: "t1", amount: 1 },
      { targetLayerId: "t2", amount: 1 },
    ]);
    render(
      <LayerTree
        {...baseProps({ layers: [g, makeTarget("t1"), makeTarget("t2")] })}
      />
    );
    const edges = screen.getAllByTestId("modulation-edge");
    expect(edges).toHaveLength(2);

    const targets = edges.map((e) => e.getAttribute("data-target")).sort();
    expect(targets).toEqual(["t1", "t2"]);
    for (const e of edges) {
      expect(e).toHaveAttribute("data-guide", "g");
      // attract polarity → +1
      expect(e).toHaveAttribute("data-polarity", "1");
    }
  });

  it("emphasizes edges incident to the selected layer, dims the rest", () => {
    const g = makeGuide("g", [{ targetLayerId: "t1", amount: 1 }]);
    const other = makeGuide("g2", [{ targetLayerId: "t2", amount: 1 }]);
    const { rerender } = render(
      <LayerTree
        {...baseProps({
          layers: [g, other, makeTarget("t1"), makeTarget("t2")],
          selectedLayerId: null,
        })}
      />
    );
    // With nothing selected, no edge carries the emphasis marker.
    expect(
      screen.getAllByTestId("modulation-edge").filter(
        (e) => e.getAttribute("data-emphasis") === "true"
      )
    ).toHaveLength(0);

    // Selecting the guide brightens its incident edge(s).
    rerender(
      <LayerTree
        {...baseProps({
          layers: [g, other, makeTarget("t1"), makeTarget("t2")],
          selectedLayerId: "g",
        })}
      />
    );
    const edges = screen.getAllByTestId("modulation-edge");
    const gEdge = edges.find((e) => e.getAttribute("data-guide") === "g");
    const otherEdge = edges.find((e) => e.getAttribute("data-guide") === "g2");
    expect(gEdge).toHaveAttribute("data-emphasis", "true");
    expect(otherEdge).toHaveAttribute("data-emphasis", "false");
  });

  it("renders a cross-panel edge: guide in one panel, target in another", () => {
    const g = makeGuide("g", [{ targetLayerId: "t1", amount: 1 }], { panelId: "p1" });
    const t = makeTarget("t1", { panelId: "p2" });
    render(
      <LayerTree
        {...baseProps({
          layers: [g, t],
          panels: [
            { id: "p1", name: "Panel 1", order: 0, visible: true, substrate: {} },
            { id: "p2", name: "Panel 2", order: 1, visible: true, substrate: {} },
          ],
          onAddPanel: vi.fn(),
          onDeletePanel: vi.fn(),
          onUpdatePanel: vi.fn(),
          onAssignLayerToPanel: vi.fn(),
        })}
      />
    );
    const edges = screen.getAllByTestId("modulation-edge");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toHaveAttribute("data-guide", "g");
    expect(edges[0]).toHaveAttribute("data-target", "t1");
  });

  it("renders NO edges and no gutter when no layer modulates", () => {
    render(
      <LayerTree
        {...baseProps({ layers: [makeTarget("t1"), makeTarget("t2")] })}
      />
    );
    expect(screen.queryByTestId("modulation-edge")).toBeNull();
    expect(screen.queryByTestId("modulation-rail")).toBeNull();
  });
});
