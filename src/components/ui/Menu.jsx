// Menu — the app's dropdown-menu shell, as a primitive.
//
// Extracted from `shell/RowMenu` (#139), which had itself grown as the second
// implementation of the `OperationPicker` precedent. RowMenu is now a thin
// caller; the glyph popover's "…" menu is another. Everything below was already
// house behaviour and is preserved verbatim — the only new thing is focus
// return (see `close`).
//
// Deliberate choices carried over from RowMenu, each with a reason:
//
//  • Rendered INLINE, never portalled — "so it's found by `within(region)` shell
//    tests". Positioning is the CALLER's job: it passes the full container
//    className, so a caller can flip, right-anchor or fix-position however its
//    own layout demands, and this file never has to know.
//
//  • Items are DIVS with `role="menuitem"`, not <button>s. A native button
//    synthesizes a click from Enter in real browsers but NOT in jsdom; combined
//    with the explicit Enter handler here that would double-activate in-app. A
//    div has no native Enter→click, so the explicit handler is the SOLE
//    activation path, identical in jsdom and every browser.
//
//  • Disabled items are `aria-disabled` + `title`, never the `disabled`
//    attribute: `disabled` suppresses pointer events, which would also suppress
//    the hover text explaining WHY the item is unavailable. Activation is
//    additionally guarded in the handler.
//
//  • Click-away listens on `mousedown`, distinct from the item `click` path, so
//    selecting an item never trips the away-handler.
//
// NEW in #139 — FOCUS RETURN. Escape and item-activation put focus back where
// it was when the menu opened (the trigger); click-away deliberately does NOT,
// because the user has already placed focus by clicking. Previously Escape left
// focus on <body> and the keyboard user was stranded. This is self-contained —
// the element is captured at open time, so no caller passes a trigger ref.
import { useEffect, useRef } from "react";

const BASE_ITEM =
  "flex w-full items-center gap-2xs rounded-xs px-1.5 py-1 text-left text-[11px] ";

export const MENU_ITEM_CLASS =
  BASE_ITEM +
  "transition-colors duration-fast ease-out-quart text-ink-soft hover:bg-paper-warm hover:text-ink";

// Destructive items reuse `tone-strong` — the project's semantic destructive
// token (the text variant, since a menuitem is text rather than a filled button).
export const MENU_DANGER_CLASS =
  BASE_ITEM +
  "transition-colors duration-fast ease-out-quart text-tone-strong hover:bg-tone-strong/10 hover:text-tone-strong";

// No `hover:` variants (so it never lights up under the pointer) and a reduced
// opacity to read as inert.
export const MENU_DISABLED_CLASS = BASE_ITEM + "text-ink-soft opacity-40 cursor-default";

function MenuItem({ label, icon, danger, disabled, title, onActivate }) {
  const className = disabled
    ? MENU_DISABLED_CLASS
    : danger
      ? MENU_DANGER_CLASS
      : MENU_ITEM_CLASS;
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      title={title || undefined}
      onClick={disabled ? undefined : onActivate}
      className={className}
    >
      {icon}
      {label}
    </div>
  );
}

/**
 * @param {object}   props
 * @param {boolean}  props.open
 * @param {Array}    props.items  Entries are either `{ separator: true }` or
 *   `{ key?, label, icon?, danger?, disabled?, title?, onActivate }`. Falsy
 *   entries are skipped, so a caller can inline `cond && {...}` and keep the
 *   list readable. Selecting an item fires `onActivate` AND closes.
 * @param {() => void} props.onClose  Called with no arguments, always.
 * @param {string}   props.ariaLabel
 * @param {string}   props.className  The FULL container class string, including
 *   position/flip/width — this component contributes none of it.
 * @param {string}  [props.testId]
 */
export default function Menu({
  open = false,
  items = [],
  onClose = () => {},
  ariaLabel = "Menu",
  className = "",
  testId,
}) {
  const menuRef = useRef(null);
  // Whatever had focus when the menu opened — the trigger, in every real case.
  const returnFocusRef = useRef(null);

  // Capture the outgoing focus BEFORE the first item steals it. Runs only on the
  // open→ transition, so re-renders while open never overwrite it.
  useEffect(() => {
    if (!open) {
      returnFocusRef.current = null;
      return;
    }
    returnFocusRef.current = document.activeElement;
    const first = menuRef.current?.querySelector('[role="menuitem"]');
    first?.focus();
  }, [open]);

  const close = (restoreFocus) => {
    if (restoreFocus) {
      const el = returnFocusRef.current;
      // isConnected: the trigger may have unmounted underneath us (a Delete that
      // removes the row it lives in). Focusing a detached node is a no-op that
      // silently strands focus on <body> — exactly the bug being fixed.
      if (el && el.isConnected && typeof el.focus === "function") el.focus();
    }
    onClose();
  };

  // Click-away closes WITHOUT restoring: the user already placed focus.
  useEffect(() => {
    if (!open) return undefined;
    function onMouseDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, onClose]);

  if (!open) return null;

  function moveFocus(delta) {
    const nodes = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? []);
    if (nodes.length === 0) return;
    const current = nodes.indexOf(document.activeElement);
    const next = (current + delta + nodes.length) % nodes.length;
    nodes[next]?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === "Enter") {
      // jsdom doesn't synthesize a click from Enter on a div, so route Enter
      // through the same click path the mouse uses (fires callback AND closes).
      e.preventDefault();
      if (typeof document.activeElement?.click === "function") {
        document.activeElement.click();
      }
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      data-testid={testId}
      onKeyDown={onKeyDown}
      className={className}
    >
      {items.filter(Boolean).map((item, i) =>
        item.separator ? (
          <div
            key={item.key ?? `sep-${i}`}
            role="separator"
            className="my-1 border-t border-hairline"
          />
        ) : (
          <MenuItem
            key={item.key ?? item.label ?? i}
            label={item.label}
            icon={item.icon}
            danger={item.danger}
            disabled={item.disabled}
            title={item.title}
            onActivate={
              item.disabled
                ? undefined
                : () => {
                    item.onActivate?.();
                    close(true);
                  }
            }
          />
        ),
      )}
    </div>
  );
}
