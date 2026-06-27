// @vitest-environment jsdom
// Rec 3 / Capability A — guest gating at the MenuBar layer. A not-signed-in user
// must not hit a dead "Save to cloud" button: the item relabels to "Sign in to
// save to cloud" and still fires the SAME onSaveToCloud (which Studio points at
// signIn for guests). With no `isGuest` prop (legacy/standalone path) the label
// stays byte-exact "Save to cloud" and that path is unchanged.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuBar from "./MenuBar";

vi.mock("../../lib/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({
    user: null, profile: null, tier: "guest", loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
  }),
}));

function makeHandlers(overrides = {}) {
  return {
    onOpen: vi.fn(), onExamples: vi.fn(), onExport: vi.fn(),
    onSave: vi.fn(), onSaveToCloud: vi.fn(), onOpenCloudDesigns: vi.fn(),
    buildShareState: () => ({ layers: [] }),
    ...overrides,
  };
}

describe("MenuBar — guest save gating (Rec 3 / A)", () => {
  it("guest: relabels the cloud-save item to 'Sign in to save to cloud' and still fires onSaveToCloud", () => {
    const h = makeHandlers();
    render(<MenuBar {...h} isGuest />);
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    const item = screen.getByRole("menuitem", { name: /sign in to save to cloud/i });
    expect(item).toBeInTheDocument();
    expect(item).not.toBeDisabled();
    fireEvent.click(item);
    expect(h.onSaveToCloud).toHaveBeenCalledTimes(1);
  });

  it("signed-in / legacy (no isGuest prop): label stays 'Save to cloud' and fires onSaveToCloud", () => {
    const h = makeHandlers();
    render(<MenuBar {...h} />);
    fireEvent.click(screen.getByRole("button", { name: "File" }));
    // The guest label must NOT appear on the default path.
    expect(
      screen.queryByRole("menuitem", { name: /sign in to save to cloud/i })
    ).toBeNull();
    const item = screen.getByRole("menuitem", { name: /^save to cloud$/i });
    fireEvent.click(item);
    expect(h.onSaveToCloud).toHaveBeenCalledTimes(1);
  });
});
