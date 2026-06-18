import { useState, useEffect } from "react";
import { DEFAULT_TOOL_ID, resolveToolByKey } from "../tools/toolRegistry";

// useActiveTool — owns the active-tool state for the pro shell's tool strip and
// the keyboard shortcuts that switch tools (Lane B / B6, GitHub issue #9).
//
// CRITICAL — flag-OFF no-op: the keydown listener is bound only when `enabled`
// is true. Studio passes `enabled` = (the tool-strip slot is present), i.e. the
// flag-ON desktop path. On the legacy path no listener is attached, so V/T/space
// keep their default browser behavior and nothing is hijacked.
//
// Hotkeys are also ignored when the event originates inside a text field
// (input / textarea / contenteditable) so typing into e.g. the save-name dialog
// or a future text box never flips the tool.

function isTextEntryTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export default function useActiveTool({ enabled = false } = {}) {
  const [activeTool, setActiveTool] = useState(DEFAULT_TOOL_ID);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextEntryTarget(e.target)) return;
      const toolId = resolveToolByKey(e.key);
      if (!toolId) return;
      // Space would otherwise scroll the page; claim it for the hand tool.
      e.preventDefault();
      setActiveTool(toolId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  return { activeTool, setActiveTool };
}
