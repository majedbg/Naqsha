// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useState } from "react";
import PatternParams from "./PatternParams";
import {
  buildLayerParamsValue,
  LayerParamsProvider,
} from "../lib/useLayerParams";
import { InspectorDockProvider } from "./shell/inspectorDockContext";
import { DEFAULT_PARAMS } from "../constants";

// Mirror the gate/showIf harness: control tier via useAuth (NOT useGate) so the
// real checkGate runs. Default "free" so flowfield yields several visible groups
// (structure/scale/variation/stroke) plus its featured "Radial Symmetry" row.
let mockTier = "free";
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// Harness owns params state + wires the LayerParams context (LayerCard's
// boundary). `dockPosition` is fed through InspectorDockProvider, which — like
// AppShell in production — propagates through the portal so PatternParams reads
// it via useInspectorDockContext(). `null` dockPosition mounts NO provider, to
// prove the legacy (no-context) path is byte-unchanged.
function Harness({ patternType, initialParams, dockPosition }) {
  const [params, setParams] = useState(initialParams);
  const value = buildLayerParamsValue({
    patternType,
    params,
    onChange: (p) => setParams(p),
    randomizeKeys: [],
    onRandomizeKeysChange: () => {},
  });
  const tree = (
    <LayerParamsProvider value={value}>
      <PatternParams />
    </LayerParamsProvider>
  );
  if (dockPosition === undefined) return tree; // no provider at all
  return (
    <InspectorDockProvider value={{ dockPosition }}>
      {tree}
    </InspectorDockProvider>
  );
}

describe("PatternParams dock-aware columnization (WI-4b)", () => {
  beforeEach(() => {
    mockTier = "free";
  });

  it("bottom dock → groups are columnized inside the InspectorShelf grid", () => {
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
        dockPosition="bottom"
      />
    );

    const grid = screen.getByTestId("inspector-shelf-grid");
    expect(grid).toBeInTheDocument();

    // The group headers (always-rendered, even when collapsed) are DIRECT grid
    // items. flowfield/free yields ≥2 groups; assert several labels are inside.
    // (Label spans are uniquely named — avoids the nested reset/randomize buttons
    // whose accessible names ALSO contain the group label.)
    const gridQ = within(grid);
    expect(gridQ.getByText("Structure")).toBeInTheDocument();
    expect(gridQ.getByText("Scale")).toBeInTheDocument();
    expect(gridQ.getByText("Variation")).toBeInTheDocument();

    // A real group param row lives inside the grid too (atomic group item).
    expect(
      gridQ.getByRole("slider", { name: "Particle Count" })
    ).toBeInTheDocument();
  });

  it("right dock → NOT columnized (no grid); vertical stack as today", () => {
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
        dockPosition="right"
      />
    );
    expect(screen.queryByTestId("inspector-shelf-grid")).toBeNull();
    // Groups still render normally.
    expect(screen.getByText("Structure")).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Particle Count" })
    ).toBeInTheDocument();
  });

  it("no dock provider → behaves exactly like 'right' (no grid; legacy path)", () => {
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
        dockPosition={undefined}
      />
    );
    expect(screen.queryByTestId("inspector-shelf-grid")).toBeNull();
    expect(
      screen.getByRole("slider", { name: "Particle Count" })
    ).toBeInTheDocument();
  });

  it("bottom dock → featured param stays pinned ABOVE the grid (outside it)", () => {
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
        dockPosition="bottom"
      />
    );
    const grid = screen.getByTestId("inspector-shelf-grid");

    // flowfield's featured param is "Radial Symmetry" (an iconselect rendered as
    // an option group). It must render OUTSIDE the columnized grid, pinned above.
    const featured = screen.getByText("Radial Symmetry");
    expect(featured).toBeInTheDocument();
    expect(grid).not.toContainElement(featured);

    // And the grid is a child of the outer space-y-1.5 wrapper (single wrapper
    // preserved in both modes).
    const wrapper = grid.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.className).toContain("space-y-1.5");
  });
});
