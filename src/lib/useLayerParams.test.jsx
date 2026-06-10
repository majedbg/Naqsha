// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { buildLayerParamsValue } from "./useLayerParams";
import { PATTERN_PARAM_DEFS, DEFAULT_PARAMS } from "../constants";

// Characterization tests (AR-3B) pinning the param-handler logic relocated out
// of PatternParams into the LayerParams context value. Randomize/reset must go
// through the paramOps seam (randomPatchForDef / defaultPatchForDef).

function build(overrides = {}) {
  const onChange = vi.fn();
  const onRandomizeKeysChange = vi.fn();
  const value = buildLayerParamsValue({
    patternType: "flowfield",
    params: { ...DEFAULT_PARAMS.flowfield, particleCount: 1234 },
    onChange,
    randomizeKeys: ["particleCount"],
    onRandomizeKeysChange,
    ...overrides,
  });
  return { value, onChange, onRandomizeKeysChange };
}

const particleDef = PATTERN_PARAM_DEFS.flowfield.find(
  (d) => d.key === "particleCount"
);

describe("buildLayerParamsValue", () => {
  it("returns null for an unknown pattern type (PatternParams early-return parity)", () => {
    const value = buildLayerParamsValue({
      patternType: "___nope___",
      params: {},
      onChange: () => {},
      randomizeKeys: [],
      onRandomizeKeysChange: () => {},
    });
    expect(value).toBeNull();
  });

  it("exposes params/defaults/defs/randomizeKeys", () => {
    const { value } = build();
    expect(value.params.particleCount).toBe(1234);
    expect(value.defaults).toEqual(DEFAULT_PARAMS.flowfield);
    expect(value.randomizeKeys).toEqual(["particleCount"]);
    expect(value.defs).toBe(PATTERN_PARAM_DEFS.flowfield);
  });

  it("toggleKey adds/removes a key", () => {
    const { value, onRandomizeKeysChange } = build();
    value.toggleKey("stepLength"); // add
    expect(onRandomizeKeysChange).toHaveBeenLastCalledWith([
      "particleCount",
      "stepLength",
    ]);
    value.toggleKey("particleCount"); // remove
    expect(onRandomizeKeysChange).toHaveBeenLastCalledWith([]);
  });

  it("toggleGroupKeys selects/deselects a group", () => {
    const { value, onRandomizeKeysChange } = build();
    // none → all: add the missing ones
    value.toggleGroupKeys(["particleCount", "stepLength"], false);
    expect(onRandomizeKeysChange).toHaveBeenLastCalledWith([
      "particleCount",
      "stepLength",
    ]);
    // all → none: remove the group's keys
    value.toggleGroupKeys(["particleCount"], true);
    expect(onRandomizeKeysChange).toHaveBeenLastCalledWith([]);
  });

  it("randomizeSingle patches via the paramOps seam (in range, leaves others)", () => {
    const { value, onChange } = build();
    value.randomizeSingle(particleDef);
    const patch = onChange.mock.calls[0][0];
    expect(patch.particleCount).toBeGreaterThanOrEqual(particleDef.min);
    expect(patch.particleCount).toBeLessThanOrEqual(particleDef.max);
    // other params untouched (merge preserved)
    expect(patch.stepLength).toBe(DEFAULT_PARAMS.flowfield.stepLength);
  });

  it("randomizeGroup only patches CHECKED keys", () => {
    const { value, onChange } = build({
      randomizeKeys: ["particleCount"], // stepLength NOT checked
    });
    const stepDef = PATTERN_PARAM_DEFS.flowfield.find(
      (d) => d.key === "stepLength"
    );
    value.randomizeGroup([particleDef, stepDef]);
    const patch = onChange.mock.calls[0][0];
    // particleCount randomized (checked); stepLength left at its incoming value
    expect(patch.stepLength).toBe(DEFAULT_PARAMS.flowfield.stepLength);
  });

  it("resetSingle restores the default for that key", () => {
    const { value, onChange } = build();
    value.resetSingle(particleDef);
    const patch = onChange.mock.calls[0][0];
    expect(patch.particleCount).toBe(DEFAULT_PARAMS.flowfield.particleCount);
  });

  it("resetGroup restores defaults for all group defs", () => {
    const { value, onChange } = build({
      params: { ...DEFAULT_PARAMS.flowfield, particleCount: 99, stepLength: 99 },
    });
    const stepDef = PATTERN_PARAM_DEFS.flowfield.find(
      (d) => d.key === "stepLength"
    );
    value.resetGroup([particleDef, stepDef]);
    const patch = onChange.mock.calls[0][0];
    expect(patch.particleCount).toBe(DEFAULT_PARAMS.flowfield.particleCount);
    expect(patch.stepLength).toBe(DEFAULT_PARAMS.flowfield.stepLength);
  });
});
