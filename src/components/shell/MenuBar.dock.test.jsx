// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuBar from "./MenuBar";
import { InspectorDockProvider } from "./inspectorDockContext";

// WI-6 (inspector-dock): the View menu gains a checkable "Dock Properties to
// Bottom" item, in sync with dockPosition, ONLY when an InspectorDockProvider is
// present. MenuBar reads the dock via context (it is portaled by Studio inside
// AppShell's provider), so there is NO Studio prop threading. With no provider
// the menu is byte-unchanged (legacy/standalone MenuBar).
//
// ThemeToggle reads useTheme and AuthButton reads useAuth; mock both so the
// account cluster renders under jsdom without a real provider tree.
vi.mock("../../lib/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("../../lib/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    tier: "guest",
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

function makeHandlers(overrides = {}) {
  return {
    onNew: vi.fn(),
    onOpen: vi.fn(),
    onExamples: vi.fn(),
    onImport: vi.fn(),
    onExport: vi.fn(),
    onSave: vi.fn(),
    onSaveToCloud: vi.fn(),
    onOpenCloudDesigns: vi.fn(),
    buildShareState: () => ({ layers: [] }),
    ...overrides,
  };
}

function openView() {
  fireEvent.click(screen.getByRole("button", { name: "View" }));
}

const DOCK_LABEL = /dock properties to bottom/i;

describe("MenuBar (WI-6 — View-menu dock entry)", () => {
  it("shows a checkable 'Dock Properties to Bottom' (unchecked when docked right) and toggles", () => {
    const toggleDock = vi.fn();
    render(
      <InspectorDockProvider value={{ dockPosition: "right", toggleDock }}>
        <MenuBar {...makeHandlers()} />
      </InspectorDockProvider>
    );
    openView();
    const item = screen.getByRole("menuitemcheckbox", { name: DOCK_LABEL });
    expect(item).toBeInTheDocument();
    expect(item).toHaveAttribute("aria-checked", "false");

    fireEvent.click(item);
    expect(toggleDock).toHaveBeenCalledTimes(1);
  });

  it("checks the item when the inspector is docked to the bottom", () => {
    const toggleDock = vi.fn();
    render(
      <InspectorDockProvider value={{ dockPosition: "bottom", toggleDock }}>
        <MenuBar {...makeHandlers()} />
      </InspectorDockProvider>
    );
    openView();
    expect(
      screen.getByRole("menuitemcheckbox", { name: DOCK_LABEL })
    ).toHaveAttribute("aria-checked", "true");
  });

  it("omits the dock item entirely when no provider is present (legacy MenuBar unchanged)", () => {
    render(<MenuBar {...makeHandlers()} />);
    openView();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: DOCK_LABEL })
    ).not.toBeInTheDocument();
  });
});
