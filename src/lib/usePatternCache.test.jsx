// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import usePatternCache from "./usePatternCache";

// Control the tier the real checkGate runs against by mocking useAuth (NOT
// useGate — we want the real gate index logic). Mutable so each test can pick.
let mockTier = "free";
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ tier: mockTier }),
}));

// Characterization tests (AR-3B) pinning the pattern-switch cache machine that
// used to live inline in LayerCard (~lines 45–93). Semantics: per-layer,
// per-pattern-type cache; switching saves current, restores prior, or seeds
// fresh defaults; the active type is dropped from the cache.

function makeLayer(overrides = {}) {
  return {
    patternType: "flowfield",
    params: {
      particleCount: 800,
      stepLength: 5,
      noiseScale: 0.004,
      curlStrength: 90,
      patternScale: 1,
      strokeWeight: 1,
      symmetry: 1,
      startAngle: 0,
      offsetX: 0,
      offsetY: 0,
    },
    randomizeKeys: ["particleCount", "stepLength"],
    paramsCache: {},
    ...overrides,
  };
}

describe("usePatternCache", () => {
  beforeEach(() => {
    mockTier = "free";
  });

  it("switching pattern A→B→A restores A's exact params (cache round-trip)", () => {
    mockTier = "free";
    // Mutate edits so A has a non-default param worth restoring.
    const layerA = makeLayer({
      params: { ...makeLayer().params, particleCount: 1234, curlStrength: 42 },
      randomizeKeys: ["particleCount", "curlStrength"],
    });

    const patches = [];
    const onUpdate = (p) => patches.push(p);

    // A → B
    const { result, rerender } = renderHook(
      ({ layer }) => usePatternCache(layer, onUpdate),
      { initialProps: { layer: layerA } }
    );
    act(() => result.current.handlePatternChange("spirograph"));
    const afterAtoB = patches[patches.length - 1];
    expect(afterAtoB.patternType).toBe("spirograph");
    // A's state is now in the cache under "flowfield"
    expect(afterAtoB.paramsCache.flowfield.params.particleCount).toBe(1234);
    expect(afterAtoB.paramsCache.flowfield.params.curlStrength).toBe(42);
    expect(afterAtoB.paramsCache.flowfield.randomizeKeys).toEqual([
      "particleCount",
      "curlStrength",
    ]);
    // active type "spirograph" is NOT in the cache
    expect(afterAtoB.paramsCache.spirograph).toBeUndefined();

    // Simulate the layer becoming B (with A cached), then B → A
    const layerB = {
      patternType: "spirograph",
      params: afterAtoB.params,
      randomizeKeys: afterAtoB.randomizeKeys,
      paramsCache: afterAtoB.paramsCache,
    };
    rerender({ layer: layerB });
    act(() => result.current.handlePatternChange("flowfield"));
    const afterBtoA = patches[patches.length - 1];

    // A restored EXACTLY
    expect(afterBtoA.patternType).toBe("flowfield");
    expect(afterBtoA.params.particleCount).toBe(1234);
    expect(afterBtoA.params.curlStrength).toBe(42);
    expect(afterBtoA.randomizeKeys).toEqual(["particleCount", "curlStrength"]);
    // flowfield removed from cache (now active); spirograph saved
    expect(afterBtoA.paramsCache.flowfield).toBeUndefined();
    expect(afterBtoA.paramsCache.spirograph).toBeDefined();
  });

  it("switching to a fresh (never-visited) type seeds defaults + gated randomizeKeys", () => {
    mockTier = "free";
    const layer = makeLayer();
    let lastPatch = null;
    const { result } = renderHook(() =>
      usePatternCache(layer, (p) => (lastPatch = p))
    );
    act(() => result.current.handlePatternChange("spirograph"));
    expect(lastPatch.patternType).toBe("spirograph");
    // fresh defaults seeded
    expect(lastPatch.params.R).toBeDefined();
    // randomizeKeys is a non-empty subset for free tier
    expect(Array.isArray(lastPatch.randomizeKeys)).toBe(true);
    expect(lastPatch.randomizeKeys.length).toBeGreaterThan(0);
  });

  // Guest fresh-switch uses the LayerCard gate loop, which increments its param
  // index only AFTER skipping RANDOMIZE_EXCLUDED_KEYS (so excluded keys do NOT
  // consume an index). This deliberately differs from PatternParams' loop. Lock
  // the produced randomizeKeys for the two named hazard patterns.
  it("guest fresh-switch to flowfield pins the LayerCard-gated randomizeKeys", () => {
    mockTier = "guest";
    // patternType differs from target + empty cache → forces the fresh branch.
    const layer = makeLayer({ patternType: "spirograph", paramsCache: {} });
    let patch = null;
    const { result } = renderHook(() =>
      usePatternCache(layer, (p) => (patch = p))
    );
    act(() => result.current.handlePatternChange("flowfield"));
    expect(patch.randomizeKeys).toEqual([
      "particleCount",
      "stepLength",
      "noiseScale",
    ]);
  });

  it("guest fresh-switch to duality pins the LayerCard-gated randomizeKeys", () => {
    mockTier = "guest";
    const layer = makeLayer({ patternType: "spirograph", paramsCache: {} });
    let patch = null;
    const { result } = renderHook(() =>
      usePatternCache(layer, (p) => (patch = p))
    );
    act(() => result.current.handlePatternChange("duality"));
    expect(patch.randomizeKeys).toEqual([
      "innerRadius",
      "outerRadius",
      "spiralTurns",
    ]);
  });
});
