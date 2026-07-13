// Guest onboarding — dismissal store (D3, D18).
//
// Per-tab sessionStorage: a fresh page load (= next attendee on a shared
// workshop machine, per D3/D18) naturally re-shows onboarding, while a
// dismiss within the same tab sticks. `resetOnboardingSession` backs the
// explicit "New session / hand to next person" operator reset (P0-C).
//
// All storage access is guarded — SSR (no `window`) and private-mode/locked-
// down browsers (property access itself can throw) must never crash the
// product over an onboarding nicety. Falls back to an in-memory flag, which
// simply won't survive a reload — an acceptable degrade (onboarding re-shows,
// it never gets stuck shown or stuck hidden across sessions).
const DISMISSED_KEY = 'sonoform-onboarding-dismissed';

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

function safeRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function isOnboardingDismissed() {
  const raw = safeGet(DISMISSED_KEY);
  if (raw === undefined) return memoryFallback;
  return raw === 'true';
}

export function setOnboardingDismissed(dismissed) {
  const ok = dismissed ? safeSet(DISMISSED_KEY, 'true') : safeRemove(DISMISSED_KEY);
  if (!ok) memoryFallback = !!dismissed;
}

// "New session / hand to next person" reset (P0-C) — clears the dismissal so
// the chooser re-shows for the next attendee without waiting for a reload.
export function resetOnboardingSession() {
  setOnboardingDismissed(false);
}
