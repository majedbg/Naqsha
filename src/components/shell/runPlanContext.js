// runPlanContext.js — the open/closed state of the Run Plan (Wave-3 Lane F, PRD
// #73).
//
// The Run Plan is a shell-morph: an entry (a menu item, an Export Receipt link)
// opens the pre-flight plan, and the shell renders a calm "Back to design" exit.
// AppShell owns the state by mounting <RunPlanProvider> around the shell subtree
// — including the hosted Studio (a child in the Canvas region) — so Studio can
// learn plan-open (to morph the canvas / mount RunPlanPanel) and entries can call
// open() from anywhere below the provider.
//
// SAFE DEFAULT — no provider: the context defaults to a stable closed value
// ({ isOpen:false, open(){}, close(){} }) so consumers rendered WITHOUT the
// provider (legacy layout, isolated component tests) still render safely and
// never crash. Kept in a non-component `.js` module (createElement, no JSX) so
// this file exports only a provider + a hook — react-refresh / fast-refresh
// requires component files to export components only.

import { createContext, createElement, useCallback, useContext, useMemo, useState } from "react";

// Frozen so the no-provider default is never mistaken for mutable state.
const CLOSED_DEFAULT = Object.freeze({
  isOpen: false,
  open() {},
  close() {},
});

const RunPlanContext = createContext(CLOSED_DEFAULT);

export function RunPlanProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return createElement(RunPlanContext.Provider, { value }, children);
}

// Returns { isOpen, open, close }. With no provider, returns the stable closed
// default so consumers render safely (isOpen:false; open/close are no-ops).
export function useRunPlan() {
  return useContext(RunPlanContext);
}
