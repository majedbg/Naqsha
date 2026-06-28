// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { HISTORY_SCHEMA_VERSION } from "./snapshot";
import { historyKey, readTail, writeTail, clearTail, validateTail } from "./persist";

// S8 — Tier-1 persistence rails. localStorage read/write keyed by document
// identity, plus validateTail's two rails: the version stamp (I7) and the
// present-vs-loaded-doc consistency checksum. Migration-on-restore is handled by
// loadLayerSet when an entry is later restored, so it does not live here.

const presentDoc = {
  v: HISTORY_SCHEMA_VERSION,
  layers: [{ id: "l1", params: { d: 1 } }],
  bgColor: "#0a1628",
};

function tail(overrides = {}) {
  return {
    v: HISTORY_SCHEMA_VERSION,
    past: [{ v: HISTORY_SCHEMA_VERSION, layers: [{ id: "l1", params: { d: 0 } }] }],
    future: [],
    present: presentDoc,
    ...overrides,
  };
}

beforeEach(() => localStorage.clear());

describe("history/persist — Tier-1 local persistence", () => {
  it("keys by document identity (design:<id> vs draft)", () => {
    expect(historyKey("design:abc")).toBe("sonoform-history:design:abc");
    expect(historyKey("draft")).toBe("sonoform-history:draft");
    expect(historyKey(null)).toBe("sonoform-history:draft"); // null → draft
  });

  it("write then read round-trips a tail, scoped per identity", () => {
    writeTail("design:abc", tail());
    expect(readTail("design:abc")).toEqual(tail());
    expect(readTail("draft")).toBeNull(); // different identity → isolated
  });

  it("readTail returns null on missing / corrupt data", () => {
    expect(readTail("draft")).toBeNull();
    localStorage.setItem(historyKey("draft"), "{not json");
    expect(readTail("draft")).toBeNull();
  });

  it("clearTail removes the keyed blob", () => {
    writeTail("draft", tail());
    clearTail("draft");
    expect(readTail("draft")).toBeNull();
  });

  it("validateTail returns the stacks when version + present match", () => {
    const ok = validateTail(tail(), presentDoc);
    expect(ok).toEqual({ past: tail().past, future: [] });
  });

  it("I7 — version mismatch drops history (keeps doc)", () => {
    expect(validateTail(tail({ v: HISTORY_SCHEMA_VERSION + 1 }), presentDoc)).toBeNull();
  });

  it("consistency checksum — present ≠ loaded doc drops history", () => {
    const stale = tail({ present: { ...presentDoc, bgColor: "#ffffff" } });
    expect(validateTail(stale, presentDoc)).toBeNull();
  });

  it("malformed tail (missing stacks / null) drops history", () => {
    expect(validateTail(null, presentDoc)).toBeNull();
    expect(validateTail({ v: HISTORY_SCHEMA_VERSION, present: presentDoc }, presentDoc)).toBeNull();
  });
});
