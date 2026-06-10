// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useDesignPersistence from "./useDesignPersistence";
import { encodeShare } from "../shareLink";

// Characterization tests (AR-3A) pinning dirty-tracking + share hydration.

function makeLayers(seed = 1) {
  return [{ id: "layer-1-aaa", patternType: "spirograph", seed, paramsCache: {} }];
}

function baseProps(overrides = {}) {
  return {
    layers: makeLayers(),
    bgColor: "#000000",
    loadLayerSet: vi.fn(),
    setBgColor: vi.fn(),
    setCanvasW: vi.fn(),
    setCanvasH: vi.fn(),
    setPresetIndex: vi.fn(),
    setUnit: vi.fn(),
    setMargin: vi.fn(),
    persistToLocal: true,
    ...overrides,
  };
}

describe("useDesignPersistence", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset URL (relative path keeps jsdom's configured origin) so the
    // share-hydration effect sees no token by default.
    window.history.replaceState({}, "", "/");
  });

  it("first run with no token and no stored work treats pristine defaults as clean", () => {
    const { result } = renderHook(() => useDesignPersistence(baseProps()));
    // cleanRef was set from current layers/bg → not dirty.
    expect(result.current.isDirty()).toBe(false);
  });

  it("stored work with no token is treated as dirty (provenance unknown)", () => {
    localStorage.setItem("sonoform-layers", JSON.stringify(makeLayers()));
    const { result } = renderHook(() => useDesignPersistence(baseProps()));
    // cleanRef stays null → dirty.
    expect(result.current.isDirty()).toBe(true);
  });

  it("dirty flips when the serialized state changes and clears when re-marked clean", () => {
    let props = baseProps();
    const { result, rerender } = renderHook((p) => useDesignPersistence(p), {
      initialProps: props,
    });
    expect(result.current.isDirty()).toBe(false);

    // Change layers → now dirty against the baseline.
    props = baseProps({ layers: makeLayers(999) });
    rerender(props);
    expect(result.current.isDirty()).toBe(true);

    // Re-mark clean from the current state → clean again.
    act(() => result.current.markCleanFrom(props.layers, props.bgColor));
    expect(result.current.isDirty()).toBe(false);
  });

  it("serializeState excludes paramsCache so cache churn is not a dirty signal", () => {
    const { result } = renderHook(() => useDesignPersistence(baseProps()));
    const a = result.current.serializeState(
      [{ id: "x", patternType: "wave", paramsCache: { foo: 1 } }],
      "#fff"
    );
    const b = result.current.serializeState(
      [{ id: "x", patternType: "wave", paramsCache: { foo: 2, bar: 3 } }],
      "#fff"
    );
    expect(a).toBe(b);
  });

  it("share hydration loads state from a ?s= token then clears the param", () => {
    const token = encodeShare({
      layers: makeLayers(42),
      canvasW: 800,
      canvasH: 1200,
      presetIndex: 3,
      unit: "mm",
      margin: 5,
      bgColor: "#123456",
    });
    window.history.replaceState({}, "", `/?s=${token}`);

    const props = baseProps();
    renderHook(() => useDesignPersistence(props));

    expect(props.loadLayerSet).toHaveBeenCalledTimes(1);
    expect(props.setCanvasW).toHaveBeenCalledWith(800);
    expect(props.setCanvasH).toHaveBeenCalledWith(1200);
    expect(props.setPresetIndex).toHaveBeenCalledWith(3);
    expect(props.setUnit).toHaveBeenCalledWith("mm");
    expect(props.setMargin).toHaveBeenCalledWith(5);
    expect(props.setBgColor).toHaveBeenCalledWith("#123456");
    // Token stripped from the URL after hydration.
    expect(window.location.search).toBe("");
  });
});
