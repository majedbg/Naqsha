// isTextEntryTarget — whether a keydown target is a genuine TEXT-ENTRY surface
// that owns a native text cursor and native undo. That is the ONLY case where
// the global ⌘Z must NOT hijack, so native text-cursor undo survives (plan
// D4/§9). Non-text controls — range sliders, checkboxes, radios, color/date
// pickers, <select> — have no native undo, so ⌘Z should fall through to the
// document history.
//
// Refined after browser verification: the original guard matched ANY <input>,
// so a focused range slider (the common "drag a slider, then ⌘Z" flow) wrongly
// swallowed the shortcut and undo did nothing until the user clicked away.

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "email",
  "tel",
  "password",
  "number",
]);

export function isTextEntryTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    // `type` defaults to "text" when absent; normalize case so RANGE === range.
    const type = (target.type || "text").toLowerCase();
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}
