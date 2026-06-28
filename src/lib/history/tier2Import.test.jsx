// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useHistory from "./useHistory";
import { validateTail } from "./persist";
import { HISTORY_SCHEMA_VERSION } from "./snapshot";

// S9 — Tier-2 cloud import DECISION. The cloud-load path embeds the tail in the
// saved `config.history`; on reopen the importer runs the SAME rails Tier-1 uses:
//   const stacks = validateTail(config.history, history.exportTail().present);
//   if (stacks) history.importTail(stacks);
// These tests drive that exact gate against the real engine, proving a matching
// tail installs and any rail breach silently drops history (keeping the doc).

function setup() {
  const box = { doc: { layers: [{ id: "l1", n: 0 }], bg: "#fff" } };
  const capture = () => structuredClone(box.doc);
  const restore = (s) => {
    box.doc = structuredClone(s);
  };
  return renderHook(() => useHistory({ capture, restore }));
}

// The cloud-load import step, factored exactly as Studio's importHistoryTail.
function importThroughRails(api, configHistory) {
  if (!configHistory) return;
  const stacks = validateTail(configHistory, api.exportTail().present);
  if (stacks) api.importTail(stacks);
}

describe("history Tier-2 import decision (validateTail → importTail)", () => {
  it("installs the embedded tail when version + present-checksum match the loaded doc", () => {
    const { result } = setup();
    // An embedded tail whose `present` deep-equals the freshly-loaded doc.
    const embedded = {
      v: HISTORY_SCHEMA_VERSION,
      past: [{ layers: [{ id: "l1", n: -1 }], bg: "#fff" }],
      future: [],
      present: { layers: [{ id: "l1", n: 0 }], bg: "#fff" },
    };

    expect(result.current.canUndo).toBe(false);
    act(() => importThroughRails(result.current, embedded));
    // Matched → past installed → canUndo true.
    expect(result.current.canUndo).toBe(true);
  });

  it("drops history (keeps doc) on a version mismatch — rail 1", () => {
    const { result } = setup();
    const embedded = {
      v: HISTORY_SCHEMA_VERSION + 1, // breaking-version stamp
      past: [{ layers: [{ id: "l1", n: -1 }], bg: "#fff" }],
      future: [],
      present: { layers: [{ id: "l1", n: 0 }], bg: "#fff" },
    };

    act(() => importThroughRails(result.current, embedded));
    expect(result.current.canUndo).toBe(false);
  });

  it("drops history (keeps doc) on a present-checksum mismatch — rail 2", () => {
    const { result } = setup();
    const embedded = {
      v: HISTORY_SCHEMA_VERSION,
      past: [{ layers: [{ id: "l1", n: -1 }], bg: "#fff" }],
      future: [],
      // `present` differs from the loaded doc (a stale-tail-vs-fresh-doc race —
      // e.g. cloud load didn't restore the bgColor slice).
      present: { layers: [{ id: "l1", n: 0 }], bg: "#000" },
    };

    act(() => importThroughRails(result.current, embedded));
    expect(result.current.canUndo).toBe(false);
  });
});
