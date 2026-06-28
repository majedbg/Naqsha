// RowMenu — the per-row "⋯" overflow popper for the Object Tree panel
// (Object Tree Panel plan, spec §4 / WI-4).
//
// Standalone & reusable. Follows the locked OperationPicker precedent: a
// controlled `open` prop, rendered INLINE (NOT portaled to body) "so it's found
// by `within(region)` shell tests", `role="menu"` on the container with
// `role="menuitem"` children, and Escape closing via `onClose`.
//
// Trigger ownership: like OperationPicker, RowMenu renders ONLY the menu panel.
// The ⋯ button that toggles it lives in the LayerTree row (wired in WI-5); the
// caller owns the trigger and the one-at-a-time open guarantee. RowMenu just
// honors the controlled `open` and surfaces item callbacks.
//
// Items, top→bottom: Rename · Duplicate · Download · —divider— · Delete.
// Delete carries the project's destructive token (`tone-strong`, the same
// semantic token ConfirmDialog uses for destructive actions).
//
// Dismiss: Escape closes, click-away (mousedown outside) closes, and selecting
// any item fires its callback AND closes. Keyboard: ↑/↓ move focus between
// items, Enter activates the focused item. Flips upward (bottom-full) when
// `anchorNearBottom` is set so a row near the panel's bottom edge isn't clipped.

import { useEffect, useRef } from "react";

const ITEM_CLASS =
  "flex w-full items-center rounded-xs px-1.5 py-1 text-left text-[11px] " +
  "transition-colors duration-fast ease-out-quart text-ink-soft hover:bg-paper-warm hover:text-ink";

// Delete reuses `tone-strong` — the project's semantic destructive token (the
// text variant, since a menuitem is text rather than a filled button).
const DANGER_ITEM_CLASS =
  "flex w-full items-center rounded-xs px-1.5 py-1 text-left text-[11px] " +
  "transition-colors duration-fast ease-out-quart text-tone-strong hover:bg-tone-strong/10 hover:text-tone-strong";

// Disabled: no `hover:` variants (so it never lights up under the pointer) and a
// reduced opacity to read as inert. Activation is also guarded in the handler.
const DISABLED_ITEM_CLASS =
  "flex w-full items-center rounded-xs px-1.5 py-1 text-left text-[11px] " +
  "text-ink-soft opacity-40 cursor-default";

// Rendered as a div (not a <button>) on purpose: native buttons synthesize a
// click from Enter in real browsers, which — combined with the explicit Enter
// handler below (needed because jsdom does NOT synthesize that click) — would
// double-activate in-app. A div has no native Enter→click, so the explicit
// handler is the SOLE activation path, identical in jsdom and every browser.
// `role="menuitem"` + tabIndex keep it focusable and ARIA-conformant.
function MenuItem({ label, danger, disabled, onActivate }) {
  const className = disabled
    ? DISABLED_ITEM_CLASS
    : danger
      ? DANGER_ITEM_CLASS
      : ITEM_CLASS;
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onActivate}
      className={className}
    >
      {label}
    </div>
  );
}

export default function RowMenu({
  open = false,
  anchorNearBottom = false,
  onClose = () => {},
  onRename = () => {},
  onDuplicate = () => {},
  onDownload = () => {},
  onClearLayers,
  clearLayersDisabled = false,
  clearLayersLabel = "Clear all layers",
  onDelete = () => {},
}) {
  const menuRef = useRef(null);

  // Click-away: OperationPicker punts this to the trigger's overlay, but WI-4
  // requires RowMenu to own it. Listen on mousedown (distinct from the item
  // `click` path, so selecting an item never trips the away-handler).
  useEffect(() => {
    if (!open) return undefined;
    function onMouseDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, onClose]);

  // Focus the first item on open: gives the arrow keys a defined start, lets
  // Enter resolve to a real menuitem, and lets Escape bubble to the container.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector('[role="menuitem"]');
    first?.focus();
  }, [open]);

  if (!open) return null;

  function moveFocus(delta) {
    const items = Array.from(
      menuRef.current?.querySelectorAll('[role="menuitem"]') ?? []
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement);
    const next = (current + delta + items.length) % items.length;
    items[next]?.focus();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === "Enter") {
      // jsdom doesn't synthesize a click from Enter on a button, so route Enter
      // through the same click path the mouse uses (fires callback AND closes).
      e.preventDefault();
      if (typeof document.activeElement?.click === "function") {
        document.activeElement.click();
      }
    }
  }

  const select = (cb) => () => {
    cb();
    onClose();
  };

  // Inline + flip: open below by default (top-full), flip above (bottom-full)
  // when the anchoring row sits near the panel's bottom edge.
  const flipClass = anchorNearBottom ? "bottom-full mb-1" : "top-full mt-1";

  // Right-anchor (`right-0`): the ⋯ trigger sits at the panel's right edge, so a
  // left-anchored menu would grow 140px rightward — off the panel, where the
  // tree's `overflow-auto` scroll container clips it (the reported bug). Opening
  // leftward keeps the whole menu inside the panel.
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Row actions"
      data-testid="row-menu"
      onKeyDown={onKeyDown}
      className={`absolute right-0 z-50 ${flipClass} min-w-[140px] rounded-sm border border-hairline bg-paper p-1 shadow-pop`}
    >
      <MenuItem label="Rename" onActivate={select(onRename)} />
      <MenuItem label="Duplicate" onActivate={select(onDuplicate)} />
      <MenuItem label="Download" onActivate={select(onDownload)} />
      {onClearLayers && (
        <MenuItem
          label={clearLayersLabel}
          disabled={clearLayersDisabled}
          onActivate={select(onClearLayers)}
        />
      )}
      <div role="separator" className="my-1 border-t border-hairline" />
      <MenuItem label="Delete" danger onActivate={select(onDelete)} />
    </div>
  );
}
