// dragNumberFlash — the timing behind `DragNumber`'s `flashSignal` (PRD #184,
// PR 2; spec of record `docs/pitch-control-BUILD-SPEC.md` §3).
//
// A SEPARATE MODULE, not constants inside `DragNumber.jsx`. The spec asks for
// `flashTiming` to be exported and unit-testable, and `DragNumber.jsx` is a
// component file under `react-refresh/only-export-components` — it may export
// the component and nothing else, which is why its own defaults are already
// module-private. Splitting is what lets the timing be asserted with no WAAPI,
// no jsdom and no rendering at all.
//
// ── WHAT THE FLASH IS FOR ──────────────────────────────────────────────────
// "The number changed for a reason you didn't cause." The case it exists for is
// the unit flip on the anchor-pitch control at `spacing = 10`, where
// `density = 100/10 = 10` and the numeral is BYTE-IDENTICAL across the flip:
// same digits, different meaning, and without this, no signal at all. That is
// also why the flash must NOT be gated on the value having changed.
//
// ── BRIGHTNESS, NOT BLOOM ──────────────────────────────────────────────────
// `.impeccable.md` principle 2 says "no glowing accents". It forbids glow as
// DECORATION and as a STEADY STATE; a 320ms saffron punctuation that arrives
// and withdraws is principle 2's own positive clause — "rare, saturated,
// placed… a single accent at a time, load-bearing". The implementation keeps it
// on the right side of that line by painting the cell and unpainting it: no
// `drop-shadow`, no blur halo, no larger translucent shape behind the thumb.
//
// ── WHY THESE ARE JS NUMBERS AND NOT `--motion-*` TOKENS ───────────────────
// `tokens.css` collapses every `--motion-*` to 0ms under
// `prefers-reduced-motion`, which would DELETE this signal rather than
// substitute for it. `REDUCED_FADE` in `DragNumber.jsx` already establishes the
// precedent and the reasoning. Reduced motion therefore gets a longer, gentler,
// lower-peak single cycle — substituted, never removed, because this flash is
// the only channel carrying "the number changed for a reason".

/**
 * Mirrors `--ease-out-quint` in `tokens.css`, spelled literally because custom
 * properties are not dependably substituted inside `element.animate()` across
 * engines.
 *
 * ⚠️ KEEP IN STEP WITH THE TOKEN. There is no mechanism that can enforce it —
 * that is exactly why this is one named constant rather than a bezier inlined
 * at the call site.
 */
export const FLASH_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Total, ms.
 *
 *  ⚠️ TUNING VALUE UNDER REVIEW (2026-07-29). Temporarily 500 so the envelope
 *  can be judged by eye; see the HOLD note below for why the original 320 read
 *  as roughly 50ms. Principle 4's 240–360 band governs a medium MOVE — a
 *  brightness envelope with a hold is a different shape, and if 500 is what
 *  reads as one deliberate blink, that is the number, with the deviation
 *  recorded rather than smuggled. */
export const FLASH_MS = 500;
/** Attack, ms. Short enough to read as a filament rather than a swell. */
export const FLASH_ATTACK_MS = 80;
/** Hold at full brightness, ms — see the HOLD note below. */
export const FLASH_HOLD_MS = 100;

/** Reduced motion: longer, so the change is legible without a fast transient. */
export const FLASH_REDUCED_MS = 600;
/** Reduced motion: a lower peak, so it reads as a tint rather than a strike. */
export const FLASH_REDUCED_PEAK = 0.6;

/**
 * The WAAPI arguments for one flash.
 *
 * PER-KEYFRAME `easing` GOVERNS THE INTERVAL *FOLLOWING* THAT KEYFRAME.
 *
 * ── THE HOLD, AND WHY THE DECAY IS LINEAR (2026-07-29) ─────────────────────
 * The first build put `FLASH_EASE` on the peak keyframe, so the ease-out-quint
 * governed the DECAY. On a value falling 1 → 0 that curve PLUMMETS: opacity is
 * under 0.1 within ~25% of the decay and the rest is an invisible tail. The
 * flash was 80ms up, ~60ms of visible fall, then 180ms of nothing — reported
 * from the running app as "barely perceivable, looks like 50ms". It was:
 * roughly 140ms, only a sliver of it bright.
 *
 * Two changes. A HOLD at full brightness gives the eye something to catch —
 * a bulb is at temperature for a moment before it cools. And the decay is
 * LINEAR, because an even fade is what reads as cooling; every ease-out curve
 * front-loads the drop, which is the problem being fixed. `FLASH_EASE` is
 * retained for reference and for the token it mirrors.
 *
 * This does not violate principle 4. That principle governs MOTION — things
 * arriving at a position decelerate. Nothing here moves; this is a brightness
 * envelope, and linear luminance is the honest shape for one.
 *
 * @param {boolean} reduced  `prefers-reduced-motion: reduce`.
 * @returns {{duration: number, keyframes: Array<object>}}
 */
export function flashTiming(reduced) {
  if (reduced) {
    // One cycle, symmetrical, linear throughout: no transient to notice, just
    // a slow tint that arrives and leaves.
    return {
      duration: FLASH_REDUCED_MS,
      keyframes: [
        { offset: 0, opacity: 0, easing: "linear" },
        { offset: 0.5, opacity: FLASH_REDUCED_PEAK, easing: "linear" },
        { offset: 1, opacity: 0 },
      ],
    };
  }
  return {
    duration: FLASH_MS,
    keyframes: [
      { offset: 0, opacity: 0, easing: "linear" },
      { offset: FLASH_ATTACK_MS / FLASH_MS, opacity: 1, easing: "linear" },
      { offset: (FLASH_ATTACK_MS + FLASH_HOLD_MS) / FLASH_MS, opacity: 1, easing: "linear" },
      { offset: 1, opacity: 0 },
    ],
  };
}
