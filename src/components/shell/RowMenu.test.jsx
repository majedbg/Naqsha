// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import RowMenu from "./RowMenu";

// WI-4 (Object Tree Panel, spec §4): the per-row "⋯" overflow menu popper.
// Standalone, reusable, controlled-`open` component following the locked
// OperationPicker precedent (inline, NOT portaled, role="menu"). The ⋯ trigger
// itself lives in the LayerTree row (WI-5); RowMenu renders only the panel and
// honors a controlled `open` plus item callbacks.
//
// Items, top→bottom: Rename · Duplicate · Download · —divider— · Delete (danger).

function renderMenu(props = {}) {
  return render(
    <RowMenu
      open
      onClose={() => {}}
      onRename={() => {}}
      onDuplicate={() => {}}
      onDownload={() => {}}
      onDelete={() => {}}
      {...props}
    />
  );
}

describe("RowMenu (WI-4 — per-row overflow popper)", () => {
  it("renders items in order Rename · Duplicate · Download · Delete", () => {
    renderMenu();
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent(/rename/i);
    expect(items[1]).toHaveTextContent(/duplicate/i);
    expect(items[2]).toHaveTextContent(/download/i);
    expect(items[3]).toHaveTextContent(/delete/i);
  });

  it("places a (non-menuitem) divider between Download and Delete", () => {
    renderMenu();
    const menu = screen.getByRole("menu");
    // The divider is a separator, NOT a menuitem (so it stays out of arrow nav).
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
  });

  it("marks Delete with the destructive token (text-tone-strong)", () => {
    renderMenu();
    const del = screen.getByRole("menuitem", { name: /delete/i });
    expect(del.className).toMatch(/text-tone-strong/);
    // Non-destructive items do not carry the danger token.
    const rename = screen.getByRole("menuitem", { name: /rename/i });
    expect(rename.className).not.toMatch(/text-tone-strong/);
  });

  it("renders nothing when open is false", () => {
    renderMenu({ open: false });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("fires onRename AND closes when Rename is clicked", () => {
    const onRename = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onRename, onClose });
    fireEvent.click(screen.getByRole("menuitem", { name: /rename/i }));
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onDuplicate AND closes when Duplicate is clicked", () => {
    const onDuplicate = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onDuplicate, onClose });
    fireEvent.click(screen.getByRole("menuitem", { name: /duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onDownload AND closes when Download is clicked", () => {
    const onDownload = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onDownload, onClose });
    fireEvent.click(screen.getByRole("menuitem", { name: /download/i }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onDelete AND closes when Delete is clicked", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onDelete, onClose });
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on click-away (mousedown outside the menu)", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT close on mousedown inside the menu", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("focuses the first item when opened", () => {
    renderMenu();
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: /rename/i })
    );
  });

  it("ArrowDown moves focus to the next item; ArrowUp moves it back", () => {
    renderMenu();
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    // Starts on first (Rename).
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("Enter activates the focused item (fires its callback AND closes)", () => {
    const onDuplicate = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onDuplicate, onClose });
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" }); // move to Duplicate
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("flips DOWNWARD by default (top-full, opens below the trigger)", () => {
    renderMenu();
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("top-full");
    expect(menu).not.toHaveClass("bottom-full");
  });

  it("flips UPWARD when anchorNearBottom is set (bottom-full)", () => {
    renderMenu({ anchorNearBottom: true });
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("bottom-full");
    expect(menu).not.toHaveClass("top-full");
  });
});
