// @vitest-environment jsdom
// Guest onboarding P0-C (D18) — the "New session / hand to next person" reset
// must persist the fresh default seed to localStorage SYNCHRONOUSLY, so a
// workshop attendee who reloads within the 3s autosave-debounce window
// (useLayers.js) can NOT resurrect the previous attendee's document.
//
// Repro (BUILD-NOTES P0-C): a previous attendee's doc is saved to localStorage;
// New session loads the default seed into React state but the protecting write
// used to ride the 3s debounce, so location.reload() within ~1s tore down the
// context before the timer fired and the prior doc leaked back.
//
// This proves the leak is closed: right after confirm, every persistence key
// already reflects the fresh single-layer default seed AND they are mutually
// consistent (no orphaned panelId / leaked glyphs / leaked optimizations), and
// they STAY consistent after the debounce window elapses (the rescheduled
// autosave writes the same clean in-memory state, not the prior attendee's).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock("../lib/AuthContext", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }) => children,
}));

import StudioRoute from "./StudioRoute";
import { createLayer } from "../lib/useLayers";

const LAYERS_KEY = "sonoform-layers";
const PANELS_KEY = "sonoform-panels";
const GLYPHS_KEY = "sonoform-custom-glyphs";
const OPTS_KEY = "sonoform-optimizations";
const BG_KEY = "sonoform-bg-color";
const DEFAULT_BG = "#0a1628";

const GUEST_AUTH = {
  loading: false,
  user: null,
  tier: "guest",
  profile: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

function renderStudio() {
  return render(
    <MemoryRouter>
      <StudioRoute proShell={true} />
    </MemoryRouter>
  );
}

// Simulate a PREVIOUS attendee's saved document already sitting in localStorage:
// a non-default layer on a named panel, plus a custom glyph and an applied
// optimization and a custom background. All of it must be gone after New session.
function seedPreviousAttendeeDoc() {
  const prevLayer = {
    ...createLayer(0, "voronoi"),
    id: "layer-99-prevatt",
    panelId: "panel-prev-1",
  };
  localStorage.setItem(LAYERS_KEY, JSON.stringify([prevLayer]));
  localStorage.setItem(
    PANELS_KEY,
    JSON.stringify([
      { id: "panel-prev-1", name: "Prev Attendee Panel", substrate: { kind: "plywood", thickness: 4, color: "#886644" }, materialId: null, visible: true, order: 0 },
      { id: "panel-prev-2", name: "Prev Attendee Panel 2", substrate: { kind: "acrylic", thickness: 5, color: "#cccccc" }, materialId: null, visible: true, order: 1 },
    ])
  );
  localStorage.setItem(GLYPHS_KEY, JSON.stringify({ "glyph-x": { root: {}, name: "prev glyph" } }));
  localStorage.setItem(OPTS_KEY, JSON.stringify({ simplify: { enabled: true, appliedTolerance: 0.5 }, merge: { enabled: false, appliedTolerance: null }, reorder: { enabled: false } }));
  localStorage.setItem(BG_KEY, "#ff0000");
}

function assertFreshDefaultSeedPersisted() {
  const layers = JSON.parse(localStorage.getItem(LAYERS_KEY));
  const panels = JSON.parse(localStorage.getItem(PANELS_KEY));

  // Exactly one layer — the default single-layer seed (phyllotaxis, D5).
  expect(Array.isArray(layers)).toBe(true);
  expect(layers).toHaveLength(1);
  expect(layers[0].patternType).toBe("phyllotaxis");
  // NOT the previous attendee's layer.
  expect(layers[0].id).not.toBe("layer-99-prevatt");

  // Panels are mutually consistent with the layer — the layer's panelId points
  // at a panel that EXISTS in the panels array (no orphan / dangling panelId),
  // and the previous attendee's panels are gone.
  expect(Array.isArray(panels)).toBe(true);
  const panelIds = panels.map((p) => p.id);
  expect(panelIds).toContain(layers[0].panelId);
  expect(panelIds).not.toContain("panel-prev-1");
  expect(panelIds).not.toContain("panel-prev-2");

  // No leaked custom glyphs, background reset.
  expect(localStorage.getItem(GLYPHS_KEY)).toBe("{}");
  expect(localStorage.getItem(BG_KEY)).toBe(DEFAULT_BG);

  // No leaked optimizations: the previous attendee had `simplify` APPLIED
  // (enabled:true, appliedTolerance:0.5). After reset the persisted blob is the
  // "none applied" state (or an explicit null) — never the applied one. Assert
  // the meaningful invariant rather than one exact encoding.
  const opts = JSON.parse(localStorage.getItem(OPTS_KEY));
  if (opts !== null) {
    expect(opts.simplify?.enabled ?? false).toBe(false);
    expect(opts.simplify?.appliedTolerance ?? null).toBe(null);
    expect(opts.merge?.enabled ?? false).toBe(false);
    expect(opts.reorder?.enabled ?? false).toBe(false);
  }
}

function confirmNewSession() {
  fireEvent.click(screen.getByRole("button", { name: /start a new session/i }));
  fireEvent.click(screen.getByRole("button", { name: /start new session/i }));
}

describe("StudioRoute — P0-C New-session reload race (D18)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(GUEST_AUTH);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists the fresh default seed SYNCHRONOUSLY on confirm — no reliance on the 3s debounce", () => {
    seedPreviousAttendeeDoc();
    renderStudio();

    confirmNewSession();

    // The critical assertion: BEFORE any timer fires, localStorage already holds
    // the fresh, consistent default doc. A reload right now cannot resurrect the
    // previous attendee's work.
    assertFreshDefaultSeedPersisted();
  });

  it("stays consistent after the autosave-debounce window elapses (rescheduled write mirrors the clean reset, not the prior doc)", () => {
    vi.useFakeTimers();
    try {
      seedPreviousAttendeeDoc();
      renderStudio();

      confirmNewSession();
      assertFreshDefaultSeedPersisted();

      // Capture the synchronous-write panel id BEFORE the debounce fires.
      const panelIdAtWrite = JSON.parse(localStorage.getItem(PANELS_KEY))[0].id;
      const layerIdAtWrite = JSON.parse(localStorage.getItem(LAYERS_KEY))[0].id;

      // Let the rescheduled 3s autosave fire. Because the reset resets the
      // in-memory panels / optimizations / bg (not just layers) from the SAME
      // normalized snapshot the synchronous write used, the debounced write is
      // byte-identical to the synchronous one — no re-leak of the previous
      // attendee's panels/opts/bg on a >3s reload, and (regression for the
      // double-normalize divergence) the panel/layer ids do NOT change when the
      // debounce reconciles memory→disk.
      act(() => {
        vi.advanceTimersByTime(3500);
      });
      assertFreshDefaultSeedPersisted();
      expect(JSON.parse(localStorage.getItem(PANELS_KEY))[0].id).toBe(panelIdAtWrite);
      expect(JSON.parse(localStorage.getItem(LAYERS_KEY))[0].id).toBe(layerIdAtWrite);
      expect(JSON.parse(localStorage.getItem(LAYERS_KEY))[0].panelId).toBe(panelIdAtWrite);
    } finally {
      vi.useRealTimers();
    }
  });
});
