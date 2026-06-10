// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useUIState from "./useUIState";

// Characterization tests (AR-3A) pinning the UI-chrome reducer.

describe("useUIState", () => {
  it("seeds activeTab from a valid persisted tab, else defaults to design", () => {
    const valid = renderHook(() => useUIState({ savedTab: "export" }));
    expect(valid.result.current.ui.activeTab).toBe("export");

    const invalid = renderHook(() => useUIState({ savedTab: "bogus" }));
    expect(invalid.result.current.ui.activeTab).toBe("design");

    const none = renderHook(() => useUIState({}));
    expect(none.result.current.ui.activeTab).toBe("design");
  });

  it("starts with all modals/chrome closed and default AI-chat mode", () => {
    const { result } = renderHook(() => useUIState({}));
    const { ui } = result.current;
    expect(ui.showLoadModal).toBe(false);
    expect(ui.showCloudModal).toBe(false);
    expect(ui.showSaveDialog).toBe(false);
    expect(ui.saveName).toBe("");
    expect(ui.showExamples).toBe(false);
    expect(ui.pendingExample).toBeNull();
    expect(ui.aiChatOpen).toBe(false);
    expect(ui.aiChatMode).toBe("create");
    expect(ui.aiChatLayer).toBeNull();
  });

  it("set updates a single flag without disturbing the others", () => {
    const { result } = renderHook(() => useUIState({ savedTab: "design" }));
    act(() => result.current.set("showCloudModal", true));
    expect(result.current.ui.showCloudModal).toBe(true);
    expect(result.current.ui.showLoadModal).toBe(false);
    expect(result.current.ui.activeTab).toBe("design");
  });
});
