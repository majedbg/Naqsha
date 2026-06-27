// @vitest-environment jsdom
// Rec 3 / Capability B — local-draft safety net for SIGNED-IN users whose cloud
// save FAILED. A separate, namespaced key (sonoform-cloud-draft:<id|'new'>) — it
// never touches `sonoform-layers`/persistToLocal (the guest-draft invariant).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { draftKey, saveDraft, loadDraft, clearDraft } from "./localDraft";

describe("localDraft", () => {
  beforeEach(() => localStorage.clear());

  it("draftKey namespaces by design id, falling back to 'new'", () => {
    expect(draftKey("design-9")).toBe("sonoform-cloud-draft:design-9");
    expect(draftKey(null)).toBe("sonoform-cloud-draft:new");
    expect(draftKey(undefined)).toBe("sonoform-cloud-draft:new");
  });

  it("round-trips a draft through localStorage", () => {
    const key = draftKey("d1");
    const draft = { config: { layers: [1, 2] }, name: "Mandala", savedAt: 123 };
    saveDraft(key, draft);
    expect(loadDraft(key)).toEqual(draft);
  });

  it("loadDraft returns null when nothing is stored", () => {
    expect(loadDraft(draftKey("missing"))).toBe(null);
  });

  it("clearDraft removes the entry", () => {
    const key = draftKey("d1");
    saveDraft(key, { config: {}, name: "x", savedAt: 1 });
    clearDraft(key);
    expect(loadDraft(key)).toBe(null);
  });

  it("loadDraft tolerates corrupt JSON (returns null, no throw)", () => {
    const key = draftKey("d1");
    localStorage.setItem(key, "{not json");
    expect(loadDraft(key)).toBe(null);
  });

  it("saveDraft swallows quota/storage errors (no throw)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
    expect(() => saveDraft(draftKey("d1"), { config: {}, name: "x", savedAt: 1 })).not.toThrow();
    spy.mockRestore();
  });
});
