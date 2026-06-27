// Local-draft safety net (Rec 3 / Capability B).
//
// For SIGNED-IN users whose cloud save FAILED: stash the in-memory document
// ({config, name}) in localStorage under a SEPARATE, namespaced key so the work
// survives a reload/crash and can be recovered. On a later successful save the
// draft is cleared. This is intentionally distinct from the guest-draft path:
// it never reads or writes `sonoform-layers` / `persistToLocal`, so the locked
// "guests don't write design drafts" invariant is untouched.
//
// All operations tolerate quota/parse/unavailable-storage failures (try/catch →
// no-op / null) so the net can never itself break a save or a mount.

const PREFIX = "sonoform-cloud-draft:";

// Namespace a draft by the current cloud design id; `'new'` for an unsaved doc.
export function draftKey(designId) {
  return `${PREFIX}${designId || "new"}`;
}

export function saveDraft(key, draft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    /* quota exceeded / storage unavailable — drop the safety-net write */
  }
}

export function loadDraft(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    /* corrupt JSON / storage unavailable */
    return null;
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
