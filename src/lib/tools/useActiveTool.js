import { useReducer, useCallback } from 'react';
import { getTool, toolForKey } from './toolRegistry.js';

// Active-tool state + canvas pointer-event router (plan §1 row 10, §7 P1 item 5).
//
// This slice owns *which* tool is active and *routes* raw pointer/keyboard
// events to the active tool's handlers. It deliberately contains NO move /
// rotate / resize / create logic — that's later wiring. The behavior defaults
// from the plan (V=select, T=text, Esc=deselect, click=select, drag=move) only
// inform handler NAMES/contracts the router dispatches on, not behavior here.
//
// Pure, React-free core (reducer + keymap + router) is exported for direct unit
// testing per the constraint; the hook below is a thin useReducer wrapper.

export const DEFAULT_TOOL = 'select';

// Fresh state for a tool session. activeTool defaults to select.
export function initState() {
  return { activeTool: DEFAULT_TOOL };
}

// Pure reducer. Switching is gated on the registry: a `setActiveTool` to an
// unregistered id is ignored (returns the same object, so React bails the
// render). Selecting a *registered-but-disabled* tool (text) IS allowed — the
// disabled flag rides on the action for callers/telemetry, not the reducer.
export function toolReducer(state, action) {
  switch (action?.type) {
    case 'setActiveTool': {
      if (!getTool(action.id)) return state;
      if (state.activeTool === action.id) return state;
      return { ...state, activeTool: action.id };
    }
    default:
      return state;
  }
}

// Map a keyboard key to a reducer action, or null if unmapped.
//   v → select, t → text (allowed but flagged disabled), Escape → select.
// Returns a plain action so the hook can dispatch it and callers can inspect
// `disabled` (e.g. to surface a "coming soon" hint) without re-deriving it.
export function resolveKey(key) {
  if (key === 'Escape') {
    // Esc returns to / stays on Select (the "deselect" gesture). Clearing the
    // current selection is later wiring — no selection state exists this slice.
    return { type: 'setActiveTool', id: DEFAULT_TOOL };
  }
  const tool = toolForKey(key);
  if (!tool) return null;
  const action = { type: 'setActiveTool', id: tool.id };
  if (tool.enabled === false) action.disabled = true;
  return action;
}

// Route a pointer event to the active tool's handler. Pure and total: a safe
// no-op (returns undefined) when there's no handler map for the tool or no
// handler for the event type. Returns the handler's result otherwise.
//
//   routePointer(activeTool, eventType, payload, handlersByTool)
//
// `handlersByTool` shape: { [toolId]: { [eventType]: (payload) => any } }.
// eventType names follow DOM pointer events (pointerdown/move/up) plus any
// tool-specific gestures a later slice wires in (e.g. 'dragMove').
export function routePointer(activeTool, eventType, payload, handlersByTool) {
  return handlersByTool?.[activeTool]?.[eventType]?.(payload);
}

// Thin React wrapper. Holds the reducer state and exposes a stable API:
//   { activeTool, setActiveTool, handleKeyDown, routePointer }
// handleKeyDown consumes a KeyboardEvent: if the key maps to a tool it
// preventDefault()s and dispatches. routePointer is bound to the live
// activeTool so callers pass only (eventType, payload, handlersByTool).
export default function useActiveTool() {
  const [state, dispatch] = useReducer(toolReducer, undefined, initState);

  const setActiveTool = useCallback((id) => dispatch({ type: 'setActiveTool', id }), []);

  const handleKeyDown = useCallback((e) => {
    const action = resolveKey(e?.key);
    if (!action) return;
    e?.preventDefault?.();
    dispatch(action);
  }, []);

  const route = useCallback(
    (eventType, payload, handlersByTool) =>
      routePointer(state.activeTool, eventType, payload, handlersByTool),
    [state.activeTool],
  );

  return {
    activeTool: state.activeTool,
    setActiveTool,
    handleKeyDown,
    routePointer: route,
  };
}
