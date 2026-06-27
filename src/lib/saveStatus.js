// Pure save-status resolver (Rec 1 — make cloud-save state observable).
//
// Collapses the raw save signals into a single { kind, label } the indicator
// renders. Precedence is load-bearing: saving > error > dirty > saved > idle.
// Stays PURE + deterministic — it does NOT format lastSavedAt (the component
// formats the timestamp); it only reports whether a saved baseline exists.
export function resolveSaveStatus({ saving, error, dirty, lastSavedAt } = {}) {
  if (saving) return { kind: "saving", label: "Saving…" };
  if (error) return { kind: "error", label: "Couldn't save" };
  if (dirty) return { kind: "dirty", label: "Unsaved changes" };
  if (lastSavedAt) return { kind: "saved", label: "Saved" };
  return { kind: "idle", label: "" };
}
