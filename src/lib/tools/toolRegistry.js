// Tool registry for the canvas editing surface (plan §1 row 10).
//
// The app's first tool system. Each tool is a small descriptor the canvas
// toolbar renders and the keymap resolves:
//   { id, label, key, cursor, enabled? }
// `select` is the always-available default; `text` is registered now so the
// toolbar slot + `T` keybinding exist, but is flagged `enabled:false` until the
// P2 text core lands. Routing/state (useActiveTool) reads tool ids, not this
// module's order, so registration order only drives toolbar layout + listTools.

const TOOLS = [
  { id: 'select', label: 'Select', key: 'v', cursor: 'default' },
  // P2 placeholder — registered (keymap + toolbar slot) but not yet usable.
  { id: 'text', label: 'Text', key: 't', cursor: 'text', enabled: false },
];

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));
const BY_KEY = new Map(TOOLS.map((t) => [t.key.toLowerCase(), t]));

// Look up a tool by id. Returns undefined for unknown ids.
export function getTool(id) {
  return BY_ID.get(id);
}

// Resolve a single-character keybinding to its tool (case-insensitive).
// Returns undefined for an unmapped key.
export function toolForKey(key) {
  if (typeof key !== 'string') return undefined;
  return BY_KEY.get(key.toLowerCase());
}

// Every registered tool, in registration (toolbar) order.
export function listTools() {
  return [...TOOLS];
}
