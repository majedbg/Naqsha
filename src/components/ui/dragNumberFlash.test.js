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
  FLASH_EASE,
  FLASH_MS,
  FLASH_REDUCED_MS,
  FLASH_REDUCED_PEAK,
  flashTiming,
} from './dragNumberFlash.js';

const peakOf = (kf) => Math.max(...kf.map((k) => k.opacity));

describe('flashTiming — the unreduced flash', () => {
  const { duration, keyframes } = flashTiming(false);

  it('sits inside the 240–360ms band principle 4 sets for a medium move', () => {
    expect(duration).toBe(FLASH_MS);
    expect(duration).toBeGreaterThanOrEqual(240);
    expect(duration).toBeLessThanOrEqual(360);
  });

  it('is 80ms of attack and 240ms of decay', () => {
    expect(FLASH_ATTACK_MS + 240).toBe(FLASH_MS);
    const peak = keyframes.find((k) => k.opacity === 1);
    expect(peak.offset).toBeCloseTo(FLASH_ATTACK_MS / FLASH_MS, 10);
    expect(peak.offset).toBe(0.25);
  });

  it('arrives and withdraws — starts and ends fully transparent', () => {
    // Never a steady state. Principle 2 forbids glow as decoration and as a
    // resting level; this one is punctuation, so it must return to nothing.
    expect(keyframes[0]).toMatchObject({ offset: 0, opacity: 0 });
    expect(keyframes.at(-1)).toMatchObject({ offset: 1, opacity: 0 });
    expect(peakOf(keyframes)).toBe(1);
  });

  it('puts LINEAR on the attack and the ease-out on the peak', () => {
    // Per-keyframe easing governs the interval FOLLOWING that keyframe. An
    // ease-out on the attack keyframe would ease INTO the accent — a smoulder
    // rather than a filament, and the shape principle 4 rules out.
    expect(keyframes[0].easing).toBe('linear');
    expect(keyframes[1].easing).toBe(FLASH_EASE);
  });

  it('decays on an ease-out with no overshoot', () => {
    // The bezier mirrors --ease-out-quint. Both control-point Y values are
    // within [0,1], which is what rules out bounce/elastic/back curves.
    const ys = FLASH_EASE.match(/-?[\d.]+/g).map(Number).filter((_, i) => i % 2 === 1);
    expect(ys).toHaveLength(2);
    for (const y of ys) expect(y).toBeLessThanOrEqual(1);
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(0);
    // Ease-OUT: the curve leaves fast, so the first control point is already
    // high relative to its x.
    const [x1, y1] = FLASH_EASE.match(/-?[\d.]+/g).map(Number);
    expect(y1).toBeGreaterThan(x1);
  });

  it('rises monotonically then falls monotonically — one cycle, no flicker', () => {
    const offsets = keyframes.map((k) => k.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    const peakAt = keyframes.findIndex((k) => k.opacity === peakOf(keyframes));
    for (let i = 1; i <= peakAt; i++) {
      expect(keyframes[i].opacity).toBeGreaterThan(keyframes[i - 1].opacity);
    }
    for (let i = peakAt + 1; i < keyframes.length; i++) {
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
