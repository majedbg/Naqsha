import { useEffect, useRef } from 'react';

/**
 * A small, on-brand confirmation dialog. Paper ground, hairline edge, one
 * load-bearing saffron action — never the native window.confirm(), which would
 * jar against the rest of the interface.
 *
 * Controlled: render it always; it returns null when `open` is false.
 * Esc cancels, Enter confirms, focus lands on the confirm action on open.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel?.();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-md bg-ink/40 anim-fade"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={message ? 'confirm-dialog-message' : undefined}
        className="w-full max-w-[320px] bg-paper border border-hairline rounded-md p-lg shadow-[0_12px_48px_-16px_oklch(0.24_0.05_270_/_0.35)] anim-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="display text-md text-ink leading-tight"
        >
          {title}
        </h2>
        {message && (
          <p
            id="confirm-dialog-message"
            className="mt-2xs text-sm text-ink-soft leading-snug"
          >
            {message}
          </p>
        )}
        <div className="mt-lg flex items-center justify-end gap-xs">
          <button
            onClick={onCancel}
            className="px-sm py-2xs rounded-xs text-sm text-ink-soft hover:text-ink transition-colors duration-fast ease-out-quart"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-md py-2xs rounded-xs text-sm font-medium text-ink bg-saffron hover:bg-saffron-hover transition-colors duration-fast ease-out-quart"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
