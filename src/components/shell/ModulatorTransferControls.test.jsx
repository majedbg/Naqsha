// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import Inspector from "./Inspector";
import { DEFAULT_PARAMS } from "../../constants";

// Contract under test (traced from the output pipeline — see transferVisibility.js):
//   The device-level TRANSFER controls (Offset / Shape / Steps) all run through
//   modulationTransfer, so they share one profile: they affect output only on
//   maps whose channel is 'density' (GrainField → densityWeight →
//   modulationTransfer) or 'distort' (Spiral.js → modulationTransfer). 'warp'
//   (warp.js uses only cfg.amount) and 'lattice' (no field-transfer knobs) run
//   NONE of them, and an unmapped modulator has nothing to shape. So all three
//   rows are shown iff transferControlsAffectOutput(modulator) ===
//   maps.some(density|distort). The heatmap readout previews offset/shape/steps
//   only when they actually affect output, so it never lies.

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
      shape: 0.5,
      steps: 6,
      maps: [{ targetLayerId: "t", channel, amount: 1 }],
      ...modExtra,
    },
  });
  const target = makeLayer("t", targetType, "Target");
  return [guide, target];
}

// The three device-level transfer rows, by their stable handles.
const OFFSET = "modulator-offset";
const STEPS = "modulator-steps";
const SHAPE = "shape-curve"; // ShapeCurve's testid

beforeEach(() => {
  mockTier = "studio";
  fieldOverlayProps.length = 0;
});

describe("ModulatorDevice — transfer-control visibility (offset/shape/steps do-nothing fix)", () => {
  it("shows all three transfer controls for a density target (GrainField consumes them)", () => {
    render(
      <Harness
        initialLayers={guideWith("grainfield", "density")}
        initialSelectedId="g"
      />
    );
    expect(screen.getByTestId(OFFSET)).toBeInTheDocument();
    expect(screen.getByLabelText("Offset")).toBeInTheDocument();
    expect(screen.getByTestId(SHAPE)).toBeInTheDocument();
    expect(screen.getByTestId(STEPS)).toBeInTheDocument();
  });

  it("shows all three transfer controls for a distort target (Spiral consumes them)", () => {
    render(
      <Harness
        initialLayers={guideWith("spiral", "distort")}
        initialSelectedId="g"
      />
    );
    expect(screen.getByTestId(OFFSET)).toBeInTheDocument();
    expect(screen.getByTestId(SHAPE)).toBeInTheDocument();
    expect(screen.getByTestId(STEPS)).toBeInTheDocument();
  });

  it("HIDES all three transfer controls for a warp-only target (warp runs none of them)", () => {
    render(
      <Harness
        initialLayers={guideWith("topographic", "warp")}
        initialSelectedId="g"
      />
    );
    expect(screen.queryByTestId(OFFSET)).toBeNull();
    expect(screen.queryByTestId(SHAPE)).toBeNull();
    expect(screen.queryByTestId(STEPS)).toBeNull();
  });

  it("HIDES all three transfer controls when no target is mapped (device still renders)", () => {
    const guide = makeLayer("g", "chladni", "Guide", {
      modulator: { offset: 0.4, shape: 0.5, steps: 6, maps: [] },
    });
    render(<Harness initialLayers={[guide]} initialSelectedId="g" />);
    expect(screen.getByTestId("modulator-device")).toBeInTheDocument();
    expect(screen.queryByTestId(OFFSET)).toBeNull();
    expect(screen.queryByTestId(SHAPE)).toBeNull();
    expect(screen.queryByTestId(STEPS)).toBeNull();
  });

  it("threads offset/shape/steps into FieldOverlay when they affect output", () => {
    render(
      <Harness
        initialLayers={guideWith("grainfield", "density")}
        initialSelectedId="g"
      />
    );
    const p = fieldOverlayProps.at(-1);
    expect(p.offset).toBeCloseTo(0.4);
    expect(p.shape).toBeCloseTo(0.5);
    expect(p.steps).toBe(6);
  });

  it("passes neutral offset/shape/steps to FieldOverlay when they do NOT affect output (preview never lies)", () => {
    render(
      <Harness
        initialLayers={guideWith("topographic", "warp")}
        initialSelectedId="g"
      />
    );
    // Stored values are 0.4/0.5/6, but the warp plot honors none of them, so the
    // readout must show a neutral field.
    const p = fieldOverlayProps.at(-1);
    expect(p.offset ?? 0).toBe(0);
    expect(p.shape ?? 0).toBe(0);
    expect(p.steps ?? 0).toBe(0);
  });

  it("dragging Offset updates the value the readout previews (live bias)", () => {
    render(
      <Harness
        initialLayers={guideWith("grainfield", "density")}
        initialSelectedId="g"
      />
    );
    fireEvent.change(screen.getByTestId(OFFSET), {
      target: { value: "-0.6" },
    });
    expect(fieldOverlayProps.at(-1).offset).toBeCloseTo(-0.6);
  });

  it("dragging Steps updates the value the readout previews (live terrace)", () => {
    render(
      <Harness
        initialLayers={guideWith("grainfield", "density")}
        initialSelectedId="g"
      />
    );
    fireEvent.change(screen.getByTestId(STEPS), {
      target: { value: "10" },
    });
    expect(fieldOverlayProps.at(-1).steps).toBe(10);
  });
});
