// @vitest-environment jsdom
//
// Menu — the dropdown-menu shell extracted from RowMenu (#139).
//
// RowMenu.test.jsx is the behavioural regression gate for everything that was
// already house behaviour and must not have changed. THIS file covers the two
// things that are new: the generic `items` API, and FOCUS RETURN — Escape and
// item activation put focus back on the trigger, click-away deliberately does
// not.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import Menu from "./Menu";

function renderMenu(props = {}) {
  const items = props.items ?? [
    { label: "Copy", onActivate: () => {} },
    { label: "Paste", onActivate: () => {} },
    { separator: true },
    { label: "Delete", danger: true, onActivate: () => {} },
  ];
  return render(
    <div>
      <button type="button" data-testid="trigger">
        trigger
      </button>
      <Menu open onClose={() => {}} className="menu-panel" {...props} items={items} />
    </div>,
  );
}

// The real sequence: the trigger is focused (by the click that opened the menu),
// and only THEN does the menu open. Rendering closed-then-open reproduces that
// order, which is what the focus-capture effect keys off.
function openFromTrigger(props = {}) {
  const items = props.items ?? [{ label: "Copy", onActivate: () => {} }];
  const tree = (open) => (
    <div>
      <button type="button" data-testid="trigger">
        trigger
      </button>
      <Menu open={open} onClose={() => {}} className="menu-panel" {...props} items={items} />
    </div>
  );
  const api = render(tree(false));
  const trigger = screen.getByTestId("trigger");
  trigger.focus();
  api.rerender(tree(true));
  return { ...api, trigger };
}

describe("Menu — the items API", () => {
  it("renders an item per entry, in order, with separators outside arrow nav", () => {
    renderMenu();
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Copy",
      "Paste",
      "Delete",
    ]);
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
  });

  it("skips falsy entries so a caller can inline `cond && {...}`", () => {
    const showNever = false; // stands in for a caller's runtime condition
    renderMenu({
      items: [
        { label: "Always", onActivate: () => {} },
        showNever && { label: "Never", onActivate: () => {} },
        null,
        undefined,
        { label: "Also", onActivate: () => {} },
      ],
    });
    expect(
      within(screen.getByRole("menu"))
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Always", "Also"]);
  });

  it("renders an icon beside the label without disturbing the accessible name", () => {
    renderMenu({
      items: [
        {
          label: "Copy",
          icon: <svg data-testid="ic" aria-hidden="true" />,
          onActivate: () => {},
        },
      ],
    });
    const item = screen.getByRole("menuitem", { name: /copy/i });
    expect(within(item).getByTestId("ic")).toBeInTheDocument();
    expect(item.textContent).toBe("Copy");
  });

  it("marks a danger item with the destructive token", () => {
    renderMenu();
    expect(screen.getByRole("menuitem", { name: /delete/i }).className).toMatch(
      /text-tone-strong/,
    );
    expect(screen.getByRole("menuitem", { name: /copy/i }).className).not.toMatch(
      /text-tone-strong/,
    );
  });

  it("takes the container className verbatim — Menu contributes no positioning", () => {
    renderMenu({ className: "absolute right-0 top-full custom-thing" });
    const menu = screen.getByRole("menu");
    expect(menu.className).toBe("absolute right-0 top-full custom-thing");
  });

  it("renders nothing when closed", () => {
    render(<Menu open={false} items={[{ label: "X" }]} className="c" />);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("Menu — disabled items keep their hover text reachable", () => {
  it("uses aria-disabled + title, never the disabled attribute, and ignores activation", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    renderMenu({
      onClose,
      items: [
        {
          label: "Paste",
          disabled: true,
          title: "paste unavailable — no motif settings copied",
          onActivate,
        },
      ],
    });
    const item = screen.getByRole("menuitem", { name: /paste/i });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("title", "paste unavailable — no motif settings copied");
    expect(item).not.toHaveAttribute("disabled");
    // No hover variants, so it never lights up under the pointer.
    expect(item.className).toMatch(/opacity-40/);
    expect(item.className).not.toMatch(/hover:/);
    fireEvent.click(item);
    expect(onActivate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Menu — focus return (the #139 fix)", () => {
  it("focuses the first item when it opens", () => {
    renderMenu();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /copy/i }));
  });

  it("Escape returns focus to the trigger instead of stranding it on <body>", () => {
    const onClose = vi.fn();
    const { trigger } = openFromTrigger({ onClose });
    // The menu took focus off the trigger when it opened.
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: /copy/i }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("activating an item returns focus to the trigger and closes", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    const { trigger } = openFromTrigger({
      onClose,
      items: [{ label: "Copy", onActivate }],
    });
    fireEvent.click(screen.getByRole("menuitem", { name: /copy/i }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("click-away closes WITHOUT stealing focus back", () => {
    const onClose = vi.fn();
    openFromTrigger({ onClose });
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    fireEvent.mouseDown(outside);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The user placed focus by clicking; the menu must not yank it away.
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("does not throw — or strand focus oddly — when the trigger unmounts under the menu", () => {
    const onClose = vi.fn();
    const { trigger } = openFromTrigger({ onClose });
    trigger.remove(); // e.g. a Delete that removes the row the ⋯ lives in
    expect(() =>
      fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" }),
    ).not.toThrow();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Menu — keyboard navigation", () => {
  it("ArrowDown / ArrowUp cycle focus through the items, skipping separators", () => {
    renderMenu();
    const menu = screen.getByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[2]); // separator skipped
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]); // wraps
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
  });

  it("Enter activates the focused item exactly once", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    renderMenu({
      onClose,
      items: [{ label: "Copy", onActivate }],
    });
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Enter" });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
