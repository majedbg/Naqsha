// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuBar from "./MenuBar";

// Issue #15 (Lane C / C7): the View menu's "Overlays" placeholder becomes LIVE —
// it toggles the canvas plot-preview + overlap overlay. Mirrors the Undo/Redo
// conditional-enable pattern (#8): disabled until a handler is supplied, fires
// the handler when chosen, and reflects the current on/off state.
vi.mock("../../lib/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({
    user: null, profile: null, tier: "guest", loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
  }),
}));

function baseHandlers(overrides = {}) {
  return {
    onOpen: vi.fn(), onExamples: vi.fn(), onExport: vi.fn(),
    onSave: vi.fn(), onSaveToCloud: vi.fn(), onOpenCloudDesigns: vi.fn(),
    buildShareState: () => ({ layers: [] }),
    ...overrides,
  };
}

const openView = () => fireEvent.click(screen.getByRole("button", { name: "View" }));

describe("MenuBar — View > Overlays toggle (#15)", () => {
  it("renders Overlays disabled when no toggle handler is provided (placeholder)", () => {
    render(<MenuBar {...baseHandlers()} />);
    openView();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /overlays/i })
    ).toBeDisabled();
  });

  it("Overlays becomes live and invokes the toggle handler when provided", () => {
    const onToggleOverlays = vi.fn();
    render(<MenuBar {...baseHandlers({ onToggleOverlays })} />);
    openView();
    const item = screen.getByRole("menuitemcheckbox", { name: /overlays/i });
    expect(item).not.toBeDisabled();
    fireEvent.click(item);
    expect(onToggleOverlays).toHaveBeenCalledTimes(1);
  });

  it("reflects the current overlay state (checked when on)", () => {
    const onToggleOverlays = vi.fn();
    const { rerender } = render(
      <MenuBar {...baseHandlers({ onToggleOverlays, overlaysOn: false })} />
    );
    openView();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /overlays/i })
    ).toHaveAttribute("aria-checked", "false");

    rerender(<MenuBar {...baseHandlers({ onToggleOverlays, overlaysOn: true })} />);
    expect(
      screen.getByRole("menuitemcheckbox", { name: /overlays/i })
    ).toHaveAttribute("aria-checked", "true");
  });
});
