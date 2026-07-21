// @vitest-environment jsdom
// Guest onboarding P0-C (D18) — unit contract for the synchronous document
// flush used by the "New session" reset. It must leave EVERY persistence key
// mutually consistent for a fresh single-layer default seed, overwriting a
// previous attendee's inconsistent doc (the reload-race leak) in one shot.
import { describe, it, expect, beforeEach } from "vitest";
import { persistDocumentSnapshotNow, createLayer } from "./useLayers";

const LAYERS_KEY = "sonoform-layers";
const PANELS_KEY = "sonoform-panels";
const GLYPHS_KEY = "sonoform-custom-glyphs";
const OPTS_KEY = "sonoform-optimizations";
const BG_KEY = "sonoform-bg-color";
const DEFAULT_BG = "#ffffff";

function seedPrevAttendee() {
  localStorage.setItem(LAYERS_KEY, JSON.stringify([{ ...createLayer(0, "voronoi"), id: "layer-9-prev", panelId: "panel-prev" }]));
  localStorage.setItem(PANELS_KEY, JSON.stringify([{ id: "panel-prev", name: "Prev", substrate: {}, visible: true, order: 0 }]));
  localStorage.setItem(GLYPHS_KEY, JSON.stringify({ g: { name: "prev" } }));
  localStorage.setItem(OPTS_KEY, JSON.stringify({ simplify: { enabled: true, appliedTolerance: 0.4 } }));
  localStorage.setItem(BG_KEY, "#ff00ff");
}

describe("persistDocumentSnapshotNow (P0-C synchronous flush)", () => {
  beforeEach(() => localStorage.clear());

  it("overwrites a previous attendee's doc with a consistent fresh single-layer snapshot", () => {
    seedPrevAttendee();
    const seed = [{ ...createLayer(0, "phyllotaxis"), id: "layer-1-fresh", panelId: null }];

    persistDocumentSnapshotNow({ layers: seed });

    const layers = JSON.parse(localStorage.getItem(LAYERS_KEY));
    const panels = JSON.parse(localStorage.getItem(PANELS_KEY));
    expect(layers).toHaveLength(1);
    expect(layers[0].id).toBe("layer-1-fresh");
    // normalizePanels(null, ...) seeded a fresh Panel 1 and pinned the layer to
    // it — the layer's panelId points at an EXISTING panel (no orphan), and the
    // previous attendee's panel is gone.
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe(layers[0].panelId);
    expect(panels.some((p) => p.id === "panel-prev")).toBe(false);

    // Siblings cleared to fresh-document values.
    expect(localStorage.getItem(GLYPHS_KEY)).toBe("{}");
    expect(localStorage.getItem(OPTS_KEY)).toBe("null");
    expect(localStorage.getItem(BG_KEY)).toBe(DEFAULT_BG);
  });

  it("writes the caller-supplied customGlyphs, bgColor and optimizations verbatim (so memory and disk agree)", () => {
    const seed = [createLayer(0, "phyllotaxis")];
    const opts = { simplify: { enabled: false, appliedTolerance: null }, merge: { enabled: false, appliedTolerance: null }, reorder: { enabled: false } };

    persistDocumentSnapshotNow({ layers: seed, customGlyphs: { keep: 1 }, bgColor: "#123456", optimizations: opts });

    expect(JSON.parse(localStorage.getItem(GLYPHS_KEY))).toEqual({ keep: 1 });
    expect(localStorage.getItem(BG_KEY)).toBe("#123456");
    expect(JSON.parse(localStorage.getItem(OPTS_KEY))).toEqual(opts);
  });
});
