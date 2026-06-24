// @vitest-environment jsdom
//
// WI-9 — per-row connection badges + the "stacked" affordance (PRD D6).
// Each LayerRow shows small `→N` (outgoing / drives N) and `←N` (incoming /
// driven by N) badges from the modulation graph counts; a badge is omitted when
// its count is 0. A target with >1 incoming guide also shows a forward-compat
// "N sources · 1 active" affordance (Phase-2b stacking).
//
// jsdom-safe: these assertions read DOM text + element presence only — no
// geometry.

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import LayerTree from "./LayerTree";
import { seedOperations } from "../../lib/operations";

function makeGuide(id, maps, { range = { min: 0, max: 1 }, name } = {}) {
  return {
    id,
    name: name || id,
    patternType: "topographic",
    params: {},
    seed: 1,
    visible: true,
    locked: false,
    operationId: "op-cut",
    modulator: { range, maps },
  };
}

function makeTarget(id, { name } = {}) {
  return {
    id,
    name: name || id,
    patternType: "grainfield",
    params: {},
    visible: true,
    locked: false,
    operationId: "op-cut",
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

// Find the layer-row whose name span matches `name`.
function rowByName(name) {
  return screen
    .getAllByTestId("layer-row")
    .find((r) => within(r).queryByText(name));
}

describe("LayerTree — connection badges (WI-9, PRD D6)", () => {
  it("shows →N on a guide and ←N on each single-mapped target", () => {
    const g = makeGuide("g", [
      { targetLayerId: "t1", amount: 1 },
      { targetLayerId: "t2", amount: 1 },
    ], { name: "Guide" });
    render(
      <LayerTree
        {...baseProps({
          layers: [g, makeTarget("t1", { name: "T1" }), makeTarget("t2", { name: "T2" })],
        })}
      />
    );

    const guideRow = rowByName("Guide");
    expect(within(guideRow).getByTestId("badge-out")).toHaveTextContent("→2");
    // A pure guide drives but isn't driven → no incoming badge.
    expect(within(guideRow).queryByTestId("badge-in")).toBeNull();

    const t1Row = rowByName("T1");
    expect(within(t1Row).getByTestId("badge-in")).toHaveTextContent("←1");
    expect(within(t1Row).queryByTestId("badge-out")).toBeNull();

    const t2Row = rowByName("T2");
    expect(within(t2Row).getByTestId("badge-in")).toHaveTextContent("←1");
  });

  it("omits both badges on a layer with no modulation relationship", () => {
    const g = makeGuide("g", [{ targetLayerId: "t1", amount: 1 }], { name: "Guide" });
    render(
      <LayerTree
        {...baseProps({
          layers: [
            g,
            makeTarget("t1", { name: "T1" }),
            makeTarget("lonely", { name: "Lonely" }),
          ],
        })}
      />
    );
    const lonely = rowByName("Lonely");
    expect(within(lonely).queryByTestId("badge-out")).toBeNull();
    expect(within(lonely).queryByTestId("badge-in")).toBeNull();
  });

  it("shows a 'N sources · 1 active' affordance on a target mapped by 2 guides", () => {
    const g1 = makeGuide("g1", [{ targetLayerId: "t", amount: 1 }], { name: "G1" });
    const g2 = makeGuide("g2", [{ targetLayerId: "t", amount: 1 }], { name: "G2" });
    render(
      <LayerTree
        {...baseProps({
          layers: [g1, g2, makeTarget("t", { name: "Shared" })],
        })}
      />
    );

    const sharedRow = rowByName("Shared");
    expect(within(sharedRow).getByTestId("badge-in")).toHaveTextContent("←2");
    const stacked = within(sharedRow).getByTestId("stacked-sources");
    expect(stacked).toHaveTextContent("2 sources");
    expect(stacked).toHaveTextContent("1 active");

    // A single-source target gets NO stacked affordance.
    const g3 = makeGuide("g3", [{ targetLayerId: "solo", amount: 1 }], { name: "G3" });
    render(
      <LayerTree
        {...baseProps({ layers: [g3, makeTarget("solo", { name: "Solo" })] })}
      />
    );
    const soloRow = rowByName("Solo");
    expect(within(soloRow).queryByTestId("stacked-sources")).toBeNull();
  });
});
