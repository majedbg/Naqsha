// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import Inspector from "./Inspector";
import ModulationParamBox from "../ui/ModulationParamBox";
import { DEFAULT_PARAMS } from "../../constants";

// Inspector composes PatternParams which reads the gate via useAuth. Mock it to a
// studio tier so the full grid param schema is visible (mirrors Inspector.test.jsx).
let mockTier = "studio";
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// FieldOverlay paints into a 2D canvas in a useEffect — jsdom has no canvas
// backend, so stub it (same approach as ModulatorRange.test.jsx). We keep the real
// resolveModulationForTarget / fieldForLayer so the conditional gating is exercised
// for real — that gating is the whole point of these two sites.
vi.mock("../FieldOverlay", () => ({
  default: () => <div data-testid="field-overlay-stub" />,
}));

function makeLayer(id, patternType, name, extra = {}) {
  return {
    id,
    name: name || id,
    patternType,
    params: { ...DEFAULT_PARAMS[patternType] },
    randomizeKeys: [],
    paramsCache: {},
    ...extra,
  };
}

// Harness owning layers + selection so an edit round-trips through the real
// onUpdateLayer path (updateLayer -> setLayers -> rerender), like Studio.
function Harness({ initialLayers, initialSelectedId, onUpdateSpy }) {
  const [layers, setLayers] = useState(initialLayers);
  const [selectedLayerId] = useState(initialSelectedId);
  const updateLayer = (id, patch) => {
    onUpdateSpy?.(id, patch);
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  return (
    <Inspector
      layers={layers}
      selectedLayerId={selectedLayerId}
      onUpdateLayer={updateLayer}
      onChangeLayerPattern={() => {}}
    />
  );
}

// A grid layer with a DECOY sibling param (spacing: 40) so we can assert the
// warpNodes write spreads siblings rather than clobbering them.
function gridLayer(id = "grid1") {
  return makeLayer(id, "grid", "Grid", {
    params: { ...DEFAULT_PARAMS.grid, warpNodes: 6, spacing: 40 },
  });
}

// A chladni guide (canProduceField → true, fieldForLayer builds a real field) whose
// modulator warps the given grid. This is the minimal REAL setup that satisfies
// resolveModulationForTarget for a 'warp'→grid map.
function warpGuide(gridId, id = "guide1") {
  return makeLayer(id, "chladni", "Guide", {
    modulator: {
      maps: [{ targetLayerId: gridId, channel: "warp", amount: 1 }],
    },
  });
}

beforeEach(() => {
  mockTier = "studio";
});

describe("ModulationParamBox — presentational contract", () => {
  it("renders the owner label and wraps its children", () => {
    render(
      <ModulationParamBox owner="Modulation">
        <button>inner control</button>
      </ModulationParamBox>
    );
    expect(screen.getByTestId("modulation-param-box")).toBeInTheDocument();
    expect(screen.getByText("Modulation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "inner control" })
    ).toBeInTheDocument();
  });
});

describe("warpNodes modulation param — conditional gating (§5)", () => {
  it("does NOT render for a grid that is not an active warp target (neither site)", () => {
    // Grid selected, but no modulator maps to it → Site B hidden.
    render(
      <Harness
        initialLayers={[gridLayer("g1")]}
        initialSelectedId="g1"
      />
    );
    expect(screen.queryByTestId("modulation-param-box")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: "Warp nodes" })
    ).not.toBeInTheDocument();
  });

  it("does NOT render in the modulator row when the map targets a non-grid (Site A hidden)", () => {
    // A chladni guide warping a topographic target (also a 'warp' consumer) — the
    // box is grid-only, so the modulator row must not show it.
    const topo = makeLayer("t1", "topographic", "Topo");
    const guide = makeLayer("g1", "chladni", "Guide", {
      modulator: { maps: [{ targetLayerId: "t1", channel: "warp", amount: 1 }] },
    });
    render(
      <Harness initialLayers={[guide, topo]} initialSelectedId="g1" />
    );
    // ModulatorDevice IS shown (guide selected), but no warp-nodes box.
    expect(screen.getByTestId("modulator-device")).toBeInTheDocument();
    expect(screen.queryByTestId("modulation-param-box")).not.toBeInTheDocument();
  });

  it("Site B: grid panel shows the box for an active warp target and edits warpNodes, spreading siblings", () => {
    const onUpdateSpy = vi.fn();
    render(
      <Harness
        initialLayers={[warpGuide("g1"), gridLayer("g1")]}
        initialSelectedId="g1"
        onUpdateSpy={onUpdateSpy}
      />
    );
    expect(screen.getByTestId("modulation-param-box")).toBeInTheDocument();
    expect(screen.getByText("Modulation")).toBeInTheDocument();

    const slider = screen.getByRole("slider", { name: "Warp nodes" });
    fireEvent.change(slider, { target: { value: "11" } });

    expect(onUpdateSpy).toHaveBeenCalled();
    const [id, patch] = onUpdateSpy.mock.calls.at(-1);
    expect(id).toBe("g1");
    expect(patch.params.warpNodes).toBe(11);
    // The decoy sibling survives the shallow top-level merge (spread required).
    expect(patch.params.spacing).toBe(40);

    // Re-render reflects the new value on the live slider.
    expect(screen.getByRole("slider", { name: "Warp nodes" })).toHaveValue("11");
  });

  it("Site A: modulator row shows the box for a warp→grid map and edits the target grid's warpNodes, spreading siblings", () => {
    const onUpdateSpy = vi.fn();
    render(
      <Harness
        initialLayers={[warpGuide("grid1"), gridLayer("grid1")]}
        initialSelectedId="guide1" // select the GUIDE → ModulatorDevice renders
        onUpdateSpy={onUpdateSpy}
      />
    );
    expect(screen.getByTestId("modulator-device")).toBeInTheDocument();
    expect(screen.getByTestId("modulation-param-box")).toBeInTheDocument();
    // Owner label reads "Grid layer" at this site (belongs to the grid).
    expect(screen.getByText("Grid layer")).toBeInTheDocument();

    const slider = screen.getByRole("slider", { name: "Warp nodes" });
    fireEvent.change(slider, { target: { value: "9" } });

    expect(onUpdateSpy).toHaveBeenCalled();
    const [id, patch] = onUpdateSpy.mock.calls.at(-1);
    expect(id).toBe("grid1"); // writes the TARGET grid, not the guide
    expect(patch.params.warpNodes).toBe(9);
    expect(patch.params.spacing).toBe(40);
  });
});
