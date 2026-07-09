// PreferencesModal — the app-level Preferences modal (Wave-3 Lane H).
//
// ADR 0001: geometry overflowing the Sheet is cropped at export by default,
// controlled by an app-level preference in a new Ableton-style Preferences
// modal. This is that modal: a left tab rail (Ableton-style) with a SINGLE
// "Export" tab today. The rail is deliberately minimal — it exists so future
// preference groups have a home, NOT to be filled out now.
//
// Presentational + controlled. The preference value lives upstream; this modal
// reads `cropToSheet` in and reports a flip OUT through onChangeCropToSheet(next).
// Lane I persists it via exportSettings (profiles.settings.export, or
// localStorage for guests). No app state, no sibling-lane imports.
//
// Matches the in-repo dialog idiom (ConfirmDialog / DocumentSetupDialog): paper
// ground, hairline edge, Esc cancels, backdrop click closes. NOT a native/shadcn
// dialog.

import { useEffect } from "react";

export default function PreferencesModal({
  open,
  onClose,
  cropToSheet,
  onChangeCropToSheet,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-md bg-ink/40 anim-fade"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        className="w-full max-w-[520px] bg-paper border border-hairline rounded-md shadow-[0_12px_48px_-16px_oklch(0.24_0.05_270_/_0.35)] anim-rise overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline px-lg py-sm">
          <h2
            id="preferences-title"
            className="display text-md text-ink leading-tight"
          >
            Preferences
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-xs px-2xs py-[2px] text-sm text-ink-soft hover:text-ink transition-colors duration-fast ease-out-quart outline-none focus-visible:ring-1 focus-visible:ring-violet"
          >
            Close
          </button>
        </div>

        <div className="flex min-h-[220px]">
          {/* Left tab rail — Ableton-style. One tab today; room for more. */}
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="Preference sections"
            className="w-[140px] shrink-0 border-r border-hairline bg-paper-warm py-sm"
          >
            <button
              type="button"
              role="tab"
              id="pref-tab-export"
              aria-selected="true"
              aria-controls="pref-panel-export"
              className="w-full text-left px-lg py-2xs text-sm font-medium text-ink bg-muted border-l-2 border-violet"
            >
              Export
            </button>
          </div>

          {/* Export panel — the crop-to-Sheet preference. */}
          <div
            role="tabpanel"
            id="pref-panel-export"
            aria-labelledby="pref-tab-export"
            className="flex-1 p-lg"
          >
            <label className="flex items-start justify-between gap-md cursor-pointer">
              <span className="flex flex-col">
                <span className="text-base text-ink leading-snug">
                  Crop paths overflowing the sheet
                </span>
                <span className="mt-1 text-xs text-ink-soft leading-snug">
                  Paths that run past the sheet edge are cropped at export, so the
                  plan, receipt, and file agree.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={cropToSheet}
                aria-label="Crop paths overflowing the sheet"
                onClick={() => onChangeCropToSheet?.(!cropToSheet)}
                className={`shrink-0 mt-[2px] inline-flex h-5 w-9 items-center rounded-full border border-hairline transition-colors duration-fast ease-out-quart outline-none focus-visible:ring-1 focus-visible:ring-violet ${
                  cropToSheet ? "bg-violet" : "bg-muted"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-paper transition-transform duration-fast ease-out-quart ${
                    cropToSheet ? "translate-x-[18px]" : "translate-x-[2px]"
                  }`}
                />
              </button>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
