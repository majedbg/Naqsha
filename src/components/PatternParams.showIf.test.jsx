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

// Tier is controllable so we can also assert guest-gating is unchanged by
// hidden params. Default free so gating never hides the modulegrid rows.
let mockTier = "free";
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// Same harness boundary as PatternParams.gate.test.jsx: owns params state and
// wires the LayerParams context, re-rendering with new params on change.
function Harness({ patternType, initialParams }) {
  const [params, setParams] = useState(initialParams);
  const value = buildLayerParamsValue({
    patternType,
    params,
    onChange: (p) => setParams(p),
    randomizeKeys: [],
    onRandomizeKeysChange: () => {},
  });
  return (
    <LayerParamsProvider value={value}>
      <PatternParams />
    </LayerParamsProvider>
  );
}

// modulegrid carries per-module knobs guarded by showIf: (p) => p.module === X.
// Sweep Curve is visible only for module 'sideSweep'; Chevron Depth only for
// 'chevron'. These exercise the presentation-only filter in PatternParams.
describe("PatternParams showIf conditional visibility", () => {
  it("showIf=false hides the row (Chevron Depth absent on sideSweep)", () => {
    render(
      <Harness
        patternType="modulegrid"
        initialParams={{ ...DEFAULT_PARAMS.modulegrid, module: "sideSweep" }}
      />
    );
    // sideSweep's own knob is shown…
    expect(
      screen.getByRole("slider", { name: "Sweep Curve" })
    ).toBeInTheDocument();
    // …and the other modules' knobs are hidden.
    expect(
      screen.queryByRole("slider", { name: "Chevron Depth" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: "Diamond Aspect" })
    ).not.toBeInTheDocument();
  });

  it("showIf=true shows the row (Chevron Depth present on chevron)", () => {
    render(
      <Harness
        patternType="modulegrid"
        initialParams={{ ...DEFAULT_PARAMS.modulegrid, module: "chevron" }}
      />
    );
    expect(
      screen.getByRole("slider", { name: "Chevron Depth" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: "Sweep Curve" })
    ).not.toBeInTheDocument();
  });

  it("toggling the controlling param flips visibility", () => {
    render(
      <Harness
        patternType="modulegrid"
        initialParams={{ ...DEFAULT_PARAMS.modulegrid, module: "sideSweep" }}
      />
    );
    // Initially sideSweep → Sweep Curve visible, Chevron Depth hidden.
    expect(
      screen.getByRole("slider", { name: "Sweep Curve" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: "Chevron Depth" })
    ).not.toBeInTheDocument();

    // The module is an iconselect — its options render as role="radio" buttons
    // labeled by the option label. Click the Chevron radio to switch modules.
    fireEvent.click(screen.getByRole("radio", { name: "Chevron" }));

    // Now chevron → Chevron Depth visible, Sweep Curve hidden.
    expect(
      screen.getByRole("slider", { name: "Chevron Depth" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("slider", { name: "Sweep Curve" })
    ).not.toBeInTheDocument();
  });
});

// A pattern with NO showIf on any def must render exactly as before — proves
// "absent showIf = always shown" and that hidden modulegrid params do not
// change the gate/locked behavior (locked count is over the full def list).
describe("PatternParams showIf does not regress patterns without it", () => {
  beforeEach(() => {});

  beforeEach(() => {
    mockTier = "free";
  });

  it("guest locked count is unchanged by hidden (showIf) params", () => {
    mockTier = "guest";
    // sideSweep hides chevron/diamond/fan/ring knobs; chevron hides the others.
    // The "N more parameters" guest summary counts locked params over the FULL
    // def list, so it must be identical regardless of which module is selected.
    const { unmount } = render(
      <Harness
        patternType="modulegrid"
        initialParams={{ ...DEFAULT_PARAMS.modulegrid, module: "sideSweep" }}
      />
    );
    const sweepSummary = screen.queryByText(/more parameters/)?.textContent ?? "none";
    unmount();

    render(
      <Harness
        patternType="modulegrid"
        initialParams={{ ...DEFAULT_PARAMS.modulegrid, module: "chevron" }}
      />
    );
    const chevSummary = screen.queryByText(/more parameters/)?.textContent ?? "none";

    expect(chevSummary).toBe(sweepSummary);
  });

  it("flowfield (no showIf) renders all its rows unchanged", () => {
    render(
      <Harness
        patternType="flowfield"
        initialParams={{ ...DEFAULT_PARAMS.flowfield }}
      />
    );
    for (const name of [
      "Particle Count",
      "Step Length",
      "Noise Scale",
      "Curl Strength",
      "Pattern Scale",
    ]) {
      expect(screen.getByRole("slider", { name })).toBeInTheDocument();
    }
  });
});
