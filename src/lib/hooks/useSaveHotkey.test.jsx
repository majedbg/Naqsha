// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import useSaveHotkey from "./useSaveHotkey";

afterEach(() => {
  document.body.innerHTML = "";
});

function press(key, { meta = false, ctrl = false, target } = {}) {
  const ev = new KeyboardEvent("keydown", {
    key,
    metaKey: meta,
    ctrlKey: ctrl,
    bubbles: true,
    cancelable: true,
  });
  (target || window).dispatchEvent(ev);
  return ev;
}

describe("useSaveHotkey", () => {
  it("calls onSave and preventDefault on Cmd+S", () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey(onSave));
    const ev = press("s", { meta: true });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("calls onSave on Ctrl+S (non-mac)", () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey(onSave));
    press("S", { ctrl: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("ignores plain 's' without a modifier", () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey(onSave));
    const ev = press("s");
    expect(onSave).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("ignores Cmd+S while typing in a text field", () => {
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey(onSave));
    const input = document.createElement("input");
    document.body.appendChild(input);
    const ev = press("s", { meta: true, target: input });
    expect(onSave).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("works before the first save (manual save needs no design id)", () => {
    // The hook is id-agnostic; it just invokes whatever onSave it's given.
    const onSave = vi.fn();
    renderHook(() => useSaveHotkey(onSave));
    press("s", { meta: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("invokes the LATEST onSave after a rerender (no stale closure)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useSaveHotkey(fn), {
      initialProps: { fn: first },
    });
    rerender({ fn: second });
    press("s", { meta: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
