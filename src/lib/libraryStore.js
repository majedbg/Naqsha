// libraryStore — the in-memory entity index behind the Library view (S1,
// issue #50; PRD #48 locked decision 6: ONE entity, TWO surfaces).
//
// The dynamic pattern registry (patternRegistry) holds runtime Pattern
// CLASSES — enough for the picker's custom family, but not for the Library
// view, which needs the full ExtractedPattern entity (tile, photo, visibility).
// This store is that entity index. It is NOT a second source of truth: it is
// populated exclusively through registerExtractedPattern (the single write
// path both cloud-loaded and session-only entries already flow through), so
// the Library view and the picker can never disagree about what exists.
//
// Ordering: newest first. Cloud rows carry their row's created_at; fresh
// session saves stamp Date.now(). Ties (same timestamp) break by insertion
// sequence, newest insertion first.

const entries = new Map(); // patternId -> { entity, photoURL, createdAt, seq }
let seq = 0;
let listeners = [];
let cache = null; // memoized sorted array — stable identity for useSyncExternalStore

function notify() {
  cache = null;
  listeners.forEach((fn) => fn());
}

/**
 * Add (or replace — re-registration is idempotent by patternId) one entry.
 * `photoURL` is a TRANSIENT display URL (the session dataURL for a just-saved
 * photo); it is never serialized. `createdAt` accepts the row's ISO string.
 */
export function addLibraryEntry(entity, { photoURL = null, createdAt = null } = {}) {
  const parsed = createdAt ? Date.parse(createdAt) : NaN;
  entries.set(entity.patternId, {
    entity,
    photoURL,
    createdAt: Number.isFinite(parsed) ? parsed : Date.now(),
    seq: seq++,
  });
  notify();
}

export function removeLibraryEntry(patternId) {
  if (entries.delete(patternId)) notify();
}

/** All entries, newest first. Stable array identity between mutations. */
export function getLibraryEntries() {
  if (!cache) {
    cache = [...entries.values()].sort(
      (a, b) => b.createdAt - a.createdAt || b.seq - a.seq
    );
  }
  return cache;
}

export function getLibraryEntry(patternId) {
  return entries.get(patternId) ?? null;
}

export function subscribeLibrary(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/** Test helper — the store is module-global, so suites reset it between tests. */
export function clearLibraryEntries() {
  entries.clear();
  notify();
}
