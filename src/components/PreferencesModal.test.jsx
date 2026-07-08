// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PreferencesModal from "./PreferencesModal";

// Lane H — the Ableton-style Preferences modal. Presentational + controlled: a
// left tab rail (deliberately minimal — a single "Export" tab today, room for
// more later) whose Export tab carries the "crop paths overflowing the Sheet"
// preference. It renders the toggle from `cropToSheet` and reports flips OUT via
// onChangeCropToSheet(next); Lane I persists via exportSettings (profiles or
// localStorage for guests, per ADR 0001).

function makeProps(overrides = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    cropToSheet: true,
    onChangeCropToSheet: vi.fn(),
    ...overrides,
  };
}

describe("PreferencesModal — render", () => {
  it("renders nothing when closed", () => {
    render(<PreferencesModal {...makeProps({ open: false })} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the single Export tab in the rail", () => {
    render(<PreferencesModal {...makeProps()} />);
    expect(screen.getByRole("tab", { name: /export/i })).toBeInTheDocument();
    // Deliberately minimal: exactly one tab today.
    expect(screen.getAllByRole("tab")).toHaveLength(1);
  });
});

describe("PreferencesModal — crop-to-sheet toggle (controlled)", () => {
  it("reflects cropToSheet=true as checked", () => {
    render(<PreferencesModal {...makeProps({ cropToSheet: true })} />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("reflects cropToSheet=false as unchecked", () => {
    render(<PreferencesModal {...makeProps({ cropToSheet: false })} />);
    expect(screen.getByRole("switch")).not.toBeChecked();
  });

  it("flipping from true calls onChangeCropToSheet(false)", () => {
    const onChangeCropToSheet = vi.fn();
    render(
      <PreferencesModal {...makeProps({ cropToSheet: true, onChangeCropToSheet })} />
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChangeCropToSheet).toHaveBeenCalledTimes(1);
    expect(onChangeCropToSheet).toHaveBeenCalledWith(false);
  });

  it("flipping from false calls onChangeCropToSheet(true)", () => {
    const onChangeCropToSheet = vi.fn();
    render(
      <PreferencesModal {...makeProps({ cropToSheet: false, onChangeCropToSheet })} />
    );
    fireEvent.click(screen.getByRole("switch"));
    expect(onChangeCropToSheet).toHaveBeenCalledWith(true);
  });
});

describe("PreferencesModal — close", () => {
  it("Close button calls onClose", () => {
    const onClose = vi.fn();
    render(<PreferencesModal {...makeProps({ onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<PreferencesModal {...makeProps({ onClose })} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
