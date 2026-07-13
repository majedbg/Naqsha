// Guest onboarding S5 — cut/engrave (Operation) lens discoverability tip
// "seen" flag (D13, D17, BUILD BRIEF element #4 "Always-on cut/engrave lens").
//
// Tracks whether THIS tab-session's "point the guest at the Operation lens"
// job is already done — either the guest actually engaged the lens switch
// (Studio.jsx's wrapped ColorViewControl `onSetMode` handler fires this) or
// they manually dismissed the tip (GuestOnboarding's × button). Either way
// the discoverability job is complete for the session, so the tip never
// re-shows. Same guarded sessionStorage + in-memory-fallback shape as
// dismissalStore.js / heroCueStore.js (SSR / private-mode safe; per-tab;
// never a cross-person store — D18).
const KEY = 'sonoform-onboarding-lens-tip-seen';

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

export function isLensTipSeen() {
  const raw = safeGet(KEY);
  if (raw === undefined) return memoryFallback;
  return raw === 'true';
}

export function markLensTipSeen() {
  const ok = safeSet(KEY, 'true');
  if (!ok) memoryFallback = true;
}
