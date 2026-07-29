// dragNumberFlash — the timing, asserted with NO WAAPI and NO rendering.
//
// This is the whole reason the timing is a pure exported function: jsdom has no
// Web Animations API, so anything asserted through `element.animate` is
// asserted against a stub. The band membership, the curve shape and the
// reduced-motion substitution are properties of the numbers, and they are
// checked here where nothing can fake them.
import { describe, it, expect } from 'vitest';
import {
  FLASH_ATTACK_MS,
  FLASH_HOLD_MS,
  FLASH_EASE,
  FLASH_MS,
  FLASH_REDUCED_MS,
  FLASH_REDUCED_PEAK,
  flashTiming,
} from './dragNumberFlash.js';

const peakOf = (kf) => Math.max(...kf.map((k) => k.opacity));

describe('flashTiming — the unreduced flash', () => {
  const { duration, keyframes } = flashTiming(false);

  it('is one perceptible blink, not a medium move', () => {
    // ⚠️ DELIBERATE DEVIATION, recorded rather than smuggled. Principle 4's
    // 240–360ms band governs a MOVE — something travelling to a position and
    // decelerating. This is a brightness envelope with a hold in the middle,
    // and at 320 total it read as "barely perceivable, ~50ms" in the running
    // app. The number is under review by eye; the guard is that it stays a
    // single blink and never becomes a lingering state.
    expect(duration).toBe(FLASH_MS);
    expect(duration).toBeGreaterThanOrEqual(300);
    expect(duration).toBeLessThanOrEqual(700);
  });

  it('is attack, then a HOLD at full, then the decay', () => {
    // Retuned 2026-07-29. The original 80/240 with an ease-out decay read as
    // "barely perceivable, ~50ms" in the running app: an ease-out on a value
    // falling 1 → 0 plummets, so most of the decay was an invisible tail. The
    // hold is what gives the eye something to catch.
    expect(FLASH_ATTACK_MS + FLASH_HOLD_MS).toBeLessThan(FLASH_MS);
    const full = keyframes.filter((k) => k.opacity === 1);
    expect(full).toHaveLength(2); // a plateau, not a spike
    expect(full[0].offset).toBeCloseTo(FLASH_ATTACK_MS / FLASH_MS, 10);
    expect(full[1].offset).toBeCloseTo((FLASH_ATTACK_MS + FLASH_HOLD_MS) / FLASH_MS, 10);
  });

  it('arrives and withdraws — starts and ends fully transparent', () => {
    // Never a steady state. Principle 2 forbids glow as decoration and as a
    // resting level; this one is punctuation, so it must return to nothing.
    expect(keyframes[0]).toMatchObject({ offset: 0, opacity: 0 });
    expect(keyframes.at(-1)).toMatchObject({ offset: 1, opacity: 0 });
    expect(peakOf(keyframes)).toBe(1);
  });

  it('is LINEAR throughout — no curve front-loads the fade', () => {
    // Every ease-out curve moves the value fast and then slowly. On a DECAY
    // that means it plummets to near-invisible and spends the rest of its
    // duration in a tail nobody sees — which is exactly the bug this retune
    // fixed. A brightness envelope is not a move; linear luminance is the
    // honest shape, and principle 4 governs motion, not light.
    for (const k of keyframes.slice(0, -1)) expect(k.easing).toBe('linear');
  });

  it('no easing anywhere is a bounce, elastic or back curve', () => {
    // FLASH_EASE is retained for the token it mirrors even though the envelope
    // no longer uses it. Whatever any keyframe carries, its control-point Y
    // values must stay inside [0,1] — that is what rules out overshoot.
    const beziers = [FLASH_EASE, ...keyframes.map((k) => k.easing)].filter(
      (e) => typeof e === 'string' && e.startsWith('cubic-bezier'),
    );
    for (const b of beziers) {
      const ys = b.match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 1);
      for (const y of ys) {
        expect(y).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('rises, holds, then falls — one cycle, no flicker', () => {
    const offsets = keyframes.map((k) => k.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    const peak = peakOf(keyframes);
    const first = keyframes.findIndex((k) => k.opacity === peak);
    const last = keyframes.findLastIndex((k) => k.opacity === peak);
    // Strictly up to the plateau, flat across it, strictly down after.
    for (let i = 1; i <= first; i++) {
      expect(keyframes[i].opacity).toBeGreaterThan(keyframes[i - 1].opacity);
    }
    for (let i = first + 1; i <= last; i++) {
      expect(keyframes[i].opacity).toBe(peak);
    }
    for (let i = last + 1; i < keyframes.length; i++) {
      expect(keyframes[i].opacity).toBeLessThan(keyframes[i - 1].opacity);
    }
  });

  it('animates OPACITY and nothing else', () => {
    // Brightness, not bloom. No filter, no blur, no shadow, no scale — a larger
    // translucent shape behind the thumb is exactly the glow that is forbidden.
    for (const k of keyframes) {
      expect(Object.keys(k).sort()).toEqual(
        k.easing ? ['easing', 'offset', 'opacity'] : ['offset', 'opacity'],
      );
    }
  });
});

describe('flashTiming — the reduced-motion substitution', () => {
  const reduced = flashTiming(true);
  const plain = flashTiming(false);

  it('SUBSTITUTES rather than removes — this is the only channel carrying "why"', () => {
    // The --motion-* tokens collapse to 0ms under prefers-reduced-motion, which
    // is why these are JS numbers: a token here would DELETE the signal.
    expect(reduced.duration).toBeGreaterThan(0);
    expect(peakOf(reduced.keyframes)).toBeGreaterThan(0);
  });

  it('is longer, gentler and lower-peaked', () => {
    expect(reduced.duration).toBe(FLASH_REDUCED_MS);
    expect(reduced.duration).toBeGreaterThan(plain.duration);
    expect(peakOf(reduced.keyframes)).toBe(FLASH_REDUCED_PEAK);
    expect(peakOf(reduced.keyframes)).toBeLessThan(peakOf(plain.keyframes));
  });

  it('is linear throughout — no transient to notice', () => {
    for (const k of reduced.keyframes) {
      if (k.easing) expect(k.easing).toBe('linear');
    }
    expect(reduced.keyframes.some((k) => k.easing === FLASH_EASE)).toBe(false);
  });

  it('is still one cycle that starts and ends at nothing', () => {
    expect(reduced.keyframes[0]).toMatchObject({ offset: 0, opacity: 0 });
    expect(reduced.keyframes.at(-1)).toMatchObject({ offset: 1, opacity: 0 });
    // Symmetrical, so neither the arrival nor the departure reads as a strike.
    expect(reduced.keyframes[1].offset).toBe(0.5);
  });
});

describe('flashTiming — the token it mirrors', () => {
  it('spells the bezier literally, because element.animate() cannot read a var()', () => {
    // Custom properties are not dependably substituted inside element.animate()
    // across engines. One named constant, so this and --ease-out-quint cannot
    // silently drift into two different curves.
    expect(FLASH_EASE).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
    expect(FLASH_EASE).not.toMatch(/var\(/);
  });
});
