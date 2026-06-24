import { useCallback, useState } from "react";

// useInspectorDock — WI-1 of the inspector-dock plan. Owns where the Properties
// panel docks (right rail vs bottom shelf) and the bottom-shelf collapsed flag.
//
// Two rules are load-bearing and mirror useTheme / usePanelWidth:
//   1. Persistence is IMPERATIVE — localStorage is written only inside the
//      setter/toggle callbacks, never via a reactive effect. So mounting the
//      hook (which may pick an aspect-ratio default) writes nothing.
//   2. Load coerces unknown/garbage stored values to a safe default (mirrors
//      useTheme's KNOWN_THEMES guard), and a throwing localStorage falls back
//      gracefully (mirrors usePanelWidth's try/catch loadWidth).
//
// Smart default (Q2): with NO saved pref, a portrait/tall window
// (innerHeight > innerWidth) starts 'bottom', else 'right'. Once the user
// toggles, the saved choice ALWAYS wins over aspect ratio on later loads — the
// dock never auto-flips mid-session.

export const POSITION_KEY = "ui.inspectorDockPosition";
export const COLLAPSED_KEY = "ui.inspectorDockCollapsed";

// The dock positions the inspector knows. Anything outside this set is coerced
// to the aspect-ratio default (mirror of useTheme's KNOWN_THEMES guard).
const KNOWN_POSITIONS = new Set(["right", "bottom"]);

// Aspect-ratio default: a tall (portrait) window prefers the bottom shelf so the
// canvas keeps its width; everything else (landscape or square) prefers the
// right rail.
function aspectDefault() {
  if (typeof window === "undefined") return "right";
  return window.innerHeight > window.innerWidth ? "bottom" : "right";
}

function readPosition() {
  let raw = null;
  try {
    raw = localStorage.getItem(POSITION_KEY);
  } catch {
    return aspectDefault();
  }
  return KNOWN_POSITIONS.has(raw) ? raw : aspectDefault();
}

function readCollapsed() {
  let raw = null;
  try {
    raw = localStorage.getItem(COLLAPSED_KEY);
  } catch {
    return false;
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  return false; // garbage / null -> safe default
}

function persist(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — dock still works in-session */
  }
}

export function useInspectorDock() {
  const [dockPosition, setDockPositionState] = useState(readPosition);
  const [collapsed, setCollapsedState] = useState(readCollapsed);

  const setDockPosition = useCallback((next) => {
    persist(POSITION_KEY, next);
    setDockPositionState(next);
  }, []);

  const toggleDock = useCallback(() => {
    setDockPositionState((prev) => {
      const next = prev === "right" ? "bottom" : "right";
      persist(POSITION_KEY, next);
      return next;
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      persist(COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  return { dockPosition, setDockPosition, toggleDock, collapsed, toggleCollapsed };
}
