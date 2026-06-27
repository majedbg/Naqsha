import { describe, it, expect } from "vitest";
import { resolveSaveStatus } from "./saveStatus";

// Pure status resolver (Rec 1, tracer bullet). Maps the raw save signals into a
// { kind, label } the indicator renders. Precedence is the whole point:
// saving > error > dirty > saved > idle. It must stay pure + deterministic and
// MUST NOT format timestamps (the component formats lastSavedAt).
describe("resolveSaveStatus", () => {
  it("returns 'saving' while saving, even if also dirty (highest precedence)", () => {
    expect(resolveSaveStatus({ saving: true, dirty: true })).toEqual({
      kind: "saving",
      label: "Saving…",
    });
  });

  it("returns 'error' on error over dirty/saved (below saving)", () => {
    expect(
      resolveSaveStatus({ error: true, dirty: true, lastSavedAt: 123 })
    ).toEqual({ kind: "error", label: "Couldn't save" });
  });

  it("returns 'dirty' when dirty with no save in flight or error", () => {
    expect(
      resolveSaveStatus({ dirty: true, lastSavedAt: 123 })
    ).toEqual({ kind: "dirty", label: "Unsaved changes" });
  });

  it("returns 'saved' when a lastSavedAt exists and nothing is pending/dirty", () => {
    expect(resolveSaveStatus({ lastSavedAt: 123 })).toEqual({
      kind: "saved",
      label: "Saved",
    });
  });

  it("returns 'idle' with empty label when nothing has happened", () => {
    expect(resolveSaveStatus({})).toEqual({ kind: "idle", label: "" });
  });
});
