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
});
