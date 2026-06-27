// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SaveStatusIndicator from "./SaveStatusIndicator";

// Rec 1 — the inline save-state surface (this app has no toast system, so save
// state is shown next to the editable doc name in the menu bar). Presentational:
// it renders the resolved status label, formats the saved timestamp, offers a
// Retry on error, and commits an inline rename on blur/Enter.
function renderIndicator(props = {}) {
  return render(
    <SaveStatusIndicator
      status={{ kind: "idle", label: "" }}
      lastSavedAt={null}
      onRetry={() => {}}
      name="Untitled"
      onRename={() => {}}
      {...props}
    />
  );
}

describe("SaveStatusIndicator", () => {
  it("renders the status label for each kind", () => {
    const cases = [
      ["saving", "Saving…"],
      ["error", "Couldn't save"],
      ["dirty", "Unsaved changes"],
    ];
    for (const [kind, label] of cases) {
      const { unmount } = renderIndicator({ status: { kind, label } });
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("appends a formatted time to the 'saved' label from lastSavedAt", () => {
    const t = new Date("2026-06-26T15:04:00").getTime();
    renderIndicator({ status: { kind: "saved", label: "Saved" }, lastSavedAt: t });
    // The label is present and a time string derived from lastSavedAt is shown.
    expect(screen.getByText(/Saved/)).toBeInTheDocument();
    const expected = new Date(t).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    expect(screen.getByText(new RegExp(expected.replace(/\s/g, "\\s")))).toBeInTheDocument();
  });

  it("renders a Retry button on error that calls onRetry", () => {
    const onRetry = vi.fn();
    renderIndicator({ status: { kind: "error", label: "Couldn't save" }, onRetry });
    const btn = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("does not render a Retry button when not in error", () => {
    renderIndicator({ status: { kind: "saved", label: "Saved" }, lastSavedAt: Date.now() });
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });

  it("commits a renamed name on Enter via onRename", () => {
    const onRename = vi.fn();
    renderIndicator({ name: "Untitled", onRename });
    const input = screen.getByRole("textbox", { name: /document name/i });
    fireEvent.change(input, { target: { value: "My Mandala" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("My Mandala");
  });

  it("commits a renamed name on blur via onRename", () => {
    const onRename = vi.fn();
    renderIndicator({ name: "Untitled", onRename });
    const input = screen.getByRole("textbox", { name: /document name/i });
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.blur(input);
    expect(onRename).toHaveBeenCalledWith("Renamed");
  });

  it("does not call onRename for an unchanged or empty name", () => {
    const onRename = vi.fn();
    renderIndicator({ name: "Untitled", onRename });
    const input = screen.getByRole("textbox", { name: /document name/i });
    // unchanged
    fireEvent.blur(input);
    // emptied
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.blur(input);
    expect(onRename).not.toHaveBeenCalled();
  });
});
