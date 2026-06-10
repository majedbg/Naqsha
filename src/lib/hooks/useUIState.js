import { useReducer, useCallback } from "react";
import { VALID_TABS } from "./useCanvasSize";

// Modal / UI-chrome flags extracted from Studio (AR-3A).
//
// Groups the transient view state — active tab, which modals/dialogs are open,
// the save-name buffer, examples drawer, pending-example confirmation, and the
// AI-chat panel — behind a tiny reducer. `activeTab` is seeded from the
// persisted canvas blob (owned/written by useCanvasSize) so its initial value
// round-trips identically.

function initActiveTab(savedTab) {
  return VALID_TABS.includes(savedTab) ? savedTab : "design";
}

function reducer(state, action) {
  switch (action.type) {
    case "set":
      return { ...state, [action.key]: action.value };
    case "patch":
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

export default function useUIState({ savedTab } = {}) {
  const [state, dispatch] = useReducer(reducer, savedTab, (tab) => ({
    activeTab: initActiveTab(tab),
    showLoadModal: false,
    showCloudModal: false,
    showSaveDialog: false,
    saveName: "",
    showExamples: false,
    // Example awaiting confirmation when the canvas has unsaved work.
    pendingExample: null,
    aiChatOpen: false,
    aiChatMode: "create",
    aiChatLayer: null,
  }));

  const set = useCallback((key, value) => dispatch({ type: "set", key, value }), []);
  const patch = useCallback((p) => dispatch({ type: "patch", patch: p }), []);

  return { ui: state, set, patch };
}
