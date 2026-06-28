import { HISTORY_SCHEMA_VERSION } from "./snapshot";

// history/persist — Tier-1 local persistence (decision D7). History survives a
// reload (a deliberate user override of the usual "history resets on reload"
// convention, justified by tiny single-user docs). The tail is stored in
// localStorage keyed by DOCUMENT IDENTITY so switching documents never crosses
// histories. Three safety rails (§7): version stamp, present-vs-doc checksum,
// and a smaller persisted cap (the cap lives in useHistory.exportTail).
//
// Migration-on-restore is NOT here: when an imported entry is later undone,
// restore() routes its layers through loadLayerSet → migrateLayer, so every
// restored snapshot is migrated at use time. The version stamp guards the
// breaking-change case (drop the whole tail).

const KEY_PREFIX = "sonoform-history";

// `identity` is `design:<id>` for a saved cloud design or `draft` for the local
// working doc (guests included). Null/empty → draft.
export function historyKey(identity) {
  return `${KEY_PREFIX}:${identity || "draft"}`;
}

export function readTail(identity) {
  try {
    const raw = localStorage.getItem(historyKey(identity));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null; // corrupt JSON / unavailable storage
  }
}

export function writeTail(identity, tail) {
  try {
    localStorage.setItem(historyKey(identity), JSON.stringify(tail));
    return true;
  } catch {
    return false; // quota exceeded / unavailable — fail soft, history just won't persist
  }
}

export function clearTail(identity) {
  try {
    localStorage.removeItem(historyKey(identity));
  } catch {
    /* unavailable */
  }
}

// validateTail — the import gate. Returns `{ past, future }` only when the tail
// is safe to install; otherwise null (DROP history, KEEP the document — the
// non-negotiable failure mode). `presentDoc` is the freshly-loaded document
// (capture()).
//   Rail 1 (I7): version mismatch → drop.
//   Rail 2: the persisted `present` must deep-equal the loaded doc; a mismatch
//   means the tail belongs to a different/older doc state (a stale-tail-vs-fresh
//   -doc race) → drop. Both sides are produced by the same capture() builder, so
//   their key order is identical and a stable JSON compare is exact.
export function validateTail(tail, presentDoc) {
  if (!tail || typeof tail !== "object") return null;
  if (tail.v !== HISTORY_SCHEMA_VERSION) return null;
  if (!Array.isArray(tail.past) || !Array.isArray(tail.future)) return null;
  try {
    if (JSON.stringify(tail.present) !== JSON.stringify(presentDoc)) return null;
  } catch {
    return null;
  }
  return { past: tail.past, future: tail.future };
}
