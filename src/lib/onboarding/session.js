// Guest onboarding — P0-C "New session / hand to next person" reset (D18).
//
// sessionStorage SURVIVES a same-tab reload, so on a shared workshop machine
// a reload does NOT actually re-show onboarding for the next attendee (D3) —
// this explicit reset is the RELIABLE hand-off mechanism instead. It clears
// every per-tab onboarding session flag in one call, so the next attendee
// sees the full first-run again without needing a reload at all.
//
// A single composed helper, not four separate call sites, so a future
// onboarding store only needs to add one import + one line here to be
// included in the reset — never be hunted down at every place that wants
// "clear everything." Never touches localStorage/DB/auth — per-tab only
// (D18: never a cross-person store).
import { resetOnboardingSession } from './dismissalStore';
import { resetHeroCueSession } from './heroCueStore';
import { resetLensTipSession } from './lensTipStore';
import { resetModulationNudgeSession } from './modulationNudgeStore';

export function resetAllOnboarding() {
  resetOnboardingSession();
  resetHeroCueSession();
  resetLensTipSession();
  resetModulationNudgeSession();
}
