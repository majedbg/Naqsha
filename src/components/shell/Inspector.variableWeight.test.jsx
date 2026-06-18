// @vitest-environment jsdom
//
// Variable line-weight UI (issue #17, C8) — the per-layer toggle + N control that
// the Inspector grows for weight-varying patterns. Capability-gated (pattern must
// emit weight variation AND the active profile must support banding), off by
// default, with an "advanced — manual machine setup required" warning on enable.
//
// These are the issue's "Test plan (TDD)" render/interaction/guard cases:
//   (a) toggle hidden for a uniform-weight pattern, shown for a varying one
//   (b) enabling fires onVariableWeightChange { enabled:true, n:DEFAULT }; changing
//       N fires onVariableWeightChange with the new N
//   (c) the advanced warning shows when enabled
//   (d) drag-cutter profile HIDES the feature (supportsVariableWeight false)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Inspector from "./Inspector";
import { DEFAULT_PARAMS } from "../../constants";
import { DEFAULT_BAND_COUNT } from "../../lib/variableWeight";

// Inspector composes PatternTabs + PatternParams, both of which read the gate via
// useAuth. Mock useAuth so the real checkGate runs against the "studio" tier
// (every param visible) — matching Inspector.test.jsx's convention.
let mockTier = "studio";
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

function makeLayer(id, patternType, extra = {}) {
  return {
    id,
    name: id,
    patternType,
    params: { ...DEFAULT_PARAMS[patternType] },
    randomizeKeys: [],
    paramsCache: {},
    ...extra,
  };
}

beforeEach(() => {
  mockTier = "studio";
});

describe("Inspector variable line-weight UI (C8 — #17)", () => {
  // (a) RENDER — capability gating on the PATTERN.
  it("hides the variable-weight toggle for a uniform-weight pattern", () => {
    render(
      <Inspector
        layers={[makeLayer("l1", "flowfield")]}
        selectedLayerId="l1"
        profileId="laser"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onVariableWeightChange={() => {}}
      />
    );
    expect(
      screen.queryByTestId("variable-weight-toggle")
    ).not.toBeInTheDocument();
  });

  it("shows the variable-weight toggle (OFF by default) for a weight-varying pattern (recursive)", () => {
    render(
      <Inspector
        layers={[makeLayer("l1", "recursive")]}
        selectedLayerId="l1"
        profileId="laser"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onVariableWeightChange={() => {}}
      />
    );
    const toggle = screen.getByTestId("variable-weight-toggle");
    expect(toggle).toBeInTheDocument();
    // OFF by default → unchecked, no N control, no warning yet.
    expect(toggle).not.toBeChecked();
    expect(screen.queryByTestId("variable-weight-n")).not.toBeInTheDocument();
    expect(screen.queryByTestId("variable-weight-warning")).not.toBeInTheDocument();
  });

  // (b) INTERACTION — enabling fires the change callback with the default N.
  it("enabling the toggle calls onVariableWeightChange with { enabled:true, n:DEFAULT }", () => {
    const onVariableWeightChange = vi.fn();
    render(
      <Inspector
        layers={[makeLayer("l1", "recursive")]}
        selectedLayerId="l1"
        profileId="laser"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onVariableWeightChange={onVariableWeightChange}
      />
    );
    fireEvent.click(screen.getByTestId("variable-weight-toggle"));
    expect(onVariableWeightChange).toHaveBeenCalledWith("l1", {
      enabled: true,
      n: DEFAULT_BAND_COUNT,
    });
  });

  // (b) INTERACTION — when enabled, the N control is shown and editing it
  // re-fires onVariableWeightChange with the new N (the live re-bucket trigger).
  it("shows the N control when enabled and re-fires onVariableWeightChange on N change", () => {
    const onVariableWeightChange = vi.fn();
    render(
      <Inspector
        layers={[
          makeLayer("l1", "recursive", {
            variableWeight: { enabled: true, n: DEFAULT_BAND_COUNT },
          }),
        ]}
        selectedLayerId="l1"
        profileId="laser"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onVariableWeightChange={onVariableWeightChange}
      />
    );
    const nControl = screen.getByTestId("variable-weight-n");
    expect(nControl).toHaveValue(DEFAULT_BAND_COUNT);
    fireEvent.change(nControl, { target: { value: "7" } });
    expect(onVariableWeightChange).toHaveBeenCalledWith("l1", {
      enabled: true,
      n: 7,
    });
  });

  // (c) INTERACTION — the advanced warning shows when enabled.
  it("shows the advanced manual-setup warning when enabled", () => {
    render(
      <Inspector
        layers={[
          makeLayer("l1", "recursive", {
            variableWeight: { enabled: true, n: DEFAULT_BAND_COUNT },
          }),
        ]}
        selectedLayerId="l1"
        profileId="laser"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onVariableWeightChange={() => {}}
      />
    );
    const warning = screen.getByTestId("variable-weight-warning");
    expect(warning).toBeInTheDocument();
    expect(warning.textContent).toMatch(/advanced/i);
    expect(warning.textContent).toMatch(/manual machine setup/i);
  });

  // (d) GUARD — the drag-cutter profile HIDES the feature (a blade has no line
  // weight: supportsVariableWeight('dragCutter') === false).
  it("hides the variable-weight toggle when the profile is dragCutter", () => {
    render(
      <Inspector
        layers={[makeLayer("l1", "recursive")]}
        selectedLayerId="l1"
        profileId="dragCutter"
        onUpdateLayer={() => {}}
        onChangeLayerPattern={() => {}}
        onVariableWeightChange={() => {}}
      />
    );
    expect(
      screen.queryByTestId("variable-weight-toggle")
    ).not.toBeInTheDocument();
  });
});
