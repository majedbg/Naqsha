// @vitest-environment jsdom
// Rec 3 / Capability B — the recovery banner. A signed-in user whose prior cloud
// save FAILED has their work stashed under the namespaced draft key. On the next
// mount Studio surfaces an inline "Recover unsaved changes?" banner with Recover
// / Discard (the app has no toast system — same inline-banner pattern as the SVG
// import error / the pendingExample confirm). Discard dismisses it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { draftKey, saveDraft } from "../lib/localDraft";

vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({
    loading: false,
    user: { id: "user-1" }, // signed in
    tier: "free",
    profile: { id: "user-1", tier: "free" },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }) => children,
}));

import StudioRoute from "./StudioRoute";

function seedDraft() {
  saveDraft(draftKey(null), {
    config: { layers: [{ id: "l1", patternType: "spirograph", paramsCache: {} }], canvasW: 640, canvasH: 480 },
    name: "Crashed Work",
    savedAt: 5,
  });
}

describe("StudioRoute — draft recovery banner (Rec 3 / B)", () => {
  beforeEach(() => localStorage.clear());

  it("shows a recovery banner when a stashed draft exists on mount", () => {
    seedDraft();
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    expect(screen.getByText(/recover unsaved changes\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recover/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });

  it("renders no banner when there is no stashed draft", () => {
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    expect(screen.queryByText(/recover unsaved changes\?/i)).toBeNull();
  });

  it("Discard dismisses the banner", () => {
    seedDraft();
    render(
      <MemoryRouter>
        <StudioRoute proShell={true} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    expect(screen.queryByText(/recover unsaved changes\?/i)).toBeNull();
  });
});
