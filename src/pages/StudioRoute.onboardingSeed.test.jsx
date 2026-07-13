// @vitest-environment jsdom
// Guest onboarding S1 (D5, D10) — a fresh guest with no saved work lands on
// the default Phyllotaxis starter seed via Studio.jsx's `initialSeedLayers`
// gate (`tier === "guest"`), instead of the random `createLayer(0)`. A
// signed-in user (any other tier) is unaffected and keeps the pre-existing
// default. Kept light per the build brief — this only proves the gate wires
// correctly through the real Studio init, not the seed content itself
// (covered by src/lib/onboarding/seedDocuments.test.js) or the hook's own
// clobber-safety (covered by src/lib/useLayers.onboardingSeed.test.jsx).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

function renderStudio() {
  return render(
    <MemoryRouter>
      <StudioRoute proShell={true} />
    </MemoryRouter>
  );
}

const objectTree = () => screen.getByRole("region", { name: /object tree|layers/i });

describe("StudioRoute — guest onboarding default seed (S1, D5/D10)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("a fresh guest (tier==='guest', no saved work) lands on the Phyllotaxis seed", () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      user: null,
      tier: "guest",
      profile: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    renderStudio();
    const names = within(objectTree()).getAllByTestId("layer-name");
    expect(names.length).toBe(1);
    // Phyllotaxis carries the 'Ph' symbol (PATTERN_SYMBOLS) → auto-name
    // "Pattern (Ph)" (autoLayerName.js).
    expect(names[0]).toHaveTextContent("Pattern (Ph)");
  });

  it("a signed-in user (free tier) does NOT get the seed — pre-existing default stands", () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: "u1" },
      tier: "free",
      profile: { id: "u1" },
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    renderStudio();
    const names = within(objectTree()).getAllByTestId("layer-name");
    // Signed-in, no saved work → the pre-existing two-layer default
    // (createLayer(0), createLayer(1) = spirograph, flowfield). Not phyllotaxis.
    expect(names.length).toBe(2);
    expect(names[0]).not.toHaveTextContent("Pattern (Ph)");
  });

  // Regression for the review of 9cf0788: useLayers' init is one-shot, and
  // Studio.jsx's seed gate reads `tier` from useAuth/useGate — which reads
  // `getEffectiveTier(profile)`, returning 'guest' whenever `profile` is null.
  // During the auth-loading flash a signed-in user can transiently have
  // profile:null (no cache yet), so mounting Studio (and initializing
  // useLayers) BEFORE auth resolves can permanently capture the phyllotaxis
  // seed for a signed-in user. StudioRoute must hold Studio's mount until
  // `loading` resolves so `tier` is always the REAL tier at init time.
  it("a signed-in user who mounts during an auth-loading flash gets the NORMAL default, not the seed (no premature Studio mount)", () => {
    mockUseAuth.mockReturnValue({
      loading: true,
      user: null,
      tier: "guest", // getEffectiveTier(null) during the flash — must not leak into the seed decision
      profile: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    const { rerender } = renderStudio();
    // While auth is still loading, Studio (and its one-shot useLayers init)
    // must not have mounted at all — otherwise the seed could already be
    // captured against the transient 'guest' reading above.
    expect(screen.queryByTestId("canvas-surface")).not.toBeInTheDocument();

    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: "u1" },
      tier: "free",
      profile: { id: "u1" },
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    rerender(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );

    const names = within(objectTree()).getAllByTestId("layer-name");
    // Signed-in, no saved work → the pre-existing two-layer default. Not phyllotaxis.
    expect(names.length).toBe(2);
    expect(names[0]).not.toHaveTextContent("Pattern (Ph)");
  });

  it("a real fresh guest still gets the seed once auth resolves (loading:true → resolved tier='guest')", () => {
    mockUseAuth.mockReturnValue({
      loading: true,
      user: null,
      tier: "guest",
      profile: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    const { rerender } = renderStudio();
    expect(screen.queryByTestId("canvas-surface")).not.toBeInTheDocument();

    mockUseAuth.mockReturnValue({
      loading: false,
      user: null,
      tier: "guest",
      profile: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    rerender(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );

    const names = within(objectTree()).getAllByTestId("layer-name");
    expect(names.length).toBe(1);
    expect(names[0]).toHaveTextContent("Pattern (Ph)");
  });

  // Second, independent race window (found reading AuthContext.jsx): the 4s
  // timeout fallback (line ~176) can set loading:false BEFORE fetchProfile
  // resolves for a signed-in user, so `loading:false` alone does not
  // guarantee `tier` is correct — `session`/`user` resolves synchronously
  // and earlier than `profile`, so it's the more reliable signal for "is
  // this really a guest". A signed-in user must never see the seed even if
  // this race lands them on loading:false with profile still null (tier
  // transiently reads 'guest').
  it("a signed-in user with a slow/pending profile fetch (loading:false via timeout fallback, profile still null) does NOT get the seed", () => {
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: "u1" }, // session resolved — real signed-in user
      tier: "guest", // profile still null (fetch pending/slow) — getEffectiveTier(null)
      profile: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    renderStudio();

    const names = within(objectTree()).getAllByTestId("layer-name");
    expect(names.length).toBe(2);
    expect(names[0]).not.toHaveTextContent("Pattern (Ph)");
  });

  it("a returning guest with saved work keeps the saved work, not the seed", () => {
    const savedLayer = { ...createLayer(0, "voronoi"), id: "saved-layer-1" };
    localStorage.setItem(LAYERS_KEY, JSON.stringify([savedLayer]));

    mockUseAuth.mockReturnValue({
      loading: false,
      user: null,
      tier: "guest",
      profile: null,
      signIn: vi.fn(),
      signOut: vi.fn(),
    });
    renderStudio();

    const names = within(objectTree()).getAllByTestId("layer-name");
    expect(names.length).toBe(1);
    expect(names[0]).not.toHaveTextContent("Pattern (Ph)");
  });
});
