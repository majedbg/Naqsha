// Guest onboarding — instrumentation seam (D22).
//
// No analytics layer exists in this app yet, so this is a deliberately thin,
// trivially-swappable sink: a dev-only console log today, a real
// analytics.track(...) call later without touching any call site. Call sites
// are NOT wired in S1 — later slices (S2+) emit these as the surfaces they
// describe get built.
//
// Activation event = "second distinct param change" (D22, teaching-true) —
// SECOND_PARAM_CHANGE below, not "first drag".

export const ONBOARDING_EVENTS = Object.freeze({
  AHA_REACHED: 'onboarding:aha-reached',
  SHUFFLE_CLICK: 'onboarding:shuffle-click',
  LENS_OPENED: 'onboarding:lens-opened',
  MODULATION_OPENED: 'onboarding:modulation-opened',
  EXPORT_REACHED: 'onboarding:export-reached',
  SECOND_PARAM_CHANGE: 'onboarding:second-param-change',
  SIGNUP_AFTER_VALUE: 'onboarding:signup-after-value',
});

// Emit an onboarding event. Never throws — a broken instrumentation call must
// never break the product it's instrumenting. Dev-only console output for
// now; swap the body for a real sink later, call sites are unaffected.
export function emitOnboardingEvent(name, payload) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[onboarding]', name, payload ?? {});
    }
  } catch {
    // Swallow — a payload console can't safely serialize (e.g. circular
    // refs), or a dev/test environment without `import.meta.env`, must never
    // surface as a crash.
  }
}
