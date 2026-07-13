// @vitest-environment jsdom
// Guest onboarding S5 (D13, D17, D22) — the Operation lens discoverability
// tip's real wiring: Studio.jsx wraps ColorViewControl's `onSetMode` so a
// guest's first engagement with the lens switch fires `lens-opened`
// telemetry and retires the tip, even when clicking the already-active
// "Operation" button (which never changes `colorView.mode` on its own — see
// the comment on `handleSetColorViewMode` in Studio.jsx for why hooking the
// call site, not diffing the mode value, is deliberate). Kept light per the
// build brief's precedent (StudioRoute.onboardingSeed.test.jsx) — mocks the
// heavy canvas surface away and proves only the wiring, not ColorViewControl's
// own rendering (covered by ColorViewControl.test.jsx) or the tip's own
// visibility rules (covered by GuestOnboarding.test.jsx).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));

const { mockUseAuth } = vi.hoisted(() => ({ mockUseAuth: vi.fn() }));
vi.mock("../lib/AuthContext", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }) => children,
}));

const { emitOnboardingEvent } = vi.hoisted(() => ({ emitOnboardingEvent: vi.fn() }));
vi.mock("../lib/onboarding/telemetry", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, emitOnboardingEvent };
});

import StudioRoute from "./StudioRoute";
import { ONBOARDING_EVENTS } from "../lib/onboarding/telemetry";

function renderStudio() {
  return render(
    <MemoryRouter>
      <StudioRoute proShell={true} />
    </MemoryRouter>
  );
}

const GUEST_AUTH = {
  loading: false,
  user: null,
  tier: "guest",
  profile: null,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

const SIGNED_IN_AUTH = {
  loading: false,
  user: { id: "u1" },
  tier: "free",
  profile: { id: "u1" },
  signIn: vi.fn(),
  signOut: vi.fn(),
};

describe("StudioRoute — guest lens discoverability telemetry wiring (S5, D13/D22)", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("a guest clicking the Operation lens button fires lens-opened telemetry, even though Operation is already the active lens", () => {
    mockUseAuth.mockReturnValue(GUEST_AUTH);
    renderStudio();

    const operationBtn = screen.getByRole("radio", { name: /operation/i });
    expect(operationBtn).toHaveAttribute("aria-checked", "true"); // default lens

    fireEvent.click(operationBtn);

    expect(emitOnboardingEvent).toHaveBeenCalledWith(
      ONBOARDING_EVENTS.LENS_OPENED,
      expect.objectContaining({ mode: "operation" })
    );
  });

  it("fires lens-opened only once per session even across repeated lens clicks", () => {
    mockUseAuth.mockReturnValue(GUEST_AUTH);
    renderStudio();

    const operationBtn = screen.getByRole("radio", { name: /operation/i });
    fireEvent.click(operationBtn);
    fireEvent.click(operationBtn);
    fireEvent.click(operationBtn);

    const lensOpenedCalls = emitOnboardingEvent.mock.calls.filter(
      ([name]) => name === ONBOARDING_EVENTS.LENS_OPENED
    );
    expect(lensOpenedCalls.length).toBe(1);
  });

  it("a signed-in user clicking the lens switch never fires lens-opened telemetry (guest-only)", () => {
    mockUseAuth.mockReturnValue(SIGNED_IN_AUTH);
    renderStudio();

    const operationBtn = screen.getByRole("radio", { name: /operation/i });
    fireEvent.click(operationBtn);

    const lensOpenedCalls = emitOnboardingEvent.mock.calls.filter(
      ([name]) => name === ONBOARDING_EVENTS.LENS_OPENED
    );
    expect(lensOpenedCalls.length).toBe(0);
  });

  it("still switches lenses normally for a guest (the telemetry wrapper does not break the underlying lens switch)", () => {
    mockUseAuth.mockReturnValue(GUEST_AUTH);
    renderStudio();

    const materialBtn = screen.getByRole("radio", { name: /material/i });
    fireEvent.click(materialBtn);

    expect(materialBtn).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /operation/i })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });
});
