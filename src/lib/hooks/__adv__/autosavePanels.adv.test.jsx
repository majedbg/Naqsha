// @vitest-environment jsdom
// ADVERSARIAL CHARACTERIZATION (T2) — autosave never fires for a Panel-only edit.
//
// TEMPORARY test for the project-saving architecture review.
//
// Composition mirrors Studio's wiring (see autosaveRename.integration.test.jsx):
// the autosave dirty trigger is useDesignPersistence.isDirty OR'd with
// nameDirty. useAutosave's CHANGE SIGNAL is `isDirty`'s referential identity
// (deps: [serializeState, layers, bgColor, optimizations] + nameDirty in the
// combined fn). A panels edit changes none of those, so (a) the schedule effect
// never re-runs and (b) even a pending timer's runSave would bail on
// isDirty() === false. Result: substrate edits are never autosaved.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useCallback } from "react";
import { renderHook, act } from "@testing-library/react";
import useDesignPersistence from "../useDesignPersistence";
import useAutosave from "../useAutosave";

function makeLayers() {
  return [
    {
      id: "layer-1-aaa",
      patternType: "spirograph",
      paramsCache: {},
      panelId: "panel-1-zzz",
    },
  ];
}

// Studio-like composition. NOTE: `panels` is accepted here only to demonstrate
// that there is nowhere to route it — neither hook takes it.
function useStudioLikeAutosave({ layers, bgColor, save }) {
  const dp = useDesignPersistence({
    layers,
    bgColor,
    loadLayerSet: () => {},
    setBgColor: () => {},
    setCanvasW: () => {},
    setCanvasH: () => {},
    setPresetIndex: () => {},
    setUnit: () => {},
    setMargin: () => {},
    persistToLocal: true,
  });
  const nameDirty = false; // rename path not exercised in this file
  const combinedIsDirty = useCallback(
    () => dp.isDirty() || nameDirty,
    [dp.isDirty, nameDirty]
  );
  useAutosave({
    enabled: true,
    hasDesignId: true, // design already has a cloud identity — autosave fully armed
    isDirty: combinedIsDirty,
    save,
    debounceMs: 3000, // the production default
  });
  return dp;
}

describe("T2 — Studio-wired autosave vs a panels-only edit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("T2a: a panels-only substrate edit does NOT fire the debounced save (3000ms elapsed)", () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR: editing a panel's substrate
    // (kind/thickness) — a document-defining change — never reaches the cloud
    // via autosave, because panels feed neither isDirty's value nor its identity.
    const save = vi.fn(() => Promise.resolve());
    const layers = makeLayers();
    let panels = [
      {
        id: "panel-1-zzz",
        name: "Panel 1",
        substrate: { kind: "acrylic", thickness: 3 },
        visible: true,
        order: 0,
      },
    ];
    const { rerender } = renderHook((p) => useStudioLikeAutosave(p), {
      initialProps: { layers, bgColor: "#000000", save },
    });

    // Clean at mount (first-run baseline) — no save scheduled.
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(save).not.toHaveBeenCalled();

    // Panel Sheet edit: acrylic 3mm -> plywood 6mm. The Studio re-renders (as a
    // panels setState would cause), but layers/bgColor are byte-identical.
    panels = [
      { ...panels[0], substrate: { kind: "plywood", thickness: 6 } },
    ];
    expect(panels[0].substrate.thickness).toBe(6);
    act(() => {
      rerender({ layers, bgColor: "#000000", save });
    });
    act(() => {
      vi.advanceTimersByTime(3100); // well past the 3000ms debounce
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("T2b: control — a bgColor-only change DOES fire the debounced save", () => {
    const save = vi.fn(() => Promise.resolve());
    const layers = makeLayers();
    const { rerender } = renderHook((p) => useStudioLikeAutosave(p), {
      initialProps: { layers, bgColor: "#000000", save },
    });

    act(() => {
      rerender({ layers, bgColor: "#123456", save });
    });
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(save).toHaveBeenCalledTimes(1);
  });
});
