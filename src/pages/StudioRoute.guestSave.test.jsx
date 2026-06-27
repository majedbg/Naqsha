// @vitest-environment jsdom
// Rec 3 / Capability A — guest gating wired through the real Studio. A signed-out
// user's "Save to cloud" used to no-op (the hook bails on `!user`); now Studio
// derives a save INTENT (`user ? handleSaveToCloud : signIn`) and points both the
// MenuBar item and Cmd/Ctrl+S at it, so a guest's save routes to Google sign-in.
//
// `signIn` is hoisted into a stable spy so it's assertable across the vi.mock
// boundary (the inline `signIn: vi.fn()` other tests use is a fresh fn per call).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { signInSpy } = vi.hoisted(() => ({ signInSpy: vi.fn() }));

vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({
    loading: false,
    user: null, // guest
    tier: "guest",
    profile: null,
    signIn: signInSpy,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

import StudioRoute from "./StudioRoute";

describe("StudioRoute — guest save routes to sign-in (Rec 3 / A)", () => {
  beforeEach(() => {
    localStorage.clear();
    signInSpy.mockReset();
  });

  it("guest: 'Sign in to save to cloud' menu item invokes signIn", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    fireEvent.click(
      screen.getByRole("menuitem", { name: /sign in to save to cloud/i })
    );
    expect(signInSpy).toHaveBeenCalledTimes(1);
  });

  it("guest: Cmd/Ctrl+S routes to signIn (same intent as the menu item)", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(signInSpy).toHaveBeenCalledTimes(1);
  });
});
