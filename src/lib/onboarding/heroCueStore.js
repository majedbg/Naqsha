// Guest onboarding S3 — "hero cue seen" per-tab, per-pattern-type flag
// (D6, D21, BUILD BRIEF element #2 "drag-me cue").
//
// Tracks whether THIS tab-session has already seen the guest change a given
// pattern type's hero param, so HeroDragCue never re-pulses once the aha has
// landed for that starter. Keyed by pattern type (not global) so switching
// starters via the S2 "Choose your naqsheh" chooser still cues a starter the
// guest hasn't touched yet, even after dismissing a different starter's cue.
//
// Same guarded sessionStorage + in-memory-fallback shape as
// dismissalStore.js (SSR / private-mode safe; per-tab; never a cross-person
// store — D18).
const KEY_PREFIX = 'sonoform-onboarding-hero-cue-seen:';

const memoryFallback = new Set();

function storageKey(patternType) {
  return `${KEY_PREFIX}${patternType}`;
}

function safeGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return undefined; // signals "sessionStorage unavailable, use memory fallback"
  }
}

function safeSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function isHeroCueSeen(patternType) {
  if (!patternType) return false;
  const raw = safeGet(storageKey(patternType));
  if (raw === undefined) return memoryFallback.has(patternType);
  return raw === 'true';
}

export function markHeroCueSeen(patternType) {
  if (!patternType) return;
  const ok = safeSet(storageKey(patternType), 'true');
  if (!ok) memoryFallback.add(patternType);
}
