// @vitest-environment jsdom
//
// Run Plan applied Optimizations fold into the DIRTY SIGNAL (PRD #73, ADR 0002).
// Applying / reverting an Optimization changes what export produces, so it must
// schedule an autosave the same way a layer edit does. serializeState now hashes
// the applied-only snapshot alongside {bg, layers}; absent → null so callers that
// never wire it hash byte-identically (covered by the base characterization
// suite's paramsCache test).

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useDesignPersistence from "./useDesignPersistence";

function makeLayers(seed = 1) {
  return [{ id: "layer-1-aaa", patternType: "spirograph", seed, paramsCache: {} }];
}

const APPLIED_A = {
  simplify: { enabled: false, appliedTolerance: null },
  merge: { enabled: false, appliedTolerance: null },
  reorder: { enabled: false },
};
const APPLIED_B = {
  simplify: { enabled: true, appliedTolerance: 0.5 },
  merge: { enabled: false, appliedTolerance: null },
  reorder: { enabled: false },
};

function baseProps(overrides = {}) {
  return {
    layers: makeLayers(),
    bgColor: "#000000",
    loadLayerSet: () => {},
    setBgColor: () => {},
    setCanvasW: () => {},
    setCanvasH: () => {},
    setPresetIndex: () => {},
    setUnit: () => {},
    setMargin: () => {},
    persistToLocal: true,
    optimizations: APPLIED_A,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("useDesignPersistence — applied Optimizations in the dirty signal", () => {
  it("applying an Optimization flips the design dirty against the clean baseline", () => {
    let props = baseProps();
    const { result, rerender } = renderHook((p) => useDesignPersistence(p), {
      initialProps: props,
    });
    // Baseline captured at mount from APPLIED_A → clean.
    expect(result.current.isDirty()).toBe(false);

    // Apply an Optimization (nothing else changed) → dirty.
    props = baseProps({ optimizations: APPLIED_B });
    rerender(props);
    expect(result.current.isDirty()).toBe(true);

    // Re-mark clean from the new applied state → clean again (the save baseline).
    act(() => result.current.markCleanFrom(props.layers, props.bgColor));
    expect(result.current.isDirty()).toBe(false);
  });

  it("does not treat an unchanged applied-Optimizations set as dirty", () => {
    const { result } = renderHook(() => useDesignPersistence(baseProps()));
    expect(result.current.isDirty()).toBe(false);
  });

  it("serializeState with no optimizations arg is byte-stable (back-compat)", () => {
    const { result } = renderHook(() => useDesignPersistence(baseProps()));
    const a = result.current.serializeState(makeLayers(7), "#fff");
    const b = result.current.serializeState(makeLayers(7), "#fff");
    expect(a).toBe(b);
  });
});
