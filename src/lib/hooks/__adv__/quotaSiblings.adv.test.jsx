// @vitest-environment jsdom
// ADVERSARIAL CHARACTERIZATION (T8) — a quota fault on the `sonoform-layers`
// write leaves the sibling keys freshly written: the local store can end up
// with NEW panels paired with OLD (or missing) layers.
//
// TEMPORARY tests for the project-saving architecture review.
//
// The isolated-write structure under test lives in src/lib/useLayers.js:
//   - debounced writer: lines 371-402 (layers write in its own try/catch,
//     siblings in a second try/catch that still runs after a layers throw)
//   - persistDocumentSnapshotNow: lines 216-240 (same shape, synchronous)
// Key constants (read from source, not guessed):
//   STORAGE_KEY            = 'sonoform-layers'        (useLayers.js:174)
//   BG_STORAGE_KEY         = 'sonoform-bg-color'      (useLayers.js:42)
//   CUSTOM_GLYPHS_..._KEY  = 'sonoform-custom-glyphs' (useLayers.js:80)
//   OPTIMIZATIONS_..._KEY  = 'sonoform-optimizations' (useLayers.js:89)
//   PANELS_STORAGE_KEY imported from ../../panels ('sonoform-panels').
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useLayers, { persistDocumentSnapshotNow } from "../../useLayers";
import { PANELS_STORAGE_KEY } from "../../panels";

const LAYERS_KEY = "sonoform-layers";
const BG_KEY = "sonoform-bg-color";
const GLYPHS_KEY = "sonoform-custom-glyphs";
const OPTS_KEY = "sonoform-optimizations";

// setItem that throws ONLY for the layers key, real write for every other key.
function installLayersQuotaFault() {
  const original = Storage.prototype.setItem;
  return vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(function setItem(key, value) {
      if (key === LAYERS_KEY) {
        const err = new Error("QuotaExceededError: sonoform-layers too large");
        err.name = "QuotaExceededError";
        throw err;
      }
      return original.call(this, key, value);
    });
}

describe("T8 — quota fault between sibling localStorage writes", () => {
  let warnSpy;
  beforeEach(() => {
    localStorage.clear();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("T8a: persistDocumentSnapshotNow — layers write throws, ALL siblings still written → NEW panels paired with OLD layers", () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR (a documented, accepted S1 caveat
    // in the source comments — this test pins that the tear is real).
    // Seed OLD on-disk layers pointing at an OLD panel id.
    const oldLayers = [{ id: "layer-9-old", patternType: "wave", panelId: "panel-OLD" }];
    localStorage.setItem(LAYERS_KEY, JSON.stringify(oldLayers));

    const spy = installLayersQuotaFault();
    const norm = persistDocumentSnapshotNow({
      layers: [{ id: "layer-1-new", patternType: "spirograph", paramsCache: {} }],
      customGlyphs: {},
      bgColor: "#123456",
      optimizations: null,
    });
    spy.mockRestore();

    // The layers write failed → the OLD layers survive on disk untouched…
    expect(JSON.parse(localStorage.getItem(LAYERS_KEY))).toEqual(oldLayers);

    // …while every sibling was still written with the NEW document state:
    const storedPanels = JSON.parse(localStorage.getItem(PANELS_STORAGE_KEY));
    expect(storedPanels).toHaveLength(1);
    expect(storedPanels[0].id).toBe(norm.panels[0].id); // the freshly seeded panel
    expect(localStorage.getItem(BG_KEY)).toBe("#123456");
    expect(localStorage.getItem(GLYPHS_KEY)).toBe("{}");
    expect(localStorage.getItem(OPTS_KEY)).toBe("null");

    // The torn pair: the stored layers reference a panel id that no longer
    // exists in the stored panels — NEW panels + OLD layers in one store.
    const storedPanelIds = new Set(storedPanels.map((p) => p.id));
    expect(storedPanelIds.has("panel-OLD")).toBe(false);
    expect(
      JSON.parse(localStorage.getItem(LAYERS_KEY)).every((l) =>
        storedPanelIds.has(l.panelId)
      )
    ).toBe(false);

    // The fault was surfaced as a warning, not a throw.
    expect(warnSpy).toHaveBeenCalled();
  });

  it("T8b: the debounced writer (useLayers, 3000ms) — same tear: siblings written, layers stale", () => {
    // CHARACTERIZES CURRENT (BUGGY) BEHAVIOR on the production autosave path.
    vi.useFakeTimers();
    // Seed OLD on-disk layers (valid enough for loadLayers) with an OLD panelId
    // and NO stored panels, so mount normalization seeds a fresh Panel 1 and
    // reassigns the in-memory layers to it.
    const oldLayers = [
      {
        id: "layer-9-old",
        patternType: "spirograph",
        params: {},
        paramsCache: {},
        panelId: "panel-OLD",
      },
    ];
    localStorage.setItem(LAYERS_KEY, JSON.stringify(oldLayers));

    const { result, unmount } = renderHook(() =>
      useLayers({ persistToLocal: true })
    );
    // In memory, normalization already repaired the pair.
    expect(result.current.panels).toHaveLength(1);
    const freshPanelId = result.current.panels[0].id;
    expect(result.current.layers[0].panelId).toBe(freshPanelId);

    // Now the debounced write (scheduled at mount) fires under quota pressure
    // on the layers key only.
    const spy = installLayersQuotaFault();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    spy.mockRestore();
    unmount();

    // Disk: layers key kept its OLD value (write threw)…
    const diskLayers = JSON.parse(localStorage.getItem(LAYERS_KEY));
    expect(diskLayers).toEqual(oldLayers);
    expect(diskLayers[0].panelId).toBe("panel-OLD");
    // …but the panels sibling WAS written with the NEW seeded panel:
    const diskPanels = JSON.parse(localStorage.getItem(PANELS_STORAGE_KEY));
    expect(diskPanels).toHaveLength(1);
    expect(diskPanels[0].id).toBe(freshPanelId);
    // The store now pairs NEW panels with OLD layers whose panelId dangles.
    expect(diskPanels.some((p) => p.id === "panel-OLD")).toBe(false);
    // The other siblings were also written.
    expect(localStorage.getItem(BG_KEY)).not.toBe(null);
    expect(localStorage.getItem(GLYPHS_KEY)).not.toBe(null);
    expect(localStorage.getItem(OPTS_KEY)).not.toBe(null);
    expect(warnSpy).toHaveBeenCalled();
  });
});
