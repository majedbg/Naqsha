// Guest onboarding S6 — modulation nudge "seen" flag (D17a, D22).
//
// Tracks whether THIS tab-session's "point the guest at modulation" job is
// already done, so the nudge fires AT MOST ONCE PER SESSION regardless of
// how many more distinct param changes the guest makes afterward. Unlike
// heroCueStore (keyed per pattern type, can re-fire once per starter), this
// is a single global flag — same guarded shape as lensTipStore.js — because
// the nudge is a one-shot "did you know modulation exists" prompt, not a
// per-seed aha.
//
// Same guarded sessionStorage + in-memory-fallback shape as
// dismissalStore.js / heroCueStore.js / lensTipStore.js (SSR / private-mode
// safe; per-tab; never a cross-person store — D18).
const KEY = 'sonoform-onboarding-modulation-nudge-seen';

let memoryFallback = false;

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

export function isModulationNudgeSeen() {
  const raw = safeGet(KEY);
  if (raw === undefined) return memoryFallback;
  return raw === 'true';
}

export function markModulationNudgeSeen() {
  const ok = safeSet(KEY, 'true');
  if (!ok) memoryFallback = true;
}

function safeRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// "New session / hand to next person" reset (P0-C) — clears the "seen" flag
// so the nudge is eligible to fire again for the next attendee.
export function resetModulationNudgeSession() {
  const ok = safeRemove(KEY);
  if (!ok) memoryFallback = false;
}
