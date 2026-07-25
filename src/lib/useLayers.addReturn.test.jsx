// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import useLayers from "./useLayers.js";

// addLayer must return { ok, id } (like addImportedLayer/addTextLayer) so the
// caller can select the just-created layer — otherwise the Inspector keeps
// showing the previously-selected pattern (the reported bug). The returned id
// MUST equal the id actually on the appended layer, or selection points at
// nothing and the Inspector blanks.

describe("useLayers — addLayer return contract (for auto-select)", () => {
  beforeEach(() => localStorage.clear());

  it("returns { ok: true, id } where id matches the appended layer", () => {
    const { result } = renderHook(() => useLayers({ persistToLocal: false }));
    let outcome;
    act(() => {
      outcome = result.current.addLayer("spirograph");
    });
    expect(outcome).toEqual({ ok: true, id: expect.any(String) });
    const added = result.current.layers[result.current.layers.length - 1];
    expect(added.id).toBe(outcome.id);
    expect(added.patternType).toBe("spirograph");
  });

  it("returns { ok: false } at the tier cap and does not append", () => {
    // persistToLocal:false seeds one layer; cap of 1 is already full.
    const { result } = renderHook(() =>
      useLayers({ persistToLocal: false, maxLayers: 1 })
    );
    const before = result.current.layers.length;
    let outcome;
    act(() => {
      outcome = result.current.addLayer();
    });
    expect(outcome.ok).toBe(false);
    expect(result.current.layers.length).toBe(before);
  });
});
