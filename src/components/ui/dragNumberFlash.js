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

/** Total, ms. Inside the 240–360 band `.impeccable.md` principle 4 sets for a
 *  medium move, and the same band `--motion-medium`/`--motion-slow` bracket. */
export const FLASH_MS = 320;
/** Attack, ms. Short enough to read as a filament rather than a swell. */
export const FLASH_ATTACK_MS = 80;

/** Reduced motion: longer, so the change is legible without a fast transient. */
export const FLASH_REDUCED_MS = 600;
/** Reduced motion: a lower peak, so it reads as a tint rather than a strike. */
export const FLASH_REDUCED_PEAK = 0.6;

/**
 * The WAAPI arguments for one flash.
 *
 * PER-KEYFRAME `easing` GOVERNS THE INTERVAL *FOLLOWING* THAT KEYFRAME. So the
 * attack keyframe carries `linear` and the PEAK keyframe carries the ease-out
 * that shapes the decay. Putting the ease-out on the attack instead reads as a
 * smoulder rather than a filament, and eases INTO the accent — which is the
 * shape principle 4 rules out.
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
      { offset: FLASH_ATTACK_MS / FLASH_MS, opacity: 1, easing: FLASH_EASE },
      { offset: 1, opacity: 0 },
    ],
  };
}
