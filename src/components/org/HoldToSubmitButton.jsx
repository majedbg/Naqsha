import { useEffect, useId, useRef, useState } from 'react';

const TICK_MS = 50;
// How long the touch->synthesized-mousedown de-dupe stays armed. Long enough to
// swallow the immediate synthetic mousedown, short enough that a later genuine
// mousedown on a hybrid device isn't permanently blocked.
const TOUCH_DEDUPE_MS = 700;

// Deliberate-friction submit control (spec §7).
// - Desktop: press-and-hold (mouse-down) for `holdMs` arms then fires
//   `onConfirm`; releasing early decays back to 0.
// - Mobile/touch: a plain tap fires immediately (no hover/hold affordance).
// - Keyboard: only Enter fires plainly (a 2s key-hold is worse a11y); Space is
//   suppressed so it cannot become a second instant-submit path.
// - `reducedMotion`: swap the gradient/glow for a `role="progressbar"`
//   countdown but keep the 2s delay.
// - Engages only when not `disabled`.
export default function HoldToSubmitButton({
  disabled = false,
  onConfirm,
  holdMs = 2000,
  reducedMotion = false,
  disabledReason = undefined,
}) {
  const timerRef = useRef(null);
  const intervalRef = useRef(null);
  const touchedRef = useRef(false);
  const touchTimerRef = useRef(null);
  const reasonId = useId();
  const [progress, setProgress] = useState(0); // 0..1

  // Only surface the disabled reason when actually disabled AND a reason exists.
  const showReason = disabled && Boolean(disabledReason);

  function clearTimers() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  }

  // Clear any pending hold/touch timers if the component unmounts mid-hold so a
  // queued timeout cannot fire onConfirm on an unmounted tree. Reading refs in
  // the cleanup keeps it current without re-subscribing.
  useEffect(() => {
    return () => clearTimers();
  }, []);

  function startHold() {
    if (disabled) return;
    // A touch synthesizes a trailing mousedown; the touch already fired.
    if (touchedRef.current) {
      touchedRef.current = false;
      if (touchTimerRef.current) {
        clearTimeout(touchTimerRef.current);
        touchTimerRef.current = null;
      }
      return;
    }
    const startedAt = Date.now();
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setProgress(Math.min(1, elapsed / holdMs));
    }, TICK_MS);
    timerRef.current = setTimeout(() => {
      clearTimers();
      setProgress(1);
      onConfirm?.();
    }, holdMs);
  }

  function cancelHold() {
    if (!timerRef.current && !intervalRef.current) return;
    clearTimers();
    setProgress(0); // decay back to 0
  }

  function handleTouch() {
    if (disabled) return;
    // Arm the de-dupe so the trailing synthesized mousedown is swallowed, but
    // time-bound it so a later genuine mousedown isn't permanently blocked.
    touchedRef.current = true;
    if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
    touchTimerRef.current = setTimeout(() => {
      touchedRef.current = false;
      touchTimerRef.current = null;
    }, TOUCH_DEDUPE_MS);
    onConfirm?.();
  }

  function handleKeyDown(e) {
    if (disabled) return;
    // Enter activates plainly (spec §7). Space is NOT an authorized instant
    // path: preventDefault() it so the native button's Space->click-on-keyup
    // can't sneak an instant submit, and do nothing else.
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm?.();
    } else if (e.key === ' ') {
      e.preventDefault();
    }
  }

  const pct = Math.round(progress * 100);

  return (
    <>
    <button
      type="button"
      disabled={disabled}
      aria-disabled={showReason ? 'true' : undefined}
      aria-describedby={showReason ? reasonId : undefined}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={handleTouch}
      onKeyDown={handleKeyDown}
      className="relative inline-flex items-center justify-center overflow-hidden rounded-lg px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: 'var(--org-accent, #4f46e5)',
      }}
    >
      {reducedMotion ? (
        <span
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Hold to submit progress"
          className="pointer-events-none absolute inset-0"
        >
          <span
            className="absolute inset-y-0 left-0 bg-black/20"
            style={{ width: `${pct}%` }}
          />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 bg-white/30 ${
            progress >= 1 ? 'shadow-[0_0_18px_4px_rgba(255,255,255,0.7)]' : ''
          }`}
          style={{ width: `${pct}%` }}
        />
      )}
      <span className="relative z-10">Hold to Submit</span>
    </button>
      {showReason ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}
