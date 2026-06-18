// toolRegistry.js — single source of truth for the left tool strip (Lane B / B6,
// GitHub issue #9).
//
// Scope per decision 6 / PRD §5.2 B6: **navigation + existing tools only** —
// Select / Text / Hand-Pan / Zoom — and a fill/stroke operation chip rendered at
// the strip base (the chip's picker is a later slice, #11). There are NO freehand
// drawing tools (rect/ellipse/pen/brush) — explicitly out of scope (decision 6 /
// PRD non-goals). "Add pattern" is NOT a strip tool; it stays the picker modal,
// surfaced as a `+` in the object tree (#5).
//
// A static module like `patternRegistry.js`: no React, trivially unit-testable.
// The key map resolves the existing keybindings V (select), T (text) and the
// space-to-pan convention (hand). Zoom has no single-letter hotkey — it is
// reachable via its strip button and the canvas wheel.

export const TOOLS = {
  select: {
    id: "select",
    label: "Select",
    hotkey: "V",
    description: "Select and move objects",
  },
  text: {
    id: "text",
    label: "Text",
    hotkey: "T",
    description: "Add and edit text",
  },
  hand: {
    id: "hand",
    label: "Hand",
    hotkey: "Space",
    description: "Pan the canvas",
  },
  zoom: {
    id: "zoom",
    label: "Zoom",
    hotkey: null,
    description: "Zoom the canvas",
  },
};

// Stable display/iteration order for the strip.
export const TOOL_IDS = ["select", "text", "hand", "zoom"];

// The tool the strip starts on.
export const DEFAULT_TOOL_ID = "select";

export function getTool(id) {
  return TOOLS[id] ?? null;
}

// Resolve a keyboard key (KeyboardEvent.key) to a tool id, or null if the key is
// not a tool shortcut. Case-insensitive for the letter keys; the space bar maps
// to Hand (the pan convention). Accepts the legacy "Spacebar" key value too.
export function resolveToolByKey(key) {
  if (key === " " || key === "Spacebar") return "hand";
  switch (String(key).toLowerCase()) {
    case "v":
      return "select";
    case "t":
      return "text";
    default:
      return null;
  }
}
