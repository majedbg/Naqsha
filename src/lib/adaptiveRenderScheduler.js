// Adaptive, rAF-coalesced render scheduler (guest-onboarding FIX 1 / D19).
//
// Problem it solves: param edits used to ride a fixed 150ms setTimeout debounce
// in useCanvas.js. During a fast CONTINUOUS mouse-drag the param changes arrive
// faster than 150ms, so the debounce timer keeps resetting and the canvas never
// re-renders until motion pauses — the art looks frozen then snaps to the final
// frame, directly under the onboarding "watch the art update live" promise.
//
// This scheduler instead coalesces renders to AT MOST ONE PER ANIMATION FRAME
// (rAF), so a drag morphs live while cadence stays capped at the display's
// refresh rate. A pending frame is NOT cancelled by subsequent schedule() calls
// (that would recreate the never-fires-during-motion bug) — it keeps the latest
// render closure and fires it on the next frame; the very last change before the
// drag ends schedules the trailing "settle" render, so the final frame is always
// correct.
//
// Adaptive guard: rendering EVERY frame is only safe when a render fits inside a
// frame. Heavy configurations (e.g. Count/particle controls up to ~5000) can
// cost far more than one frame; rendering those every frame would be genuinely
// janky. So the scheduler MEASURES each render's cost and, after a short streak
// of over-budget renders (streak, not a single spike — one GC pause must not
// strand the rest of a drag on snap-to-final), backs off to a longer debounce
// (the legacy cadence) for that heavy config. A single back-under-budget render
// restores the live/rAF path immediately.
//
// All timer/clock primitives are injected so the whole thing is unit-testable
// with a hand-driven mocked rAF + timer queue (mirrors useFrameStats.js).

// Anchored to the documented workshop-iPad floor of 30fps (D19): one frame at
// 30fps = ~33ms. Policy: render every frame as long as we can hold ≥30fps; back
// off only when a render can't even sustain the 30fps floor. A lower value (e.g.
// one 60fps frame, 16ms) would silently snap-to-final any seed rendering in the
// 16–33ms band — which on a slow device could be a curated default seed itself,
// the exact false-negative to avoid.
export const DEFAULT_FRAME_BUDGET_MS = 33;
export const DEFAULT_BACKOFF_DELAY_MS = 150;
export const DEFAULT_OVER_BUDGET_STREAK = 2;

export function createAdaptiveRenderScheduler({
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  // A render costing MORE than this many ms can't sustain one-render-per-frame,
  // so a streak of them flips the scheduler into debounce/backoff mode. Chosen
  // (see BUILD-NOTES perf table) so ALL THREE curated default seeds render well
  // under it and stay on the live path; only pathological high-count configs
  // back off.
  budgetMs = DEFAULT_FRAME_BUDGET_MS,
  backoffDelayMs = DEFAULT_BACKOFF_DELAY_MS,
  // Consecutive over-budget renders required before backing off — hysteresis so
  // a single spike (GC, a stray heavy frame) doesn't kill liveness for the rest
  // of a drag.
  overBudgetStreakToBackoff = DEFAULT_OVER_BUDGET_STREAK,
  // Optional diagnostic hook: called after every render with (costMs, mode).
  // Off by default (zero cost); useCanvas wires it only under ?fps=1.
  onMeasure,
} = {}) {
  let rafId = null;
  let timerId = null;
  let pendingRender = null;
  let heavy = false; // current mode: false = live (rAF), true = backoff (timer)
  let overBudgetStreak = 0;
  let lastCostMs = 0;

  function runPending() {
    rafId = null;
    timerId = null;
    const render = pendingRender;
    pendingRender = null;
    if (typeof render !== 'function') return;
    const t0 = now();
    render();
    const cost = now() - t0;
    lastCostMs = cost;
    if (cost > budgetMs) {
      overBudgetStreak += 1;
      if (overBudgetStreak >= overBudgetStreakToBackoff) heavy = true;
    } else {
      // A single under-budget render restores live mode immediately.
      overBudgetStreak = 0;
      heavy = false;
    }
    if (typeof onMeasure === 'function') onMeasure(cost, heavy ? 'backoff' : 'live');
  }

  function schedule(render) {
    // Always keep the LATEST render closure so a coalesced frame renders the most
    // recent state (the newest layers), never a stale one.
    pendingRender = render;
    if (heavy) {
      // Backoff: reset a single debounce timer on each change (legacy cadence),
      // so a heavy config redraws once after motion settles, not every frame.
      if (rafId != null) { cancelFrame(rafId); rafId = null; }
      if (timerId != null) clearTimer(timerId);
      timerId = setTimer(runPending, backoffDelayMs);
    } else {
      // Live: coalesce to the next animation frame. A pending frame is left
      // intact (subsequent schedule()s only swap in the newer closure), so it
      // actually fires — the fix for the "never renders mid-drag" bug.
      if (timerId != null) { clearTimer(timerId); timerId = null; }
      if (rafId == null) rafId = requestFrame(runPending);
    }
  }

  function cancel() {
    if (rafId != null) { cancelFrame(rafId); rafId = null; }
    if (timerId != null) { clearTimer(timerId); timerId = null; }
    pendingRender = null;
  }

  function getState() {
    return { heavy, lastCostMs, overBudgetStreak, hasPendingFrame: rafId != null, hasPendingTimer: timerId != null };
  }

  return { schedule, cancel, getState };
}
