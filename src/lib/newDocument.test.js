import { describe, it, expect } from "vitest";
import { resolveNewDocumentActions } from "./newDocument";

// File → New starts a fresh document. When the current document has unsaved
// work, the user is prompted with a multi-action choice before anything is
// discarded. This pure predicate decides WHICH actions the prompt offers, given
// only the two facts that matter: is there unsaved work, and is the user
// signed in. It never blanks anything — it only names the choices.
describe("resolveNewDocumentActions", () => {
  it("returns no actions when the document is not dirty (New proceeds immediately, no prompt)", () => {
    expect(resolveNewDocumentActions({ dirty: false, signedIn: false })).toEqual([]);
    expect(resolveNewDocumentActions({ dirty: false, signedIn: true })).toEqual([]);
  });

  it("guest + dirty: offers Save to cloud, Export SVG, Discard, Cancel", () => {
    const actions = resolveNewDocumentActions({ dirty: true, signedIn: false });
    expect(actions.map((a) => a.id)).toEqual(["save", "export", "discard", "cancel"]);
  });

  it("signed-in + dirty: offers the same four actions (Export kept for parity)", () => {
    const actions = resolveNewDocumentActions({ dirty: true, signedIn: true });
    expect(actions.map((a) => a.id)).toEqual(["save", "export", "discard", "cancel"]);
  });

  it("guest save routes to sign-in; signed-in save does not", () => {
    const guestSave = resolveNewDocumentActions({ dirty: true, signedIn: false }).find(
      (a) => a.id === "save"
    );
    const userSave = resolveNewDocumentActions({ dirty: true, signedIn: true }).find(
      (a) => a.id === "save"
    );
    expect(guestSave.routesToSignIn).toBe(true);
    expect(userSave.routesToSignIn).toBe(false);
  });

  it("discard is the sole destructive action; labels are calm and specific", () => {
    const actions = resolveNewDocumentActions({ dirty: true, signedIn: true });
    const byId = Object.fromEntries(actions.map((a) => [a.id, a]));
    expect(byId.save.label).toBe("Save to cloud");
    expect(byId.export.label).toBe("Export SVG");
    expect(byId.discard.label).toBe("Discard");
    expect(byId.cancel.label).toBe("Cancel");
    expect(byId.discard.danger).toBe(true);
    expect(actions.filter((a) => a.danger).length).toBe(1);
  });
});
