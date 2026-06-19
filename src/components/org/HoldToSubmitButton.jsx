import { useRef, useState } from 'react';

const TICK_MS = 50;

// Deliberate-friction submit control (spec §7).
// - Desktop: press-and-hold (mouse-down) for `holdMs` arms then fires
//   `onConfirm`; releasing early decays back to 0.
// - Mobile/touch: a plain tap fires immediately (no hover/hold affordance).
// - Keyboard: Enter/Space fire plainly (a 2s key-hold is worse a11y).
// - `reducedMotion`: swap the gradient/glow for a `role="progressbar"`
//   countdown but keep the 2s delay.
// - Engages only when not `disabled`.
export default function HoldToSubmitButton({
  disabled = false,
  onConfirm,
  holdMs = 2000,
  reducedMotion = false,
}) {
  const timerRef = useRef(null);
  const intervalRef = useRef(null);
  const touchedRef = useRef(false);
  const [progress, setProgress] = useState(0); // 0..1

  function clearTimers() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startHold() {
    if (disabled) return;
    // A touch synthesizes a trailing mousedown; the touch already fired.
    if (touchedRef.current) {
      touchedRef.current = false;
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
    touchedRef.current = true;
    onConfirm?.();
  }

  function handleKeyDown(e) {
    if (disabled) return;
    // Enter activates plainly; Space mirrors it (spec §7 a11y carve-out).
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onConfirm?.();
    }
  }

  const pct = Math.round(progress * 100);

  return (
    <button
      type="button"
      disabled={disabled}
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
  );
}
