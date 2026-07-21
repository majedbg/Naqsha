// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import Inspector from "./Inspector";
import { DEFAULT_PARAMS } from "../../constants";

// Contract under test (traced from the output pipeline — see offsetVisibility.js):
//   The device-level Offset knob only biases output on maps whose channel is
//   'density' (GrainField → densityWeight → modulationTransfer `+offset`) or
//   'distort' (Spiral.js → modulationTransfer `+offset`). 'warp' (warp.js uses
//   only cfg.amount) and 'lattice' (no field-transfer knobs) IGNORE offset, and
//   an unmapped modulator has nothing to bias. So the Offset row is shown iff
//   offsetAffectsOutput(modulator) === maps.some(density|distort). And the
//   heatmap readout only previews offset when it actually affects output, so the
//   preview never shows a bias the plot won't honor.

let mockTier = "studio";
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// Stub FieldOverlay (jsdom has no canvas backend) and record props so we can
// assert the offset threaded into the live readout.
const fieldOverlayProps = [];
vi.mock("../FieldOverlay", () => ({
  default: (props) => {
    fieldOverlayProps.push(props);
    return <div data-testid="field-overlay-stub" />;
  },
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

// A chladni guide (produces a field ⇒ ModulatorDevice renders) mapping to a
// target of the given pattern type. Pre-seeding the map avoids the add-target UI.
function guideWith(targetType, channel, modExtra = {}) {
  const guide = makeLayer("g", "chladni", "Guide", {
    modulator: {
      offset: 0.4,
      maps: [{ targetLayerId: "t", channel, amount: 1 }],
      ...modExtra,
    },
  });
  const target = makeLayer("t", targetType, "Target");
  return [guide, target];
}

beforeEach(() => {
  mockTier = "studio";
  fieldOverlayProps.length = 0;
});

describe("ModulatorDevice — Offset row visibility (offset-does-nothing fix)", () => {
  it("shows the Offset control for a density target (GrainField consumes offset)", () => {
    render(
      <Harness
        initialLayers={guideWith("grainfield", "density")}
        initialSelectedId="g"
      />
    );
    expect(screen.getByTestId("modulator-offset")).toBeInTheDocument();
    expect(screen.getByLabelText("Offset")).toBeInTheDocument();
  });

  it("shows the Offset control for a distort target (Spiral consumes offset)", () => {
    render(
      <Harness
        initialLayers={guideWith("spiral", "distort")}
        initialSelectedId="g"
      />
    );
    expect(screen.getByTestId("modulator-offset")).toBeInTheDocument();
  });

  it("HIDES the Offset control for a warp-only target (warp ignores offset)", () => {
    render(
      <Harness
        initialLayers={guideWith("topographic", "warp")}
        initialSelectedId="g"
      />
    );
    expect(screen.queryByTestId("modulator-offset")).toBeNull();
    // Shape/Steps are out of scope for this fix and stay put.
    expect(screen.getByTestId("modulator-steps")).toBeInTheDocument();
  });

  it("HIDES the Offset control when no target is mapped", () => {
    const guide = makeLayer("g", "chladni", "Guide", {
      modulator: { offset: 0.4, maps: [] },
    });
    render(
      <Harness initialLayers={[guide]} initialSelectedId="g" />
    );
    expect(screen.getByTestId("modulator-device")).toBeInTheDocument();
    expect(screen.queryByTestId("modulator-offset")).toBeNull();
  });

  it("threads the stored offset into FieldOverlay when it affects output", () => {
    render(
      <Harness
        initialLayers={guideWith("grainfield", "density")}
        initialSelectedId="g"
      />
    );
    expect(fieldOverlayProps.at(-1).offset).toBeCloseTo(0.4);
  });

  it("passes offset 0 to FieldOverlay when offset does NOT affect output (preview never lies)", () => {
    render(
      <Harness
        initialLayers={guideWith("topographic", "warp")}
        initialSelectedId="g"
      />
    );
    // Even though modulator.offset is 0.4, the warp plot won't honor it, so the
    // readout must not show the bias.
    expect(fieldOverlayProps.at(-1).offset ?? 0).toBe(0);
  });

  it("dragging Offset updates the value the readout previews (live bias)", () => {
    render(
      <Harness
        initialLayers={guideWith("grainfield", "density")}
        initialSelectedId="g"
      />
    );
    fireEvent.change(screen.getByTestId("modulator-offset"), {
      target: { value: "-0.6" },
    });
    expect(fieldOverlayProps.at(-1).offset).toBeCloseTo(-0.6);
  });
});
