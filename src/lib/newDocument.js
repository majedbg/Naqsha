// File → New: pure policy for the "start a new document" flow.
//
// `onNew` used to add a pattern to the current document. It now starts a FRESH
// document, and — when there is unsaved work — first prompts the user so their
// work is never discarded silently. This module holds the one pure decision in
// that flow: given whether the document is dirty and whether the user is signed
// in, which actions does the prompt offer?
//
// The list is stable and auth-adaptive:
//   - not dirty            → [] (no prompt; New proceeds immediately)
//   - dirty                → Save to cloud · Export SVG · Discard · Cancel
// Export stays present for a signed-in user too (parity: a local SVG is useful
// regardless of the cloud copy). The only auth-dependent field is whether Save
// routes to sign-in first (a guest has no cloud to save to yet).
export function resolveNewDocumentActions({ dirty, signedIn }) {
  if (!dirty) return [];
  return [
    { id: "save", label: "Save to cloud", routesToSignIn: !signedIn },
    { id: "export", label: "Export SVG" },
    { id: "discard", label: "Discard", danger: true },
    { id: "cancel", label: "Cancel" },
  ];
}
