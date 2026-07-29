// pitchUnits — the DATA-INTEGRITY tests for the anchor-pitch control.
//
// Deliberately not rendering anything. Decision 7 (up-drag raises the number in
// BOTH states) makes the round-trip hazard live: in density state every drag
// frame writes back through `100/d`, so the stored spacing can drift unless the
// system rounds exactly once. These assert that property over numbers, where it
// actually lives — a rendered assertion would be checking the display instead.
import { describe, it, expect } from 'vitest';
import { MIN_EDGE_SPACING } from './anchors.js';
import {
  DEFAULT_SPACING,
  DENSITY_STEP,
  MAX_DENSITY,
  MAX_SPACING,
  MIN_DENSITY,
  MIN_SPACING,
  RULE_UNITS,
  STRIP_PAD,
  UNIT_OPTIONS,
  WINDOW_UNITS,
  clampSpacing,
  computeStripGeometry,
  densityOf,
  dotField,
  formatDensity,
  gripPair,
  isAtFloor,
  parseLeading,
  spacingFromDensity,
  tickUnit,
} from './pitchUnits.js';

describe('pitchUnits — the range', () => {
  it('takes its floor FROM anchors.js rather than restating it', () => {
    // A private copy of `4` would drift silently the day the engine's floor
    // moves, and the control would then draw a limit the engine does not have.
    expect(MIN_SPACING).toBe(MIN_EDGE_SPACING);
  });

  it('is seven clean doublings wide', () => {
    expect(MIN_SPACING * 2 ** 7).toBe(MAX_SPACING);
  });

  it('derives the density range from the spacing range, not by hand', () => {
    expect(MAX_DENSITY).toBe(WINDOW_UNITS / MIN_SPACING);
    expect(MIN_DENSITY).toBe(WINDOW_UNITS / MAX_SPACING);
    expect(MAX_DENSITY).toBe(25);
  });

  it('clamps into the range from both directions', () => {
    expect(clampSpacing(1)).toBe(MIN_SPACING);
    expect(clampSpacing(9999)).toBe(MAX_SPACING);
    expect(clampSpacing(24)).toBe(24);
  });

  it('reports the floor rather than letting the numeral just stop', () => {
    expect(isAtFloor(MIN_SPACING)).toBe(true);
    expect(isAtFloor(MIN_SPACING - 1)).toBe(true); // a request BELOW the floor
    expect(isAtFloor(MIN_SPACING + 1)).toBe(false);
    expect(isAtFloor(DEFAULT_SPACING)).toBe(false);
  });
});

describe('pitchUnits — one rounding, in the parent (decision 8)', () => {
  it('toggling N times leaves the stored spacing BIT-IDENTICAL', () => {
    // The toggle writes nothing at all — it swaps `format`/`parse` and the mark.
    // Round-tripping the DISPLAY transform is therefore the strongest thing a
    // toggle could possibly do to the value, and it must still be a no-op.
    for (const start of [MIN_SPACING, 7, DEFAULT_SPACING, 100, 255, MAX_SPACING]) {
      let spacing = start;
      for (let i = 0; i < 50; i++) spacing = spacingFromDensity(densityOf(spacing));
      expect(spacing).toBe(start);
    }
  });

  it('typing 4.2 in density state lands on spacing 24 exactly', () => {
    expect(spacingFromDensity(4.2)).toBe(24); // round(23.809…)
  });

  it('typing 4.1 also lands on 24 — the density grid is coarser, honestly', () => {
    expect(spacingFromDensity(4.1)).toBe(24); // round(24.390…)
  });

  it('rounds a live drag frame onto the spacing grid', () => {
    expect(spacingFromDensity(4.1873)).toBe(24);
  });

  it('clamps a request below the floor UP to the floor, never through it', () => {
    expect(spacingFromDensity(MAX_DENSITY * 4)).toBe(MIN_SPACING);
    expect(spacingFromDensity(1e6)).toBe(MIN_SPACING);
  });

  it('clamps a request past the ceiling down to it', () => {
    expect(spacingFromDensity(MIN_DENSITY / 4)).toBe(MAX_SPACING);
  });

  it('reads a non-positive or non-finite density as infinitely sparse', () => {
    expect(spacingFromDensity(0)).toBe(MAX_SPACING);
    expect(spacingFromDensity(-3)).toBe(MAX_SPACING);
    expect(spacingFromDensity(Number.NaN)).toBe(MAX_SPACING);
    expect(spacingFromDensity(Number.POSITIVE_INFINITY)).toBe(MAX_SPACING);
  });

  it('holds density well below the display grid so it cannot fight the spacing grid', () => {
    // 0.001 of density is finer than one spacing unit ANYWHERE in the range:
    // the coarsest place is the dense end, where one unit of spacing is worth
    // 100/4 − 100/5 = 5 of density.
    expect(DENSITY_STEP).toBeLessThan(densityOf(MIN_SPACING) - densityOf(MIN_SPACING + 1));
  });
});

describe('pitchUnits — display', () => {
  it('shows 1dp at or above 1 and 2dp below', () => {
    expect(formatDensity(densityOf(DEFAULT_SPACING))).toBe('4.2');
    expect(formatDensity(densityOf(100))).toBe('1.0');
    expect(formatDensity(densityOf(MAX_SPACING))).toBe('0.20');
    expect(formatDensity(densityOf(256))).toBe('0.39');
  });

  it('parses only the LEADING numeric token, so a unit suffix is not swallowed', () => {
    // DragNumber's DEFAULT_PARSE strips every non-numeric character and would
    // read this as 4.2100 — the "100" inside "/100u" folded into the mantissa.
    expect(parseLeading('4.2 /100u')).toBe(4.2);
    expect(parseLeading('24 u')).toBe(24);
    expect(parseLeading('  0.39 /100u  ')).toBe(0.39);
    expect(parseLeading('-1.5e2 u')).toBe(-150);
  });

  it('returns NaN for a string with no leading number, so the caller can refuse it', () => {
    expect(parseLeading('u')).toBeNaN();
    expect(parseLeading('')).toBeNaN();
  });

  it("names the UNIT in each option's accessible label, not just the word", () => {
    // The graphic is aria-hidden (ruling B), so this is the only surface that
    // can say what each reading measures.
    expect(UNIT_OPTIONS.map((o) => o.id)).toEqual(['density', 'spacing']);
    for (const o of UNIT_OPTIONS) {
      expect(o.a11yLabel.length).toBeGreaterThan(o.label.length);
      expect(o.a11yLabel).toMatch(/units/);
    }
  });
});

describe('pitchUnits — strip geometry', () => {
  const WIDTH = 224; // the rail floor

  it('reports unmeasured rather than guessing a width', () => {
    for (const w of [0, STRIP_PAD * 2, undefined, Number.NaN]) {
      const geo = computeStripGeometry({ spacing: DEFAULT_SPACING, stripWidth: w });
      expect(geo.measured).toBe(false);
      expect(geo.pxPerUnit).toBe(0);
      expect(dotField({ ...geo, stripWidth: w ?? 0 })).toEqual([]);
    }
  });

  it('draws the rule fitted to the strip, with the window as its middle 100 units', () => {
    const geo = computeStripGeometry({ spacing: DEFAULT_SPACING, stripWidth: WIDTH });
    const inner = WIDTH - STRIP_PAD * 2;
    expect(geo.pxPerUnit).toBeCloseTo(inner / RULE_UNITS, 10);
    expect(geo.windowPx).toBeCloseTo(WINDOW_UNITS * geo.pxPerUnit, 10);
    // Centred, and strictly inside the rule on BOTH sides — the window has to
    // read as a mark ON a rule, not as the whole graphic.
    expect(geo.windowX).toBeGreaterThan(STRIP_PAD);
    expect(geo.windowX + geo.windowPx).toBeLessThan(WIDTH - STRIP_PAD);
    expect(geo.windowX - STRIP_PAD).toBeCloseTo(WIDTH - STRIP_PAD - (geo.windowX + geo.windowPx), 10);
  });

  it('scales the rule with the strip and NEVER with the value', () => {
    const a = computeStripGeometry({ spacing: MIN_SPACING, stripWidth: WIDTH });
    const b = computeStripGeometry({ spacing: MAX_SPACING, stripWidth: WIDTH });
    expect(b.pxPerUnit).toBe(a.pxPerUnit);
    expect(b.windowPx).toBe(a.windowPx);
    expect(b.windowX).toBe(a.windowX);
    // Only the dot step moves.
    expect(b.stepPx / a.stepPx).toBeCloseTo(MAX_SPACING / MIN_SPACING, 6);
  });
});

describe('pitchUnits — the dot field (decision 12: half-step phase lock)', () => {
  const WIDTH = 224;
  const fieldFor = (spacing) => {
    const geo = computeStripGeometry({ spacing, stripWidth: WIDTH });
    return { geo, dots: dotField({ ...geo, stripWidth: WIDTH }) };
  };

  it('puts round(100/spacing) dots inside the window — what the numeral reads', () => {
    // The promise decision 2 makes: count the dots in the mark, get the number
    // in the field. Without the half-step phase, spacing 24 shows FIVE.
    for (const spacing of [4, 5, 10, 20, 24, 25, 50, 100]) {
      const { dots } = fieldFor(spacing);
      const inside = dots.filter((d) => d.inWindow).length;
      expect(inside).toBe(Math.round(WINDOW_UNITS / spacing));
    }
  });

  it('breaks the tie DOWNWARD at an exactly-half density, not upward', () => {
    // FOUND BY TESTING, and it qualifies decision 12's "the visible count is
    // round(100/spacing)". The half-step phase puts dot k at k + 0.5 steps, so
    // the exact count is ceil(100/spacing − 0.5) — which agrees with `round`
    // everywhere EXCEPT an exact half, where `Math.round` goes up and the field
    // goes down. Spacing 8 reads "12.5" and shows twelve dots.
    //
    // Left as it is: you cannot draw half a dot, and either neighbour of 12.5
    // is equally true. Recorded so nobody "fixes" the phase to chase `round`.
    const { dots } = fieldFor(8);
    expect(densityOf(8)).toBe(12.5);
    expect(dots.filter((d) => d.inWindow).length).toBe(12);
    for (const spacing of [4, 5, 8, 10, 16, 20, 24, 25, 32, 50, 100]) {
      const { dots: d } = fieldFor(spacing);
      expect(d.filter((x) => x.inWindow).length).toBe(
        Math.ceil(WINDOW_UNITS / spacing - 0.5),
      );
    }
  });

  it('is EXACT whenever 100/spacing is a whole number', () => {
    for (const spacing of [4, 5, 10, 20, 25, 50, 100]) {
      const { dots } = fieldFor(spacing);
      expect(dots.filter((d) => d.inWindow).length).toBe(WINDOW_UNITS / spacing);
    }
  });

  it('leaves the window EMPTY above spacing 100 — decision 14, accepted', () => {
    // Not a bug and not mitigated: the honest answer there genuinely is "fewer
    // than one per 100 units", and the numeral on the mark says so.
    for (const spacing of [256, MAX_SPACING]) {
      const { dots } = fieldFor(spacing);
      expect(dots.filter((d) => d.inWindow).length).toBe(0);
    }
  });

  it('keys dots by a stable integer index so a surviving dot animates', () => {
    const { dots } = fieldFor(24);
    expect(dots.map((d) => d.k)).toEqual([...dots].sort((a, b) => a.k - b.k).map((d) => d.k));
    expect(new Set(dots.map((d) => d.k)).size).toBe(dots.length);
  });

  it('caps the loop at the dense floor without dropping the visible run', () => {
    const { dots } = fieldFor(MIN_SPACING);
    expect(dots.length).toBeGreaterThan(WINDOW_UNITS / MIN_SPACING);
    expect(dots.length).toBeLessThanOrEqual(221);
  });
});

describe('pitchUnits — the gripped pair (§7c)', () => {
  const WIDTH = 224;
  const pairFor = (spacing) => {
    const geo = computeStripGeometry({ spacing, stripWidth: WIDTH });
    const dots = dotField({ ...geo, stripWidth: WIDTH });
    return { dots, pair: gripPair(dots, WIDTH / 2) };
  };

  it('always finds a pair, right up to the ceiling', () => {
    // The whole reason the centre pair is force-included: without it the
    // dimension line stops drawing over the top third of the locked range.
    for (const spacing of [4, 24, 100, 144, 256, MAX_SPACING]) {
      const { pair } = pairFor(spacing);
      expect(pair).not.toBeNull();
      expect(pair[1].k).toBe(pair[0].k + 1);
    }
  });

  it('grips the pair whose midpoint straddles the strip centre', () => {
    const { pair } = pairFor(24);
    const mid = (pair[0].x + pair[1].x) / 2;
    const geo = computeStripGeometry({ spacing: 24, stripWidth: WIDTH });
    expect(Math.abs(mid - WIDTH / 2)).toBeLessThanOrEqual(geo.stepPx / 2 + 0.01);
  });

  it('lets the gap run off the strip at the sparse end rather than rescaling', () => {
    // Decision 5's badge is gone but its rule survives: the drawing never
    // changes scale to make a value fit. The mark truncates and says so.
    const { pair } = pairFor(MAX_SPACING);
    expect(pair[1].x - pair[0].x).toBeGreaterThan(WIDTH);
  });

  it('returns null when there are fewer than two dots to span', () => {
    expect(gripPair([], 0)).toBeNull();
    expect(gripPair([{ k: 0, x: 5 }], 0)).toBeNull();
  });
});

describe('pitchUnits — the tick scale', () => {
  it('steps up a decade rather than letting ticks close below 6px', () => {
    expect(tickUnit(10)).toBe(1);
    expect(tickUnit(1)).toBe(10);
    expect(tickUnit(0.1)).toBe(100);
    expect(tickUnit(0.01)).toBe(1000);
  });

  it('never returns a unit whose ticks would be closer than 6px', () => {
    // The strip's own range: pxPerUnit is inner/160, so a 224px rail gives
    // ~1.28 and even a 1000px one only reaches ~6.
    for (const px of [0.03, 0.2, 0.9, 1.28, 1.4, 3, 6, 12]) {
      expect(tickUnit(px) * px).toBeGreaterThanOrEqual(6);
    }
  });

  it('degrades to the coarsest unit rather than dividing by zero', () => {
    expect(tickUnit(0)).toBe(1000);
    expect(tickUnit(Number.NaN)).toBe(1000);
    // Below ~0.006 px/unit even 1000-unit ticks close up. That needs a strip
    // under one pixel wide, so the ladder simply ends rather than growing a
    // branch for a case the layout cannot produce.
    expect(tickUnit(0.005) * 0.005).toBeLessThan(6);
  });
});
