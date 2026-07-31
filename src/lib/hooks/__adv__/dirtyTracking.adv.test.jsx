// @vitest-environment jsdom
// ADVERSARIAL CHARACTERIZATION (T1) — Panel-blind dirty tracking.
//
// TEMPORARY test for the project-saving architecture review. Documents CURRENT
// behavior, including bugs. Do not treat failing-to-match-product-intent
// assertions here as regressions to "fix" in the test.
//
// Claim under test: useDesignPersistence's dirty signal is built ONLY from
// (layers, bgColor, optimizations) — see serializeState in
// src/lib/hooks/useDesignPersistence.js:43-52. Panels (the physical substrate
// model: kind, thickness) are NOT an input to the hook at all, so a Panel
// Sheet edit can never mark the document dirty — while a bgColor tweak can.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useDesignPersistence from "../useDesignPersistence";

function makeLayers() {
  // Layer references its panel by id only; substrate data lives on the panel.
  return [
    {
      id: "layer-1-aaa",
      patternType: "spirograph",
      paramsCache: {},
      panelId: "panel-1-zzz",
    },
  ];
}

function makePanels({ kind = "acrylic", thickness = 3 } = {}) {
  return [
    {
      id: "panel-1-zzz",
      name: "Panel 1",
      substrate: { kind, thickness, color: "#cccccc" },
      visible: true,
      order: 0,
    },
  ];
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

describe("T1 — panel edits are invisible to dirty tracking; bgColor is visible", () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("T1a: changing ONLY a panel's substrate.thickness + substrate.kind leaves isDirty() false", () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR: the substrate model — the part of
    // the document that decides what the laser physically cuts — has NO channel
    // into the dirty signal. There is no `panels` prop on useDesignPersistence;
    // this test holds panels alongside the hook exactly the way Studio holds
    // them in a sibling hook (useLayers), edits them, and shows the persistence
    // hook cannot see it.
    let panels = makePanels(); // acrylic · 3mm
    const props = baseProps();
    const { result, rerender } = renderHook((p) => useDesignPersistence(p), {
      initialProps: props,
    });

    // Clean baseline exactly as a save/load establishes it.
    act(() => result.current.markCleanFrom(props.layers, props.bgColor));
    expect(result.current.isDirty()).toBe(false);

    // Panel Sheet edit: acrylic 3mm -> plywood 6mm. Layers and bgColor are
    // untouched — which is ALL the hook can observe.
    panels = makePanels({ kind: "plywood", thickness: 6 });
    expect(panels[0].substrate).toEqual({
      kind: "plywood",
      thickness: 6,
      color: "#cccccc",
    });
    rerender(baseProps({ layers: props.layers, bgColor: props.bgColor }));

    // The document's fabrication substrate changed; the dirty tracker says clean.
    expect(result.current.isDirty()).toBe(false);
  });

  it("T1b: changing ONLY bgColor flips isDirty() true (the inversion of the domain model)", () => {
    const props = baseProps();
    const { result, rerender } = renderHook((p) => useDesignPersistence(p), {
      initialProps: props,
    });
    act(() => result.current.markCleanFrom(props.layers, props.bgColor));
    expect(result.current.isDirty()).toBe(false);

    // A cosmetic screen-background tweak — which does NOT even round-trip
    // through the cloud config (see cloudConfig.adv.test.jsx T3) — IS dirty.
    rerender(baseProps({ layers: props.layers, bgColor: "#ff0000" }));
    expect(result.current.isDirty()).toBe(true);
  });

  it("T1c: serializeState's shape is exactly {bg, opts, layers} — no panels channel exists", () => {
    const { result } = renderHook(() => useDesignPersistence(baseProps()));
    const serialized = JSON.parse(
      result.current.serializeState(makeLayers(), "#000000")
    );
    // Structural proof of T1a: the comparison hash has nowhere to put panels.
    expect(Object.keys(serialized).sort()).toEqual(["bg", "layers", "opts"]);
  });
});
