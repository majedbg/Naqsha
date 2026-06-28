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

  it("renders a 'Clear all layers' item between Download and Delete when onClearLayers is provided", () => {
    renderMenu({ onClearLayers: () => {} });
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent(/rename/i);
    expect(items[1]).toHaveTextContent(/duplicate/i);
    expect(items[2]).toHaveTextContent(/download/i);
    expect(items[3]).toHaveTextContent(/clear all layers/i);
    expect(items[4]).toHaveTextContent(/delete/i);
    // Clear all layers is NOT destructive — Delete stays the sole danger item.
    expect(items[3].className).not.toMatch(/text-tone-strong/);
    // Divider still separates the clear-layers item from Delete.
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
  });

  it("fires onClearLayers AND closes when Clear all layers is clicked", () => {
    const onClearLayers = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onClearLayers, onClose });
    fireEvent.click(screen.getByRole("menuitem", { name: /clear all layers/i }));
    expect(onClearLayers).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("marks the Clear all layers item aria-disabled (with disabled styling) and ignores activation when clearLayersDisabled is set", () => {
    const onClearLayers = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onClearLayers, onClose, clearLayersDisabled: true });
    const item = screen.getByRole("menuitem", { name: /clear all layers/i });
    expect(item).toHaveAttribute("aria-disabled", "true");
    // Disabled styling: dimmed and no hover affordance.
    expect(item.className).toMatch(/opacity-40/);
    expect(item.className).not.toMatch(/hover:/);
    fireEvent.click(item);
    expect(onClearLayers).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("uses a custom clearLayersLabel when provided", () => {
    renderMenu({ onClearLayers: () => {}, clearLayersLabel: "Wipe layers" });
    expect(
      screen.getByRole("menuitem", { name: /wipe layers/i })
    ).toBeInTheDocument();
  });

  it("does NOT set aria-disabled on the Clear all layers item by default", () => {
    renderMenu({ onClearLayers: () => {} });
    const item = screen.getByRole("menuitem", { name: /clear all layers/i });
    expect(item).not.toHaveAttribute("aria-disabled");
  });

  it("arrow nav traverses past a disabled Clear all layers item and Enter still activates an enabled item", () => {
    const onClearLayers = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onClearLayers, onDelete, onClose, clearLayersDisabled: true });
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    // Rename → Duplicate → Download → Clear all layers (disabled) → Delete.
    fireEvent.keyDown(menu, { key: "ArrowDown" }); // Duplicate
    fireEvent.keyDown(menu, { key: "ArrowDown" }); // Download
    fireEvent.keyDown(menu, { key: "ArrowDown" }); // Clear all layers (disabled)
    expect(document.activeElement).toBe(items[3]);
    // Enter on the disabled item is a no-op (no callback, menu stays open).
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onClearLayers).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Arrows move past it to Delete, and Enter there still fires.
    fireEvent.keyDown(menu, { key: "ArrowDown" }); // Delete
    expect(document.activeElement).toBe(items[4]);
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("omits Download when onDownload is absent (order Rename · Duplicate · — · Delete, and with onClearLayers: Rename · Duplicate · Clear all layers · — · Delete)", () => {
    const { rerender } = renderMenu({ onDownload: undefined });
    let menu = screen.getByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", { name: /download/i })
    ).not.toBeInTheDocument();
    expect(
      within(menu).getAllByRole("menuitem").map((i) => i.textContent)
    ).toEqual(["Rename", "Duplicate", "Delete"]);

    rerender(
      <RowMenu
        open
        onClose={() => {}}
        onRename={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onClearLayers={() => {}}
      />
    );
    menu = screen.getByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", { name: /download/i })
    ).not.toBeInTheDocument();
    expect(
      within(menu).getAllByRole("menuitem").map((i) => i.textContent)
    ).toEqual(["Rename", "Duplicate", "Clear all layers", "Delete"]);
  });

  it("keeps the order Rename · Duplicate · Download · — · Delete when onClearLayers is absent (regression)", () => {
    renderMenu();
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.textContent)).toEqual([
      "Rename",
      "Duplicate",
      "Download",
      "Delete",
    ]);
  });

  it("disables Duplicate (aria-disabled + title) and ignores activation when duplicateDisabled is set", () => {
    const onDuplicate = vi.fn();
    const onClose = vi.fn();
    renderMenu({
      onDuplicate,
      onClose,
      duplicateDisabled: true,
      duplicateTitle: "Duplicate not allowed here",
    });
    const item = screen.getByRole("menuitem", { name: /duplicate/i });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "Duplicate not allowed here");
    fireEvent.click(item);
    expect(onDuplicate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables Delete (aria-disabled + title, still danger) and ignores activation when deleteDisabled is set", () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    renderMenu({
      onDelete,
      onClose,
      deleteDisabled: true,
      deleteTitle: "Cannot delete the last panel",
    });
    const item = screen.getByRole("menuitem", { name: /delete/i });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "Cannot delete the last panel");
    fireEvent.click(item);
    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("carries clearLayersTitle on the Clear all layers item when provided", () => {
    renderMenu({
      onClearLayers: () => {},
      clearLayersTitle: "No layers to clear",
    });
    expect(
      screen.getByRole("menuitem", { name: /clear all layers/i })
    ).toHaveAttribute("title", "No layers to clear");
  });

  it("Duplicate and Delete still fire+close when no disabled flags are set (regression)", () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onDuplicate, onDelete, onClose });
    fireEvent.click(screen.getByRole("menuitem", { name: /duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(2);
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
