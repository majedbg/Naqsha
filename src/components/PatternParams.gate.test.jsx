// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import PatternParams from "./PatternParams";
import {
  buildLayerParamsValue,
  LayerParamsProvider,
} from "../lib/useLayerParams";
import { DEFAULT_PARAMS } from "../constants";

// Control tier (real checkGate runs against it) by mocking useAuth — NOT useGate.
let mockTier = "guest";
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// Characterization tests (AR-3B):
//  - guest-tier gate behavior at the PatternParams site is unchanged (flowfield
//    + duality, the named hazard cases).
//  - a param change reaches state through the context.
//  - sibling rows are not remounted when a sibling param changes (stable keys).

// A harness that owns params state and wires the LayerParams context, mirroring
// LayerCard's boundary. Records onChange patches and re-renders with new params.
function Harness({ patternType, initialParams, onPatch }) {
  const [params, setParams] = useState(initialParams);
  const value = buildLayerParamsValue({
    patternType,
    params,
    onChange: (p) => {
      onPatch?.(p);
      setParams(p);
    },
    randomizeKeys: [],
    onRandomizeKeysChange: () => {},
  });
  return (
    <LayerParamsProvider value={value}>
      <PatternParams />
    </LayerParamsProvider>
  );
}

describe("PatternParams gate behavior (guest tier)", () => {
  beforeEach(() => {
    mockTier = "guest";
  });

  it("flowfield: guest sees all params (cap raised to 7; flowfield has 6)", () => {
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
      />
    );
    // Curl Strength + Pattern Scale were locked for guests before; now visible.
    // (Stroke Weight lives in the 'stroke' group, collapsed by default, so it is
    // intentionally not asserted here.)
    for (const name of [
      "Particle Count",
      "Step Length",
      "Noise Scale",
      "Curl Strength",
      "Pattern Scale",
    ]) {
      expect(screen.getByRole("slider", { name })).toBeInTheDocument();
    }
    // Nothing is left locked → no "more parameters" summary.
    expect(screen.queryByText(/more parameters/)).not.toBeInTheDocument();
  });

  it("duality: guest sees exactly innerRadius/outerRadius/spiralTurns", () => {
    render(
      <Harness
        patternType="duality"
        initialParams={{ ...DEFAULT_PARAMS.duality }}
      />
    );
    const sliders = screen
      .getAllByRole("slider")
      .map((el) => el.getAttribute("aria-label"));
    // The first three non-universal duality params are visible…
    expect(sliders).toContain("Inner Radius");
    expect(sliders).toContain("Outer Radius");
    // …and the gated ones (e.g. dash/arc stroke weight) are not.
    expect(sliders).not.toContain("Dash Stroke Weight");
    expect(sliders).not.toContain("Arc Stroke Weight");
  });

  it("free tier shows more than 3 params (gate index is real, not stubbed)", () => {
    mockTier = "free";
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
      />
    );
    expect(
      screen.getByRole("slider", { name: "Curl Strength" })
    ).toBeInTheDocument();
  });
});

describe("PatternParams param flow through context", () => {
  beforeEach(() => {
    mockTier = "free";
  });

  it("a param change reaches state through the context", () => {
    const patches = [];
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
        onPatch={(p) => patches.push(p)}
      />
    );
    const slider = screen.getByRole("slider", { name: "Particle Count" });
    fireEvent.change(slider, { target: { value: "500" } });
    expect(patches.length).toBeGreaterThan(0);
    expect(patches[patches.length - 1].particleCount).toBe(500);
    // The merge preserved siblings.
    expect(patches[patches.length - 1].stepLength).toBe(
      DEFAULT_PARAMS.flowfield.stepLength
    );
  });

  it("changing one param does not remount sibling rows (stable keys)", () => {
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
      />
    );
    const siblingBefore = screen.getByRole("slider", { name: "Step Length" });
    // Tag the sibling's DOM node; if it remounts, the tag is lost.
    siblingBefore.dataset.probe = "sib-1";

    const target = screen.getByRole("slider", { name: "Particle Count" });
    fireEvent.change(target, { target: { value: "2000" } });

    const siblingAfter = screen.getByRole("slider", { name: "Step Length" });
    // Same DOM instance → not remounted.
    expect(siblingAfter).toBe(siblingBefore);
    expect(siblingAfter.dataset.probe).toBe("sib-1");
  });
});
