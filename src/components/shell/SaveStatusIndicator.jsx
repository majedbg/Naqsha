// SaveStatusIndicator (Rec 1) — the inline save-state surface for the menu bar.
//
// This app has no toast system (see Studio.jsx:506 / 941), so cloud-save state
// is shown inline next to an editable document name. Purely presentational: it
// renders the resolved { kind, label } from resolveSaveStatus, formats the
// saved timestamp, exposes a Retry on error, and commits an inline rename on
// Enter/blur. All state transitions live in useCloudPersistence — this only
// reflects them and forwards intent up via onRetry / onRename.

import { useEffect, useRef, useState } from "react";

function formatSavedTime(lastSavedAt) {
  if (!lastSavedAt) return "";
  return new Date(lastSavedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SaveStatusIndicator({
  status,
  lastSavedAt,
  onRetry,
  name,
  onRename,
}) {
  const kind = status?.kind ?? "idle";
  const label = status?.label ?? "";

  // Local draft mirrors the committed `name`; commit (Enter/blur) trims and
  // rejects empty/unchanged, matching the LayerTree inline-rename precedent.
  const [draft, setDraft] = useState(name);
  const inputRef = useRef(null);
  useEffect(() => {
    setDraft(name);
  }, [name]);

  const commit = () => {
    const trimmed = (draft ?? "").trim();
    if (trimmed && trimmed !== name) {
      onRename?.(trimmed);
    } else {
      setDraft(name);
    }
  };

  const savedTime = kind === "saved" ? formatSavedTime(lastSavedAt) : "";

  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        ref={inputRef}
        type="text"
        aria-label="Document name"
        value={draft ?? ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            inputRef.current?.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(name);
            inputRef.current?.blur();
          }
        }}
        className="min-w-0 max-w-[160px] rounded-xs border border-transparent bg-transparent px-1 py-0 text-ink hover:border-hairline focus:border-violet outline-none transition-colors duration-fast"
      />

      {label && (
        <span
          role="status"
          aria-live="polite"
          className={`flex items-center gap-1.5 whitespace-nowrap ${
            kind === "error" ? "text-danger" : "text-ink-soft"
          }`}
        >
          <span>
            {label}
            {savedTime ? ` ${savedTime}` : ""}
          </span>
          {kind === "error" && (
            <button
              type="button"
              onClick={() => onRetry?.()}
              className="rounded-xs px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-paper-warm transition-colors duration-fast"
            >
              Retry
            </button>
          )}
        </span>
      )}
    </div>
  );
}
