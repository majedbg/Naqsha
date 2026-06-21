// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuBar from "./MenuBar";

// Issue #18: ITP Camp mode is a toggleable item under the View menu (a second
// entry point alongside the OperationsPanel control). It is Laser-gated —
// disabled unless `kitModeAvailable` — fires the toggle handler when chosen, and
// reflects the live kit state via the checkmark. Mirrors the Overlays toggle.
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

describe("MenuBar — View > ITP Camp mode toggle (#18)", () => {
  it("is disabled when the kit is unavailable (non-laser profile)", () => {
    const onToggleKitMode = vi.fn();
    render(
      <MenuBar {...baseHandlers({ onToggleKitMode, kitModeAvailable: false })} />
    );
    openView();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /itp camp mode/i })
    ).toBeDisabled();
  });

  it("becomes live and invokes the toggle handler when available", () => {
    const onToggleKitMode = vi.fn();
    render(
      <MenuBar {...baseHandlers({ onToggleKitMode, kitModeAvailable: true })} />
    );
    openView();
    const item = screen.getByRole("menuitemcheckbox", {
      name: /itp camp mode/i,
    });
    expect(item).not.toBeDisabled();
    fireEvent.click(item);
    expect(onToggleKitMode).toHaveBeenCalledTimes(1);
  });

  it("reflects the live kit state (checked when active)", () => {
    const onToggleKitMode = vi.fn();
    const { rerender } = render(
      <MenuBar
        {...baseHandlers({ onToggleKitMode, kitModeAvailable: true, kitModeOn: false })}
      />
    );
    openView();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /itp camp mode/i })
    ).toHaveAttribute("aria-checked", "false");

    rerender(
      <MenuBar
        {...baseHandlers({ onToggleKitMode, kitModeAvailable: true, kitModeOn: true })}
      />
    );
    expect(
      screen.getByRole("menuitemcheckbox", { name: /itp camp mode/i })
    ).toHaveAttribute("aria-checked", "true");
  });

  it("honors a custom kit name in the label", () => {
    render(
      <MenuBar
        {...baseHandlers({
          onToggleKitMode: vi.fn(),
          kitModeAvailable: true,
          kitModeName: "Workshop",
        })}
      />
    );
    openView();
    expect(
      screen.getByRole("menuitemcheckbox", { name: /workshop mode/i })
    ).toBeInTheDocument();
  });
});
