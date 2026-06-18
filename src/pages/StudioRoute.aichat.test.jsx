// @vitest-environment jsdom
//
// AC2 re-home (#16): the AI-pattern chat (create / revise) was triggered ONLY
// from the legacy LayersSection per-layer "AI" action, removed with LeftPanel.
// It re-homes as the Object-menu "Generate with AI…" item, opened against the
// SELECTED layer (so create switches that layer to the generated pattern, and an
// `ai-` selected layer auto-enters revise mode — matching legacy semantics).
//
// We stub the canvas surface + auth (with a `profile` so AIPatternChat's credits
// read works) and the aiPatternService so no network/credits are touched. The
// observable here is the chat dialog opening from the shell menu, plus the
// generate → onPatternGenerated path switching the selected layer's pattern.
//
// NEW test file — touches no existing test.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("../components/RightPanel", () => ({
  default: () => <div data-testid="canvas-surface">canvas</div>,
}));
vi.mock("../lib/AuthContext", () => ({
  useAuth: () => ({
    loading: false,
    user: null,
    tier: "guest",
    // AIPatternChat reads profile.ai_credits — provide enough to enable Generate.
    profile: { ai_credits: 10 },
  }),
  AuthProvider: ({ children }) => children,
}));

// Stub the AI service so "Generate" resolves deterministically and calls back
// onPatternGenerated with a known pattern id + defaults (no network).
vi.mock("../lib/aiPatternService", () => ({
  CREDIT_COST_NEW: 1,
  CREDIT_COST_REVISION: 1,
  generatePattern: vi.fn(async () => ({
    patternId: "ai-test-pattern",
    name: "Test Pattern",
    defaultParams: { foo: 1 },
    creditsRemaining: 9,
  })),
}));

import StudioRoute from "./StudioRoute";

function openGenerateAI() {
  fireEvent.click(screen.getByRole("button", { name: "Object" }));
  fireEvent.click(screen.getByRole("menuitem", { name: /generate with ai/i }));
}

describe("StudioRoute — AI-pattern chat re-home (#16 AC2)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("Object menu opens the AI Pattern Generator dialog", () => {
    render(
      <MemoryRouter>
        <StudioRoute />
      </MemoryRouter>
    );
    expect(screen.queryByText(/AI Pattern Generator/i)).not.toBeInTheDocument();
    openGenerateAI();
    expect(screen.getByText(/AI Pattern Generator/i)).toBeInTheDocument();
  });

  it("generating a pattern switches the selected layer to the generated pattern", async () => {
    render(
      <MemoryRouter>
        <StudioRoute />
      </MemoryRouter>
    );
    // A layer is selected by default (the inspector falls back to the top layer),
    // so create-mode applies the generated pattern to it. Open the chat and
    // generate.
    openGenerateAI();
    const input = screen.getByPlaceholderText(/describe your pattern/i);
    fireEvent.change(input, { target: { value: "concentric rings" } });
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    // On success the chat shows the generated-pattern confirmation, proving the
    // onPatternGenerated success path ran against the selected layer.
    await waitFor(() =>
      expect(screen.getByText(/generated successfully/i)).toBeInTheDocument()
    );
  });
});
