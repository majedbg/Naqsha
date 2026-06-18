// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import Inspector from "./Inspector";
import { DEFAULT_PARAMS } from "../../constants";

// Inspector composes PatternTabs + PatternParams, both of which read the gate via
// useAuth. Mock useAuth (NOT useGate) so the real checkGate runs against a known
// tier — matching the convention in PatternParams.gate.test.jsx. Use "studio" so
// every param is visible (no guest gating obscuring the schema assertions).
let mockTier = "studio";
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// Build a minimal layer matching useLayers' shape for a given pattern type.
function makeLayer(id, patternType, name) {
  return {
    id,
    name: name || id,
    patternType,
    params: { ...DEFAULT_PARAMS[patternType] },
    randomizeKeys: [],
    paramsCache: {},
  };
}

// Harness that owns the layers + selection so an edit round-trips through the
// real onUpdateLayer path (mirroring Studio's updateLayer -> setLayers -> rerender).
function Harness({ initialLayers, initialSelectedId, onUpdateSpy }) {
  const [layers, setLayers] = useState(initialLayers);
  const [selectedLayerId] = useState(initialSelectedId);
  const updateLayer = (id, patch) => {
    onUpdateSpy?.(id, patch);
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const changeLayerPattern = (id, patch) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  return (
    <Inspector
      layers={layers}
      selectedLayerId={selectedLayerId}
      onUpdateLayer={updateLayer}
      onChangeLayerPattern={changeLayerPattern}
    />
  );
}

beforeEach(() => {
  mockTier = "studio";
});

describe("Inspector (B3 — selection-driven param inspector)", () => {
  // (a) RENDER — inspector shows the selected pattern's param schema.
  it("renders the selected layer's param schema", () => {
    render(
      <Inspector
        layers={[makeLayer("l1", "flowfield", "Flow")]}
        selectedLayerId="l1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    // Pattern-type controls (swap) are present at the top: the active pattern's
    // own tab is rendered as a button.
    expect(
      screen.getByRole("button", { name: /Flow Field/i })
    ).toBeInTheDocument();
    // Flowfield's param sliders render (these come straight from PATTERN_PARAM_DEFS).
    for (const name of ["Particle Count", "Step Length", "Noise Scale"]) {
      expect(screen.getByRole("slider", { name })).toBeInTheDocument();
    }
  });

  // (b) INTERACTION — editing a param updates layer state + triggers re-render.
  it("editing a param calls onUpdateLayer with the selected id and merged params", () => {
    const onUpdateSpy = vi.fn();
    render(
      <Harness
        initialLayers={[makeLayer("l1", "flowfield", "Flow")]}
        initialSelectedId="l1"
        onUpdateSpy={onUpdateSpy}
      />
    );
    const slider = screen.getByRole("slider", { name: "Particle Count" });
    fireEvent.change(slider, { target: { value: "1500" } });

    expect(onUpdateSpy).toHaveBeenCalled();
    const [id, patch] = onUpdateSpy.mock.calls[onUpdateSpy.mock.calls.length - 1];
    expect(id).toBe("l1");
    expect(patch.params.particleCount).toBe(1500);
    // Siblings preserved through the merge.
    expect(patch.params.stepLength).toBe(DEFAULT_PARAMS.flowfield.stepLength);

    // Re-render reflects the new value on the live slider.
    expect(
      screen.getByRole("slider", { name: "Particle Count" })
    ).toHaveValue("1500");
  });

  // (c) INTERACTION — changing selection repopulates the inspector.
  it("repopulates the inspector when the selected id points at a different pattern", () => {
    const layers = [
      makeLayer("l1", "flowfield", "Flow"),
      makeLayer("l2", "spirograph", "Spiro"),
    ];
    const { rerender } = render(
      <Inspector
        layers={layers}
        selectedLayerId="l1"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    expect(
      screen.getByRole("slider", { name: "Particle Count" })
    ).toBeInTheDocument();

    rerender(
      <Inspector
        layers={layers}
        selectedLayerId="l2"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    // Spirograph schema is now shown; flowfield's Particle Count is gone.
    expect(
      screen.queryByRole("slider", { name: "Particle Count" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Revolutions" })
    ).toBeInTheDocument();
  });

  // (d) EDGE — empty/neutral state with no selection.
  it("shows a neutral document state when nothing is selected", () => {
    render(
      <Inspector
        layers={[makeLayer("l1", "flowfield", "Flow")]}
        selectedLayerId={null}
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
      />
    );
    // Neutral state: no param sliders, and an explicit empty-state hint.
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(screen.getByTestId("inspector-empty")).toBeInTheDocument();
  });
});
