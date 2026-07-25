// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NewDocumentDialog from "./NewDocumentDialog";

// The prompt shown by File → New when the current document has unsaved work.
// It presents the actions resolveNewDocumentActions produced and reports the
// chosen one by id. Calm, specific, accessible — an alertdialog that traps and
// restores focus and treats Escape / dismiss as Cancel.
const ACTIONS = [
  { id: "save", label: "Save to cloud", routesToSignIn: false },
  { id: "export", label: "Export SVG" },
  { id: "discard", label: "Discard", danger: true },
  { id: "cancel", label: "Cancel" },
];

describe("NewDocumentDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders nothing when closed", () => {
    render(<NewDocumentDialog open={false} actions={ACTIONS} onAction={vi.fn()} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("is an alertdialog with a calm, specific title and body", () => {
    render(<NewDocumentDialog open actions={ACTIONS} onAction={vi.fn()} />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName("Start a new document");
    expect(
      screen.getByText("Your current work has unsaved changes.")
    ).toBeInTheDocument();
    // Naqsheh: no exclamation points in the copy.
    expect(dialog.textContent).not.toContain("!");
  });

  it("renders a button for each action and reports its id when clicked", () => {
    const onAction = vi.fn();
    render(<NewDocumentDialog open actions={ACTIONS} onAction={onAction} />);
    for (const a of ACTIONS) {
      expect(screen.getByRole("button", { name: a.label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onAction).toHaveBeenCalledWith("discard");
    fireEvent.click(screen.getByRole("button", { name: "Save to cloud" }));
    expect(onAction).toHaveBeenCalledWith("save");
  });

  it("Escape reports cancel", () => {
    const onAction = vi.fn();
    render(<NewDocumentDialog open actions={ACTIONS} onAction={onAction} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onAction).toHaveBeenCalledWith("cancel");
  });

  it("clicking the backdrop reports cancel", () => {
    const onAction = vi.fn();
    render(<NewDocumentDialog open actions={ACTIONS} onAction={onAction} />);
    fireEvent.click(screen.getByTestId("new-document-backdrop"));
    expect(onAction).toHaveBeenCalledWith("cancel");
  });

  it("moves focus into the dialog on open", () => {
    render(<NewDocumentDialog open actions={ACTIONS} onAction={vi.fn()} />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("restores focus to the previously-focused element when it closes", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "File";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(
      <NewDocumentDialog open actions={ACTIONS} onAction={vi.fn()} />
    );
    // Focus moved into the dialog.
    expect(document.activeElement).not.toBe(trigger);

    rerender(
      <NewDocumentDialog open={false} actions={ACTIONS} onAction={vi.fn()} />
    );
    expect(document.activeElement).toBe(trigger);
  });

  it("marks only the destructive action with danger styling", () => {
    render(<NewDocumentDialog open actions={ACTIONS} onAction={vi.fn()} />);
    const discard = screen.getByRole("button", { name: "Discard" });
    expect(discard.className).toMatch(/tone-strong/);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel.className).not.toMatch(/tone-strong/);
  });
});
