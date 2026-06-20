import { useState, useEffect, useRef } from "react";
import { DEFAULT_TOOL_ID, resolveToolByKey } from "../tools/toolRegistry";

const isSpaceKey = (key) => key === " " || key === "Spacebar";

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
  // Tool to restore when a spring-loaded Space-to-pan is released. Null when not
  // currently holding Space for a temporary Hand.
  const springReturnRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextEntryTarget(e.target)) return;
      const toolId = resolveToolByKey(e.key);
      if (!toolId) return;
      // Space would otherwise scroll the page; claim it for the hand tool.
      e.preventDefault();
      // Spring-loaded Hand: HOLD Space to pan, RELEASE to revert to the prior
      // tool (Figma/Illustrator convention). Auto-repeat keydowns are ignored so
      // the tool to restore is captured exactly once, at the initial press.
      if (isSpaceKey(e.key)) {
        if (e.repeat || springReturnRef.current != null) return;
        setActiveTool((cur) => {
          if (cur !== "hand") springReturnRef.current = cur;
          return "hand";
        });
        return;
      }
      // A different tool was chosen by key while Space is held — drop the
      // pending spring-return so releasing Space doesn't yank it back.
      springReturnRef.current = null;
      setActiveTool(toolId);
    };
    const onKeyUp = (e) => {
      if (!isSpaceKey(e.key)) return;
      const restore = springReturnRef.current;
      springReturnRef.current = null;
      if (restore != null) setActiveTool(restore);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [enabled]);

  return { activeTool, setActiveTool };
}
