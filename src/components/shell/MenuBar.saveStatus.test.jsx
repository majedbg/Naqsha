// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MenuBar from "./MenuBar";

// Rec 1: MenuBar gains OPTIONAL save-status props. When `status` is supplied it
// renders <SaveStatusIndicator> (editable doc name + status label + Retry);
// when omitted (the legacy/standalone path with no provider) it renders nothing
// new — the bar is byte-unchanged. MenuBar stays presentational: it forwards the
// status/lastSavedAt/onRetry/designName/onRenameDesign props straight through.
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

describe("MenuBar — save status (Rec 1)", () => {
  it("renders nothing extra when no status prop is supplied (legacy path)", () => {
    render(<MenuBar {...baseHandlers()} />);
    expect(screen.queryByRole("textbox", { name: /document name/i })).toBeNull();
    expect(screen.queryByText(/saved|couldn't save|unsaved/i)).toBeNull();
  });

  it("renders the SaveStatusIndicator (doc name + label) when status is supplied", () => {
    render(
      <MenuBar
        {...baseHandlers()}
        status={{ kind: "dirty", label: "Unsaved changes" }}
        designName="My Doc"
        onRenameDesign={vi.fn()}
        onRetry={vi.fn()}
      />
    );
    expect(
      screen.getByRole("textbox", { name: /document name/i })
    ).toHaveValue("My Doc");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("forwards rename intent from the indicator to onRenameDesign", () => {
    const onRenameDesign = vi.fn();
    render(
      <MenuBar
        {...baseHandlers()}
        status={{ kind: "saved", label: "Saved" }}
        designName="My Doc"
        onRenameDesign={onRenameDesign}
        onRetry={vi.fn()}
      />
    );
    const input = screen.getByRole("textbox", { name: /document name/i });
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.blur(input);
    expect(onRenameDesign).toHaveBeenCalledWith("Renamed");
  });
});
