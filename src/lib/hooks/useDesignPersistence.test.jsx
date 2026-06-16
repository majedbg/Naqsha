// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useDesignPersistence, {
  loadInitialTextState,
  TEXT_STORAGE_KEY,
} from "./useDesignPersistence";
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
    applyTextState: vi.fn(),
    persistToLocal: true,
    ...overrides,
  };
}

const sampleText = () => [
  { id: "text-1", type: "text", text: "Hi", fontId: "work-sans", box: { w: 0, h: 0 } },
];

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

  it("share hydration restores text nodes + transforms via applyTextState", () => {
    const textNodes = sampleText();
    const transforms = { "text-1": { x: 0, y: 5, rotation: 0, scale: 1 } };
    const token = encodeShare({ layers: makeLayers(), textNodes, transforms });
    window.history.replaceState({}, "", `/?s=${token}`);

    const props = baseProps();
    renderHook(() => useDesignPersistence(props));

    expect(props.applyTextState).toHaveBeenCalledWith(textNodes, transforms);
  });

  it("text edits register as dirty (serializeState includes textNodes + transforms)", () => {
    let props = baseProps({ textNodes: [], transforms: {} });
    const { result, rerender } = renderHook((p) => useDesignPersistence(p), {
      initialProps: props,
    });
    expect(result.current.isDirty()).toBe(false);

    props = baseProps({ textNodes: sampleText(), transforms: {} });
    rerender(props);
    expect(result.current.isDirty()).toBe(true);
  });
});

describe("loadInitialTextState", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("restores the locally-backed text/transform state for a persisting user", () => {
    const textNodes = sampleText();
    const transforms = { "text-1": { x: 1, y: 2, rotation: 0, scale: 1 } };
    localStorage.setItem(TEXT_STORAGE_KEY, JSON.stringify({ textNodes, transforms }));
    expect(loadInitialTextState({ persistToLocal: true })).toEqual({ textNodes, transforms });
  });

  it("starts empty for a guest (no local persistence)", () => {
    localStorage.setItem(TEXT_STORAGE_KEY, JSON.stringify({ textNodes: sampleText(), transforms: {} }));
    expect(loadInitialTextState({ persistToLocal: false })).toEqual({ textNodes: [], transforms: {} });
  });

  it("starts empty when a share token is present (share hydration wins)", () => {
    localStorage.setItem(TEXT_STORAGE_KEY, JSON.stringify({ textNodes: sampleText(), transforms: {} }));
    window.history.replaceState({}, "", "/?s=sometoken");
    expect(loadInitialTextState({ persistToLocal: true })).toEqual({ textNodes: [], transforms: {} });
  });

  it("starts empty when nothing is stored", () => {
    expect(loadInitialTextState({ persistToLocal: true })).toEqual({ textNodes: [], transforms: {} });
  });
});
