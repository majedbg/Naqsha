import { useEffect, useRef } from "react";

// Global Cmd/Ctrl+S → save (Rec 2). Separate from useAutosave because manual
// save must work BEFORE the first cloud save (autosave is gated on a design id),
// and it's the explicit "checkpoint now" affordance. Ignores the keystroke while
// focus is in a text field so editing a param/name never triggers a save, and
// preventDefault()s to suppress the browser's native Save dialog.
const isTextEntry = (t) => {
  if (!t) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  );
};

export default function useSaveHotkey(onSave) {
  // Ref so the listener always calls the latest onSave without rebinding.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  useEffect(() => {
    const handler = (e) => {
      if (e.key !== "s" && e.key !== "S") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isTextEntry(e.target)) return;
      e.preventDefault();
      onSaveRef.current?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
