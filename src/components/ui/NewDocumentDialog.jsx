import { useEffect, useRef } from "react";

/**
 * The prompt File → New shows when the current document has unsaved work.
 *
 * A dedicated dialog (rather than an extended ConfirmDialog) because this is a
 * multi-action choice — Save to cloud / Export SVG / Discard / Cancel — not the
 * two-way confirm/cancel ConfirmDialog's existing callers rely on. It shares
 * that house style: paper ground, hairline edge, one destructive action in the
 * project's `tone-strong` red; everything else stays quiet.
 *
 * Controlled: render it always; it returns null when `open` is false.
 * - `actions` is the descriptor list from resolveNewDocumentActions
 *   ({ id, label, danger? }); each renders a button.
 * - `onAction(id)` reports the chosen action. Escape and a backdrop click both
 *   report "cancel" (the caller keeps the document).
 * - Focus moves into the dialog on open and returns to whatever was focused
 *   before (the File menu item) when it closes — the a11y contract for a modal.
 */
export default function NewDocumentDialog({ open, actions = [], onAction }) {
  const primaryRef = useRef(null);
  // Where focus sat before the dialog opened, so it can be handed back on close.
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    // Remember the pre-open focus, move focus in, and restore on close/unmount.
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    primaryRef.current?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onAction?.("cancel");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [open, onAction]);

  if (!open) return null;

  return (
    <div
      data-testid="new-document-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center p-md bg-ink/40 anim-fade"
      onClick={() => onAction?.("cancel")}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="new-document-title"
        aria-describedby="new-document-message"
        className="w-full max-w-[340px] bg-paper border border-hairline rounded-md p-lg shadow-[0_12px_48px_-16px_oklch(0.24_0.05_270_/_0.35)] anim-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="new-document-title"
          className="display text-md text-ink leading-tight"
        >
          Start a new document
        </h2>
        <p
          id="new-document-message"
          className="mt-2xs text-sm text-ink-soft leading-snug"
        >
          Your current work has unsaved changes.
        </p>
        <div className="mt-lg flex items-center justify-end gap-xs">
          {actions.map((action, i) => {
            // Discard is the sole destructive action (project's `tone-strong`
            // token, text flips to paper for legibility). Cancel stays a quiet
            // text button; the two save/export choices read as calm secondaries.
            const className = action.danger
              ? "px-md py-2xs rounded-xs text-sm font-medium text-paper bg-tone-strong hover:bg-tone-strong/90 transition-colors duration-fast ease-out-quart"
              : action.id === "cancel"
                ? "px-sm py-2xs rounded-xs text-sm text-ink-soft hover:text-ink transition-colors duration-fast ease-out-quart"
                : "px-md py-2xs rounded-xs text-sm text-ink border border-hairline hover:bg-ink/5 transition-colors duration-fast ease-out-quart";
            return (
              <button
                key={action.id}
                ref={i === 0 ? primaryRef : undefined}
                type="button"
                onClick={() => onAction?.(action.id)}
                className={className}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
