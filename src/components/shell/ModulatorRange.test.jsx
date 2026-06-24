// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import Inspector from "./Inspector";
import { DEFAULT_PARAMS } from "../../constants";

// Inspector composes PatternTabs + PatternParams, which read the gate via useAuth.
// Mock useAuth (studio tier) so the schema is fully visible, mirroring Inspector.test.jsx.
let mockTier = "studio";
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// FieldOverlay paints into a 2D canvas (createImageData) in a useEffect — jsdom has
// no canvas backend, so we stub it. The stub records props so we can assert that the
// device-level `range` is threaded through for the live plot recolor.
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

// Harness owning layers + selection so edits round-trip through the real
// onUpdateLayer path (mirroring Studio's updateLayer -> setLayers -> rerender).
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

// A chladni guide (produces a field => ModulatorDevice renders) with one map to a
// grainfield target. Pre-seeding the map avoids driving the add-target <select>.
function guideAndTarget(modulator) {
  const guide = makeLayer("g", "chladni", "Guide", { modulator });
  const target = makeLayer("t", "grainfield", "Target");
  return [guide, target];
}

beforeEach(() => {
  mockTier = "studio";
  fieldOverlayProps.length = 0;
});

describe("ModulatorDevice — two-thumb range slider (WI-6)", () => {
  it("renders both range thumbs with aria-labels and [-1,1] bounds", () => {
    render(
      <Harness
        initialLayers={guideAndTarget({ maps: [{ targetLayerId: "t", channel: "density", amount: 1 }] })}
        initialSelectedId="g"
      />
    );
    const minThumb = screen.getByLabelText("Modulation range min");
    const maxThumb = screen.getByLabelText("Modulation range max");
    for (const t of [minThumb, maxThumb]) {
      expect(t).toHaveAttribute("type", "range");
      expect(t).toHaveAttribute("min", "-1");
      expect(t).toHaveAttribute("max", "1");
    }
  });

  it("moving the max thumb writes modulator.range.max and preserves the rest", () => {
    const spy = vi.fn();
    render(
      <Harness
        initialLayers={guideAndTarget({
          offset: 0.3,
          shape: 0.5,
          steps: 4,
          maps: [{ targetLayerId: "t", channel: "density", amount: 2 }],
        })}
        initialSelectedId="g"
        onUpdateSpy={spy}
      />
    );
    fireEvent.change(screen.getByLabelText("Modulation range max"), {
      target: { value: "0.5" },
    });
    const [, patch] = spy.mock.calls.at(-1);
    expect(patch.modulator.range.max).toBeCloseTo(0.5);
    expect(patch.modulator.range.min).toBe(-1);
    // Rest of the modulator survives the rebuild — no map/field loss.
    expect(patch.modulator.maps).toHaveLength(1);
    expect(patch.modulator.maps[0].targetLayerId).toBe("t");
    expect(patch.modulator.maps[0].amount).toBe(2);
    expect(patch.modulator.offset).toBe(0.3);
    expect(patch.modulator.shape).toBe(0.5);
    expect(patch.modulator.steps).toBe(4);
  });

  it("moving the min thumb writes modulator.range.min", () => {
    const spy = vi.fn();
    render(
      <Harness
        initialLayers={guideAndTarget({ maps: [{ targetLayerId: "t", channel: "density", amount: 1 }] })}
        initialSelectedId="g"
        onUpdateSpy={spy}
      />
    );
    fireEvent.change(screen.getByLabelText("Modulation range min"), {
      target: { value: "-0.4" },
    });
    const [, patch] = spy.mock.calls.at(-1);
    expect(patch.modulator.range.min).toBeCloseTo(-0.4);
    expect(patch.modulator.range.max).toBe(1);
  });

  it("clamps so min ≤ max (dragging min above max)", () => {
    const spy = vi.fn();
    render(
      <Harness
        initialLayers={guideAndTarget({
          range: { min: -1, max: 0 },
          maps: [{ targetLayerId: "t", channel: "density", amount: 1 }],
        })}
        initialSelectedId="g"
        onUpdateSpy={spy}
      />
    );
    // Drag min up to 0.5 — should clamp to the current max (0).
    fireEvent.change(screen.getByLabelText("Modulation range min"), {
      target: { value: "0.5" },
    });
    const [, patch] = spy.mock.calls.at(-1);
    expect(patch.modulator.range.min).toBeLessThanOrEqual(patch.modulator.range.max);
    expect(patch.modulator.range.min).toBeCloseTo(0);
  });

  it("clamps so max ≥ min (dragging max below min)", () => {
    const spy = vi.fn();
    render(
      <Harness
        initialLayers={guideAndTarget({
          range: { min: 0, max: 1 },
          maps: [{ targetLayerId: "t", channel: "density", amount: 1 }],
        })}
        initialSelectedId="g"
        onUpdateSpy={spy}
      />
    );
    fireEvent.change(screen.getByLabelText("Modulation range max"), {
      target: { value: "-0.5" },
    });
    const [, patch] = spy.mock.calls.at(-1);
    expect(patch.modulator.range.max).toBeGreaterThanOrEqual(patch.modulator.range.min);
    expect(patch.modulator.range.max).toBeCloseTo(0);
  });

  it("removes the per-map polarity control but keeps amount", () => {
    render(
      <Harness
        initialLayers={guideAndTarget({ maps: [{ targetLayerId: "t", channel: "density", amount: 1 }] })}
        initialSelectedId="g"
      />
    );
    expect(screen.queryByTestId("modulator-polarity-bipolar")).toBeNull();
    expect(screen.queryByTestId("modulator-polarity-unipolar")).toBeNull();
    expect(screen.queryByRole("group", { name: "Polarity" })).toBeNull();
    expect(screen.getByTestId("modulator-amount")).toBeInTheDocument();
  });

  it("threads the current range into FieldOverlay for live recolor", () => {
    render(
      <Harness
        initialLayers={guideAndTarget({
          range: { min: 0, max: 1 },
          maps: [{ targetLayerId: "t", channel: "density", amount: 1 }],
        })}
        initialSelectedId="g"
      />
    );
    const last = fieldOverlayProps.at(-1);
    expect(last.range).toEqual({ min: 0, max: 1 });
  });
});
