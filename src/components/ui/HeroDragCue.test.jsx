// Guest onboarding S3 — "drag me" cue on the active guest seed's hero
// control (D6/D21, BUILD BRIEF element #2). Rendered through the real
// PatternParams -> ParamGroup -> ParamRow -> HeroDragCue -> ParamControl
// chain (mirroring PatternParams.gate.test.jsx's Harness), so the hero-key
// match (SEED_HERO_RANGES) is exercised against real PATTERN_PARAM_DEFS.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { useState } from "react";
import PatternParams from "../PatternParams";
import {
  buildLayerParamsValue,
  LayerParamsProvider,
} from "../../lib/useLayerParams";
import { DEFAULT_PARAMS } from "../../constants";
import { ONBOARDING_EVENTS } from "../../lib/onboarding/telemetry";

// Control tier (real checkGate runs against it, via PatternParams' own
// useGate) AND the resolved-auth guard (HeroDragCue reads useAuth directly,
// matching S1/S2's `!loading && !user && tier === 'guest'` idiom — see
// HeroDragCue.jsx) by mocking useAuth.
let mockTier = "guest";
let mockLoading = false;
let mockUser = null;
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({ tier: mockTier, loading: mockLoading, user: mockUser }),
}));

// Spy on the real telemetry sink without losing ONBOARDING_EVENTS (imported
// directly above via importOriginal passthrough).
const emitOnboardingEvent = vi.fn();
vi.mock("../../lib/onboarding/telemetry", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    emitOnboardingEvent: (...args) => emitOnboardingEvent(...args),
  };
});

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

// A harness that owns params state and wires the LayerParams context,
// mirroring LayerCard's boundary — identical shape to
// PatternParams.gate.test.jsx's Harness.
function Harness({ patternType, initialParams }) {
  const [params, setParams] = useState(initialParams);
  const value = buildLayerParamsValue({
    patternType,
    params,
    onChange: (p) => setParams(p),
    randomizeKeys: [],
    onRandomizeKeysChange: () => {},
  });
  return (
    <LayerParamsProvider value={value}>
      <PatternParams />
    </LayerParamsProvider>
  );
}

describe("HeroDragCue (S3)", () => {
  beforeEach(() => {
    mockTier = "guest";
    mockLoading = false;
    mockUser = null;
    sessionStorage.clear();
    emitOnboardingEvent.mockClear();
    mockMatchMedia(false); // motion allowed by default
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows exactly one cue, on phyllotaxis' hero row (angle / Divergence Angle), for a guest", () => {
    render(
      <Harness
        patternType="phyllotaxis"
        initialParams={{ ...DEFAULT_PARAMS.phyllotaxis }}
      />
    );
    expect(screen.getByRole("slider", { name: "Divergence Angle" })).toBeInTheDocument();
    expect(screen.getAllByTestId("hero-drag-cue")).toHaveLength(1);

    const heroRow = screen.getByTestId("param-row-angle");
    expect(within(heroRow).getByTestId("hero-drag-cue")).toBeInTheDocument();
    expect(within(heroRow).getByText("Drag me")).toBeInTheDocument();
  });

  it("shows the cue on recursive's hero row (scaleFactor / Scale Factor)", () => {
    render(
      <Harness
        patternType="recursive"
        initialParams={{ ...DEFAULT_PARAMS.recursive }}
      />
    );
    expect(screen.getAllByTestId("hero-drag-cue")).toHaveLength(1);
    const heroRow = screen.getByTestId("param-row-scaleFactor");
    expect(within(heroRow).getByTestId("hero-drag-cue")).toBeInTheDocument();
  });

  it("shows the cue on topographic's hero row (noiseScale / Zoom / Feature Size)", () => {
    render(
      <Harness
        patternType="topographic"
        initialParams={{ ...DEFAULT_PARAMS.topographic }}
      />
    );
    expect(screen.getAllByTestId("hero-drag-cue")).toHaveLength(1);
    const heroRow = screen.getByTestId("param-row-noiseScale");
    expect(within(heroRow).getByTestId("hero-drag-cue")).toBeInTheDocument();
  });

  it("is never shown for a signed-in tier, even on the hero row", () => {
    mockTier = "free";
    render(
      <Harness
        patternType="phyllotaxis"
        initialParams={{ ...DEFAULT_PARAMS.phyllotaxis }}
      />
    );
    expect(screen.queryByTestId("hero-drag-cue")).not.toBeInTheDocument();
    const heroRow = screen.getByTestId("param-row-angle");
    expect(within(heroRow).queryByTestId("hero-drag-cue")).not.toBeInTheDocument();
  });

  it("is never shown while auth is still resolving, even if tier reads 'guest' (loading-flash guard, matches S1/S2)", () => {
    // getEffectiveTier (AuthContext.jsx) returns 'guest' for a signed-in user
    // whose profile hasn't hydrated yet — the bare `tier === 'guest'` check
    // PatternParams uses for its (invisible) param-count gate is NOT strict
    // enough for an infinite pulsing ring, which must never flash for a
    // signed-in user during that window.
    mockLoading = true;
    render(
      <Harness
        patternType="phyllotaxis"
        initialParams={{ ...DEFAULT_PARAMS.phyllotaxis }}
      />
    );
    expect(screen.queryByTestId("hero-drag-cue")).not.toBeInTheDocument();
  });

  it("is never shown once a user is present, even if tier still reads 'guest' mid-resolution", () => {
    mockUser = { id: "u1" };
    render(
      <Harness
        patternType="phyllotaxis"
        initialParams={{ ...DEFAULT_PARAMS.phyllotaxis }}
      />
    );
    expect(screen.queryByTestId("hero-drag-cue")).not.toBeInTheDocument();
  });

  it("is not shown on a non-hero row even for a guest", () => {
    render(
      <Harness
        patternType="phyllotaxis"
        initialParams={{ ...DEFAULT_PARAMS.phyllotaxis }}
      />
    );
    // minSize is a real phyllotaxis param, not the hero (angle).
    const nonHeroRow = screen.getByTestId("param-row-minSize");
    expect(within(nonHeroRow).queryByTestId("hero-drag-cue")).not.toBeInTheDocument();
  });

  it("disappears after the guest changes the hero param once (drag/edit), and fires aha-reached exactly once", () => {
    render(
      <Harness
        patternType="topographic"
        initialParams={{ ...DEFAULT_PARAMS.topographic }}
      />
    );
    const heroRow = screen.getByTestId("param-row-noiseScale");
    expect(within(heroRow).getByTestId("hero-drag-cue")).toBeInTheDocument();

    const slider = within(heroRow).getByRole("slider", { name: "Zoom / Feature Size" });
    fireEvent.change(slider, { target: { value: "5" } });

    expect(within(heroRow).queryByTestId("hero-drag-cue")).not.toBeInTheDocument();
    expect(emitOnboardingEvent).toHaveBeenCalledTimes(1);
    expect(emitOnboardingEvent).toHaveBeenCalledWith(
      ONBOARDING_EVENTS.AHA_REACHED,
      expect.objectContaining({ patternType: "topographic", key: "noiseScale" })
    );

    // A second edit must not fire a second event — single-fire (D22).
    fireEvent.change(slider, { target: { value: "6" } });
    expect(emitOnboardingEvent).toHaveBeenCalledTimes(1);
  });

  it("the hero control stays fully keyboard-operable (arrow keys change value AND dismiss the cue) — D21", () => {
    render(
      <Harness
        patternType="phyllotaxis"
        initialParams={{ ...DEFAULT_PARAMS.phyllotaxis }}
      />
    );
    const heroRow = screen.getByTestId("param-row-angle");
    const dial = within(heroRow).getByRole("slider", { name: "Divergence Angle" });
    expect(within(heroRow).getByTestId("hero-drag-cue")).toBeInTheDocument();

    fireEvent.keyDown(dial, { key: "ArrowRight" });

    expect(within(heroRow).queryByTestId("hero-drag-cue")).not.toBeInTheDocument();
    expect(emitOnboardingEvent).toHaveBeenCalledTimes(1);
  });

  it("prefers-reduced-motion renders a STATIC cue (no pulse animation class), not no cue", () => {
    mockMatchMedia(true);
    render(
      <Harness
        patternType="phyllotaxis"
        initialParams={{ ...DEFAULT_PARAMS.phyllotaxis }}
      />
    );
    const cue = screen.getByTestId("hero-drag-cue");
    expect(cue).toBeInTheDocument();
    expect(cue.className).not.toContain("anim-hero-cue-pulse");
    expect(cue.getAttribute("data-reduced-motion")).toBe("true");
  });

  it("switching to an unseen starter still shows the cue after a different starter's hero was already dismissed", () => {
    const { unmount } = render(
      <Harness
        patternType="recursive"
        initialParams={{ ...DEFAULT_PARAMS.recursive }}
      />
    );
    fireEvent.change(screen.getByRole("slider", { name: "Scale Factor" }), {
      target: { value: "0.5" },
    });
    expect(screen.queryByTestId("hero-drag-cue")).not.toBeInTheDocument();
    unmount();

    // A fresh phyllotaxis layer (different pattern type, never touched) still
    // gets its own cue.
    render(
      <Harness
        patternType="phyllotaxis"
        initialParams={{ ...DEFAULT_PARAMS.phyllotaxis }}
      />
    );
    expect(screen.getAllByTestId("hero-drag-cue")).toHaveLength(1);
  });
});
