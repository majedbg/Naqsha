// Unit contract for the adaptive rAF-coalesced render scheduler (FIX 1 / D19).
// Drives a hand-mocked rAF + timer queue (mirrors useFrameStats.test.js) so the
// coalescing + adaptive-backoff logic is asserted deterministically, without a
// real clock or a real canvas.
import { describe, it, expect, beforeEach } from 'vitest';
import { createAdaptiveRenderScheduler } from './adaptiveRenderScheduler';

// A controllable fake environment: rAF/timer callbacks are queued and fired by
// hand, and `now` is advanced explicitly so each render can be given a precise
// simulated cost.
function makeEnv() {
  let frameQueue = [];
  let frameId = 0;
  let requestFrameCalls = 0;
  const timers = new Map();
  let timerId = 0;
  let clock = 0;

  return {
    clock: () => clock,
    advance: (ms) => { clock += ms; },
    requestFrame: (cb) => { frameId += 1; requestFrameCalls += 1; frameQueue.push([frameId, cb]); return frameId; },
    cancelFrame: (id) => { frameQueue = frameQueue.filter(([fid]) => fid !== id); },
    setTimer: (cb, delay) => { timerId += 1; timers.set(timerId, { cb, delay }); return timerId; },
    clearTimer: (id) => { timers.delete(id); },
    now: () => clock,
    requestFrameCalls: () => requestFrameCalls,
    // Fire all currently-queued animation frames (one "vsync").
    flushFrame: () => {
      const pending = frameQueue;
      frameQueue = [];
      for (const [, cb] of pending) cb();
    },
    // Fire all pending timers.
    flushTimers: () => {
      const pending = [...timers.values()];
      timers.clear();
      for (const { cb } of pending) cb();
    },
    pendingFrames: () => frameQueue.length,
    pendingTimers: () => timers.size,
  };
}

function makeScheduler(env, opts = {}) {
  return createAdaptiveRenderScheduler({
    requestFrame: env.requestFrame,
    cancelFrame: env.cancelFrame,
    setTimer: env.setTimer,
    clearTimer: env.clearTimer,
    now: env.now,
    ...opts,
  });
}

describe('adaptiveRenderScheduler — rAF coalescing (live path)', () => {
  let env;
  beforeEach(() => { env = makeEnv(); });

  it('coalesces many rapid schedule() calls in one frame into a SINGLE render of the latest closure', () => {
    const sched = makeScheduler(env);
    const rendered = [];
    // Simulate a fast drag: 5 param changes before the next vsync.
    for (let i = 0; i < 5; i += 1) sched.schedule(() => rendered.push(i));
    // Exactly ONE requestFrame call across all five schedule()s — coalesced, and
    // not the (also-1-pending but churny) cancel-and-re-request-each-frame shape.
    expect(env.requestFrameCalls()).toBe(1);
    expect(env.pendingFrames()).toBe(1);
    env.flushFrame();
    // Exactly one render, and it's the LATEST state (i === 4), never a stale one.
    expect(rendered).toEqual([4]);
  });

  it('renders MORE THAN ONCE across a continuous multi-frame drag (the liveness the fix restores)', () => {
    const sched = makeScheduler(env);
    let renders = 0;
    // Frame 1: two rapid changes, then vsync.
    sched.schedule(() => { renders += 1; env.advance(2); });
    sched.schedule(() => { renders += 1; env.advance(2); });
    env.flushFrame();
    // Frame 2: another change, then vsync.
    sched.schedule(() => { renders += 1; env.advance(2); });
    env.flushFrame();
    // Frame 3 (drag end): the trailing settle render.
    sched.schedule(() => { renders += 1; env.advance(2); });
    env.flushFrame();
    expect(renders).toBe(3); // one per frame — live morph, not a single snap
  });

  it('always fires a trailing settle render for the final change', () => {
    const sched = makeScheduler(env);
    let last = null;
    sched.schedule(() => { last = 'a'; });
    env.flushFrame();
    sched.schedule(() => { last = 'final'; });
    expect(env.pendingFrames()).toBe(1);
    env.flushFrame();
    expect(last).toBe('final');
  });

  it('cancel() drops a pending frame so an unmounted canvas never renders', () => {
    const sched = makeScheduler(env);
    let rendered = false;
    sched.schedule(() => { rendered = true; });
    sched.cancel();
    env.flushFrame();
    expect(rendered).toBe(false);
    expect(env.pendingFrames()).toBe(0);
  });
});

describe('adaptiveRenderScheduler — adaptive backoff (heavy configs)', () => {
  let env;
  beforeEach(() => { env = makeEnv(); });

  it('stays on the live/rAF path for cheap renders (well under budget)', () => {
    const sched = makeScheduler(env, { budgetMs: 24 });
    sched.schedule(() => env.advance(5)); // 5ms render
    env.flushFrame();
    expect(sched.getState().heavy).toBe(false);
    sched.schedule(() => env.advance(5));
    expect(env.pendingFrames()).toBe(1); // still using rAF, not a timer
    expect(env.pendingTimers()).toBe(0);
  });

  it('does NOT back off on a single over-budget spike (hysteresis)', () => {
    const sched = makeScheduler(env, { budgetMs: 24, overBudgetStreakToBackoff: 2 });
    sched.schedule(() => env.advance(100)); // one heavy spike
    env.flushFrame();
    expect(sched.getState().heavy).toBe(false); // one spike is tolerated
    expect(sched.getState().overBudgetStreak).toBe(1);
  });

  it('backs off to the debounce timer after a streak of over-budget renders', () => {
    const sched = makeScheduler(env, { budgetMs: 24, overBudgetStreakToBackoff: 2, backoffDelayMs: 150 });
    // Two consecutive heavy renders → heavy mode.
    sched.schedule(() => env.advance(100));
    env.flushFrame();
    sched.schedule(() => env.advance(100));
    env.flushFrame();
    expect(sched.getState().heavy).toBe(true);
    // Now a change schedules a TIMER (debounce), not an rAF.
    sched.schedule(() => env.advance(100));
    expect(env.pendingTimers()).toBe(1);
    expect(env.pendingFrames()).toBe(0);
  });

  it('a heavy config debounces during continuous motion — renders once after settle, not every change', () => {
    const sched = makeScheduler(env, { budgetMs: 24, overBudgetStreakToBackoff: 1, backoffDelayMs: 150 });
    // First render establishes heavy mode.
    let renders = 0;
    sched.schedule(() => { renders += 1; env.advance(100); });
    env.flushFrame();
    expect(sched.getState().heavy).toBe(true);
    renders = 0;
    // Rapid continuous changes: each resets the single debounce timer.
    for (let i = 0; i < 6; i += 1) sched.schedule(() => { renders += 1; env.advance(100); });
    expect(env.pendingTimers()).toBe(1); // coalesced onto ONE timer
    env.flushTimers();
    expect(renders).toBe(1); // exactly one render after motion settles
  });

  it('cancel() drops a pending BACKOFF timer too (not just a pending frame)', () => {
    const sched = makeScheduler(env, { budgetMs: 24, overBudgetStreakToBackoff: 1, backoffDelayMs: 150 });
    sched.schedule(() => env.advance(100)); // establishes heavy mode
    env.flushFrame();
    expect(sched.getState().heavy).toBe(true);
    let rendered = false;
    sched.schedule(() => { rendered = true; }); // schedules a debounce timer
    expect(env.pendingTimers()).toBe(1);
    sched.cancel();
    expect(env.pendingTimers()).toBe(0);
    env.flushTimers();
    expect(rendered).toBe(false); // cancelled before it could fire post-unmount
  });

  it('restores the live path as soon as a render comes back under budget', () => {
    const sched = makeScheduler(env, { budgetMs: 24, overBudgetStreakToBackoff: 1 });
    sched.schedule(() => env.advance(100)); // heavy
    env.flushFrame();
    expect(sched.getState().heavy).toBe(true);
    // The debounced render now comes back cheap (e.g. count lowered).
    sched.schedule(() => env.advance(5));
    env.flushTimers();
    expect(sched.getState().heavy).toBe(false);
    // Next change uses rAF again.
    sched.schedule(() => env.advance(5));
    expect(env.pendingFrames()).toBe(1);
  });

  it('reports render cost + mode through onMeasure (the ?fps=1 diagnostic seam)', () => {
    const measures = [];
    const sched = makeScheduler(env, { budgetMs: 24, onMeasure: (cost, mode) => measures.push([cost, mode]) });
    sched.schedule(() => env.advance(7));
    env.flushFrame();
    expect(measures).toEqual([[7, 'live']]);
  });
});
