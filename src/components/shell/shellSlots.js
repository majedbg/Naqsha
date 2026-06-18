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
