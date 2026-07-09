// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuBar from "./MenuBar";

// Run Plan (PRD #73): the View menu's "Overlays" toggle is RETIRED. The canvas
// machine view no longer has its own View toggle — it now activates WITH the Run
// Plan (File▸Run plan… / ⇧⌘E), so there is a single place the maker sees "what
// the machine will do". This suite pins the retirement: the Overlays item is GONE
// from the View menu, and the plan entry lives in File instead.
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
const openFile = () => fireEvent.click(screen.getByRole("button", { name: "File" }));

describe("MenuBar — View > Overlays retired into the Run Plan (#73)", () => {
  it("the View menu no longer offers an Overlays item", () => {
    render(<MenuBar {...baseHandlers()} />);
    openView();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /overlays/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /overlays/i })
    ).not.toBeInTheDocument();
  });

  it("even when a (legacy) overlay toggle handler is passed, no Overlays item appears", () => {
    // The prop is gone from MenuBar; passing it must NOT resurrect the item.
    render(<MenuBar {...baseHandlers({ onToggleOverlays: vi.fn(), overlaysOn: true })} />);
    openView();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: /overlays/i })
    ).not.toBeInTheDocument();
  });

  it("the Run Plan entry lives in File as 'Run plan…' (⇧⌘E), adjacent to Export SVG… (⌘E)", () => {
    const onRunPlan = vi.fn();
    render(<MenuBar {...baseHandlers({ onRunPlan })} />);
    openFile();
    const exportItem = screen.getByRole("menuitem", { name: /export svg/i });
    const runPlanItem = screen.getByRole("menuitem", { name: /run plan/i });
    expect(exportItem).toBeInTheDocument();
    expect(runPlanItem).toBeInTheDocument();
    fireEvent.click(runPlanItem);
    expect(onRunPlan).toHaveBeenCalledTimes(1);
  });
});
