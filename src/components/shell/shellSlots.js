// shellSlots.js — bridge between the pro app-shell and the legacy Studio it hosts
// (Lane B / B3, GitHub issue #6).
//
// The Inspector region lives in AppShell, but the layer state + edit handlers it
// needs live inside <Studio/>, which AppShell hosts as a *sibling* in the Canvas
// region. Lifting useLayers out of Studio would rewrite Studio's internals and
// endanger the flag-OFF byte-identical guarantee, so instead AppShell publishes
// the Inspector region's DOM node through this context; Studio reads it and
// React-portals the Inspector into it.
//
// CRITICAL — flag-OFF no-op: this context defaults to `null`. The provider is
// mounted ONLY by AppShell (the flag-ON desktop path). Legacy Studio renders with
// no provider, so `useInspectorSlot()` returns null and Studio renders no portal,
// no Inspector — a true no-op for the legacy layout. Kept in a non-component
// `.js` module so component files only export components (fast-refresh).

import { createContext, createElement, useContext } from "react";

const InspectorSlotContext = createContext(null);

export function InspectorSlotProvider({ value, children }) {
  return createElement(InspectorSlotContext.Provider, { value }, children);
}

// Returns the Inspector region's DOM node when rendered inside the pro shell,
// or null in the legacy layout (no provider).
export function useInspectorSlot() {
  return useContext(InspectorSlotContext);
}

// Menu bar slot (Lane B / B5, issue #8). Same bridge mechanism as the Inspector
// slot above, in the same direction: AppShell publishes the Menu bar region's
// DOM node, the hosted Studio reads it and React-portals its <MenuBar/> into it
// — wiring the menu items to Studio's existing handlers for free.
//
// CRITICAL — flag-OFF no-op: defaults to `null`; the provider is mounted ONLY by
// AppShell (flag-ON desktop). With no provider `useMenuSlot()` returns null, so
// Studio renders its legacy loose top bar unchanged and no menu-bar portal.
const MenuSlotContext = createContext(null);

export function MenuSlotProvider({ value, children }) {
  return createElement(MenuSlotContext.Provider, { value }, children);
}

// Returns the Menu bar region's DOM node when rendered inside the pro shell, or
// null in the legacy layout (no provider).
export function useMenuSlot() {
  return useContext(MenuSlotContext);
}

// Tool strip slot (Lane B / B6, issue #9). Same bridge mechanism as above:
// AppShell publishes the Tool strip region's DOM node; the hosted Studio reads
// it and React-portals its <ToolStrip/> into it. Defaults to null so the legacy
// layout (no provider) renders no tool strip — a true flag-OFF no-op.
const ToolStripSlotContext = createContext(null);

export function ToolStripSlotProvider({ value, children }) {
  return createElement(ToolStripSlotContext.Provider, { value }, children);
}

// Returns the Tool strip region's DOM node when inside the pro shell, else null.
export function useToolStripSlot() {
  return useContext(ToolStripSlotContext);
}

// Contextual control bar slot (Lane B / B6, issue #9). Same bridge mechanism:
// AppShell publishes the Contextual control bar region's DOM node; Studio
// portals its <ControlBar/> into it. Defaults to null (flag-OFF no-op).
const ControlBarSlotContext = createContext(null);

export function ControlBarSlotProvider({ value, children }) {
  return createElement(ControlBarSlotContext.Provider, { value }, children);
}

// Returns the Contextual control bar region's DOM node inside the pro shell,
// else null.
export function useControlBarSlot() {
  return useContext(ControlBarSlotContext);
}
