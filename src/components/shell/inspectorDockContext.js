// inspectorDockContext.js — bridge between the pro app-shell and the portaled
// Inspector for the dock-position state (WI-4, inspector-dock spec).
//
// AppShell owns the dock state (via useInspectorDock) but the dock toggle +
// collapse chevron + the column-wrapping (WI-5/WI-4b) live INSIDE the Inspector,
// which the hosted Studio React-portals into the Inspector region. React context
// propagates THROUGH createPortal, so the portaled Inspector is still a React
// descendant of whatever wraps `children`. AppShell wraps `children` in this
// provider; the Inspector reads the dock state with no Studio edit.
//
// CRITICAL — legacy no-op: this context defaults to `null`. The provider is
// mounted ONLY by AppShell (the pro desktop path). Legacy consumers with no
// provider read `null` and behave exactly as today. Kept in a non-component
// `.js` module so component files only export components (fast-refresh).

import { createContext, createElement, useContext } from "react";

const InspectorDockContext = createContext(null);

export function InspectorDockProvider({ value, children }) {
  return createElement(InspectorDockContext.Provider, { value }, children);
}

// Returns the dock state ({ dockPosition, collapsed, toggleDock, ... }) inside
// the pro shell, or null in the legacy layout (no provider).
export function useInspectorDockContext() {
  return useContext(InspectorDockContext);
}
