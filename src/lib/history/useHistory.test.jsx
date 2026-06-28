// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useHistory from "./useHistory";

// S1 — the PURE engine. No document state lives here; the engine is handed a
// `capture`/`restore` pair over an external "document" and owns only the two
// stacks. These tests drive that pair against a plain mutable object, so the
// engine logic is exercised with zero React-state lag (the lag is a wiring
// concern proven separately in S4's async-path test).
//
// Discipline under test (the §3.1 crux): `record()` is capture-BEFORE-change —
// it snapshots the pre-edit doc and pushes it to `past`. `present` is never
// stored; it is reconstructed via `capture()` at the undo/redo boundary (by
// which point any real refs have settled).

function setup({ limit } = {}) {
  // The external document the engine snapshots through capture/restore.
  const box = { doc: { n: 0, nested: { tag: "A" } } };
  const capture = () => structuredClone(box.doc);
  const restore = (s) => {
    box.doc = structuredClone(s);
  };
  const hook = renderHook(() => useHistory({ capture, restore, limit }));
  // Simulate a user edit: record the pre-edit state, THEN mutate the doc.
  const edit = (next) =>
    act(() => {
      hook.result.current.record();
      box.doc = next;
    });
  return { hook, box, edit };
}

describe("history/useHistory — pure engine (record/undo/redo/clear/seed)", () => {
  it("starts empty: canUndo and canRedo are false", () => {
    const { hook } = setup();
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("record → undo → redo walks the document backward then forward", () => {
    const { hook, box, edit } = setup();
    edit({ n: 1 }); // A(0) → 1
    edit({ n: 2 }); // 1 → 2
    expect(box.doc).toEqual({ n: 2 });
    expect(hook.result.current.canUndo).toBe(true);
    expect(hook.result.current.canRedo).toBe(false);

    act(() => hook.result.current.undo());
    expect(box.doc).toEqual({ n: 1 });
    act(() => hook.result.current.undo());
    expect(box.doc).toEqual({ n: 0, nested: { tag: "A" } });
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(true);

    act(() => hook.result.current.redo());
    expect(box.doc).toEqual({ n: 1 });
    act(() => hook.result.current.redo());
    expect(box.doc).toEqual({ n: 2 });
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("I3 — Figma invariant: undo×N then redo×N returns the exact present", () => {
    const { box, hook, edit } = setup();
    edit({ n: 1 });
    edit({ n: 2 });
    edit({ n: 3 });
    const present = structuredClone(box.doc);
    act(() => hook.result.current.undo());
    act(() => hook.result.current.undo());
    act(() => hook.result.current.undo());
    act(() => hook.result.current.redo());
    act(() => hook.result.current.redo());
    act(() => hook.result.current.redo());
    expect(box.doc).toEqual(present);
  });

  it("I6 — re-application never self-records: undo/redo don't grow history spuriously", () => {
    const { hook, box, edit } = setup();
    edit({ n: 1 }); // one entry in past
    act(() => hook.result.current.undo()); // past empty, future has 1
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(true);
    act(() => hook.result.current.redo()); // future empty, past has 1 — NOT 2
    expect(hook.result.current.canRedo).toBe(false);
    act(() => hook.result.current.undo()); // exactly one undo available
    expect(box.doc).toEqual({ n: 0, nested: { tag: "A" } });
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("I8 — cap enforced: oldest entries dropped first", () => {
    const { hook, box, edit } = setup({ limit: 3 });
    edit({ n: 1 });
    edit({ n: 2 });
    edit({ n: 3 });
    edit({ n: 4 });
    edit({ n: 5 }); // 5 edits, only last 3 pre-edit snapshots kept ({n:2},{n:3},{n:4})
    let undos = 0;
    for (let i = 0; i < 6; i++) {
      const before = hook.result.current.canUndo;
      act(() => hook.result.current.undo());
      if (before) undos++;
    }
    expect(undos).toBe(3); // capped depth
    expect(box.doc).toEqual({ n: 2 }); // cannot reach {n:0} or {n:1} — dropped
  });

  it("a new record after undo clears the redo stack (no branching)", () => {
    const { hook, edit } = setup();
    edit({ n: 1 });
    act(() => hook.result.current.undo());
    expect(hook.result.current.canRedo).toBe(true);
    edit({ n: 9 });
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("clear() empties both stacks", () => {
    const { hook, edit } = setup();
    edit({ n: 1 });
    act(() => hook.result.current.undo());
    act(() => hook.result.current.clear());
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("seed() establishes a fresh baseline (clears both stacks)", () => {
    const { hook, edit } = setup();
    edit({ n: 1 });
    edit({ n: 2 });
    act(() => hook.result.current.seed());
    expect(hook.result.current.canUndo).toBe(false);
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("undo/redo are no-ops on empty stacks (no throw, doc untouched)", () => {
    const { hook, box } = setup();
    act(() => hook.result.current.undo());
    act(() => hook.result.current.redo());
    expect(box.doc).toEqual({ n: 0, nested: { tag: "A" } });
  });
});

describe("history/useHistory — coalescing (S2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("I4 — a multi-frame gesture produces exactly ONE past entry", () => {
    const { hook, box } = setup();
    act(() => hook.result.current.beginCoalesce()); // pointerdown: capture pre-gesture {n:0}
    // 60 frames of drag: each frame mutates the doc and calls record(),
    // but record() is suppressed while a coalesce window is open.
    for (let f = 1; f <= 60; f++) {
      act(() => {
        hook.result.current.record();
        box.doc = { n: f };
      });
    }
    act(() => hook.result.current.endCoalesce()); // pointerup: commit ONE entry
    expect(box.doc).toEqual({ n: 60 });
    expect(hook.result.current.canUndo).toBe(true);

    act(() => hook.result.current.undo()); // single undo restores pre-gesture
    expect(box.doc).toEqual({ n: 0, nested: { tag: "A" } });
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("two quick DISCRETE edits are NOT merged (two entries)", () => {
    const { hook, box, edit } = setup();
    edit({ n: 1 });
    edit({ n: 2 });
    act(() => hook.result.current.undo());
    expect(box.doc).toEqual({ n: 1 });
    act(() => hook.result.current.undo());
    expect(box.doc).toEqual({ n: 0, nested: { tag: "A" } });
  });

  it("idle timeout (400ms) auto-closes a typing burst into one entry", () => {
    const { hook, box } = setup();
    // Each keystroke opens-or-rearms the idle window and mutates the doc.
    act(() => {
      hook.result.current.beginCoalesce({ idleMs: 400 });
      box.doc = { n: 1 };
    });
    act(() => {
      hook.result.current.beginCoalesce({ idleMs: 400 }); // re-arm
      box.doc = { n: 2 };
    });
    expect(hook.result.current.canUndo).toBe(false); // still pending, nothing committed
    act(() => vi.advanceTimersByTime(400)); // idle → commit one entry
    expect(hook.result.current.canUndo).toBe(true);
    act(() => hook.result.current.undo());
    expect(box.doc).toEqual({ n: 0, nested: { tag: "A" } });
  });

  it("re-arming the idle timer keeps a continuous burst as one entry", () => {
    const { hook } = setup();
    act(() => hook.result.current.beginCoalesce({ idleMs: 400 }));
    act(() => vi.advanceTimersByTime(200));
    act(() => hook.result.current.beginCoalesce({ idleMs: 400 })); // reset at 200ms
    act(() => vi.advanceTimersByTime(300)); // 300 < 400 since reset — not closed
    expect(hook.result.current.canUndo).toBe(false);
    act(() => vi.advanceTimersByTime(100)); // now 400ms since last keystroke
    expect(hook.result.current.canUndo).toBe(true);
  });

  it("endCoalesce (blur/Enter) closes immediately and cancels the idle timer", () => {
    const { hook } = setup();
    act(() => hook.result.current.beginCoalesce({ idleMs: 400 }));
    act(() => hook.result.current.endCoalesce()); // blur/Enter
    expect(hook.result.current.canUndo).toBe(true);
    // The pending timer must be dead — advancing it must NOT commit a 2nd entry.
    act(() => vi.advanceTimersByTime(1000));
    act(() => hook.result.current.undo());
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("endCoalesce with no open window is a no-op", () => {
    const { hook } = setup();
    act(() => hook.result.current.endCoalesce());
    expect(hook.result.current.canUndo).toBe(false);
  });

  it("beginCoalesce is idempotent — re-open does not re-capture the baseline", () => {
    const { hook, box } = setup();
    act(() => {
      hook.result.current.beginCoalesce(); // captures {n:0}
      box.doc = { n: 1 };
    });
    act(() => {
      hook.result.current.beginCoalesce(); // already open — must NOT capture {n:1}
      box.doc = { n: 2 };
    });
    act(() => hook.result.current.endCoalesce());
    act(() => hook.result.current.undo());
    expect(box.doc).toEqual({ n: 0, nested: { tag: "A" } }); // restores original baseline
  });
});
