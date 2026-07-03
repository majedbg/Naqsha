import { describe, it, expect } from 'vitest';
import {
  evaluateFit,
  symmetryMatch,
  latticeMatch,
  overlapPoints,
  expectedGroup,
  FIT_THRESHOLD,
  IOU_FLOOR,
  IOU_FULL,
} from './fitEvaluator';
import { kaplanStarFamily } from './families/kaplanStar';
import {
  starFixture,
  floralFixture,
  randomFixture,
  calligraphicFixture,
  hexagonFixture,
  asteriskFixture,
} from './families/__testFixtures';
import { SUPPORTED_FOLDS } from './families/kaplanStar';

const cell = { width: 100, height: 100 };
const squareLat = { cell, type: 'square', t1: [100, 0], t2: [0, 100], confidence: 0.9 };
const hexLat = { cell, type: 'hex', t1: [100, 0], t2: [50, 86.6], confidence: 0.9 };

// The confident groups a clean centered star classifies to (sym match = 3).
const p4m = { group: 'p4m', confidence: 0.95, source: 'auto' };
const p6m = { group: 'p6m', confidence: 0.95, source: 'auto' };

describe('EVAL rubric arithmetic (sub-scores)', () => {
  it('symmetryMatch: exact→3, same order→2, compatible order→1, unrelated→0', () => {
    expect(symmetryMatch('p4m', { group: 'p4m' })).toBe(3);
    expect(symmetryMatch('p4m', { group: 'p4' })).toBe(2); // same 4-fold order
    expect(symmetryMatch('p6m', { group: 'p2' })).toBe(1); // 6 divisible by 2
    expect(symmetryMatch('p4m', { group: 'p3' })).toBe(0); // 4 vs 3 — unrelated
    expect(symmetryMatch('p4m', null)).toBe(0);
  });

  it('symmetryMatch caps a SOFT (hiddenRotation) group at 1 — no confident match', () => {
    const soft = { group: 'p4m', hiddenRotation: true };
    expect(symmetryMatch('p4m', soft)).toBe(1); // would be 3, capped to 1
  });

  it('latticeMatch: exact type→3, square/rect→2, mismatch/oblique→1, none→0', () => {
    expect(latticeMatch(8, squareLat)).toBe(3); // 8-fold natural = square
    expect(latticeMatch(6, hexLat)).toBe(3); // 6-fold natural = hex
    expect(latticeMatch(8, { type: 'rect', confidence: 0.9 })).toBe(2);
    expect(latticeMatch(6, squareLat)).toBe(1); // hex fold on square lattice
    expect(latticeMatch(8, null)).toBe(0);
  });

  it('overlapPoints has a FLOOR: IoU ≤ floor earns 0; saturates to 4 at FULL', () => {
    expect(overlapPoints(IOU_FLOOR)).toBe(0);
    expect(overlapPoints(IOU_FLOOR - 0.1)).toBe(0);
    expect(overlapPoints(IOU_FULL)).toBe(4);
    expect(overlapPoints(1)).toBe(4);
    // Midpoint is monotonic and positive.
    expect(overlapPoints((IOU_FLOOR + IOU_FULL) / 2)).toBeCloseTo(2, 5);
  });

  it('expectedGroup maps fold+lattice to the star family group', () => {
    expect(expectedGroup(8, 'square')).toBe('p4m');
    expect(expectedGroup(6, 'hex')).toBe('p6m');
    expect(expectedGroup(3, 'hex')).toBe('p3m1');
  });
});

describe('THE HONESTY BATTERY — star clears, non-stars fall through', () => {
  it('a constructed 8-fold star scores ≥ 7 and is offered', () => {
    const ev = evaluateFit(starFixture(8, 45), kaplanStarFamily, { lattice: squareLat, symmetry: p4m });
    expect(ev.accepted).toBe(true);
    expect(ev.score).toBeGreaterThanOrEqual(FIT_THRESHOLD);
    expect(ev.params.n).toBe(8);
    expect(ev.family).toBe('kaplan-star');
  });

  it('a constructed 6-fold star on a hex lattice scores ≥ 7', () => {
    const ev = evaluateFit(starFixture(6, 50), kaplanStarFamily, { lattice: hexLat, symmetry: p6m });
    expect(ev.accepted).toBe(true);
    expect(ev.params.n).toBe(6);
  });

  it('FLORAL falls through: score < 7 even with a coincidental confident symmetry', () => {
    // Hand the evaluator the MOST generous symmetry+lattice (sym 3 + lat 3 = 6):
    // only a genuine star ink can add the ≥1 overlap point needed to reach 7.
    const ev = evaluateFit(floralFixture(8), kaplanStarFamily, { lattice: squareLat, symmetry: p4m });
    expect(ev.accepted).toBe(false);
    expect(ev.score).toBeLessThan(FIT_THRESHOLD);
    expect(ev.breakdown.overlap).toBe(0); // structural mismatch buys nothing
  });

  it('RANDOM line-work falls through', () => {
    const ev = evaluateFit(randomFixture(7), kaplanStarFamily, { lattice: squareLat, symmetry: p4m });
    expect(ev.accepted).toBe(false);
    expect(ev.score).toBeLessThan(FIT_THRESHOLD);
  });

  it('CALLIGRAPHIC strokes fall through', () => {
    const ev = evaluateFit(calligraphicFixture(), kaplanStarFamily, { lattice: squareLat, symmetry: p4m });
    expect(ev.accepted).toBe(false);
    expect(ev.score).toBeLessThan(FIT_THRESHOLD);
  });

  it('NON-PERIODIC (no lattice) is never offered — the single-motif floor stands', () => {
    const ev = evaluateFit(starFixture(8), kaplanStarFamily, { lattice: null, symmetry: null });
    expect(ev.accepted).toBe(false);
    expect(ev.score).toBe(0);
  });

  // THE SHARP TEST (S12 task 3a). The floral/random/calligraphic negatives above
  // are easy: they never earn full sym+lattice, so even a broken IoU would reject
  // them — they prove little about IoU necessity. A FILLED HEXAGON on its natural
  // hex/p6m lattice is the honest adversary: it earns the MAXIMUM structural
  // score (symmetry 3 + lattice 3 = 6, the exact p6m/hex the star family lives
  // on), so the ONLY thing that can keep it out of the offer is IoU. It is a real
  // periodic geometric tile, NOT a star, and it MUST fall through.
  it('PERIODIC NON-STAR (filled hexagon, FULL sym+lattice=6) falls through — the rejection is IoU and ONLY IoU', () => {
    const ev = evaluateFit(hexagonFixture(45), kaplanStarFamily, { lattice: hexLat, symmetry: p6m });
    // Structural sub-scores are MAXED — this is not a weak-score fall-through.
    expect(ev.breakdown.symmetry).toBe(3);
    expect(ev.breakdown.lattice).toBe(3);
    expect(ev.breakdown.symmetry + ev.breakdown.lattice).toBeGreaterThanOrEqual(5);
    // …yet the ink does not overlap a star's linework, so overlap is denied…
    expect(ev.breakdown.overlap).toBe(0);
    // …and the honest verdict is fall-through (never offered as "your star").
    expect(ev.accepted).toBe(false);
    expect(ev.score).toBeLessThan(FIT_THRESHOLD);
    // SURVIVES THE OPTIMIZER (task 3d): evaluateFit runs family.fit() internally,
    // searching every fold × contact-angle × scale to MAXIMISE overlap. The
    // returned params are the single most-overlapping star it could find — a
    // real supported fold — and even THAT best case banks 0 overlap points.
    expect(SUPPORTED_FOLDS).toContain(ev.params.n);
  });

  // THE TRUE-POSITIVE COUNTERPART (S12 reviewer finding). The guarantee is EXACT
  // — "cannot clear ≥7 on sym+lattice ALONE" — NOT the overclaim "no non-star is
  // ever offered." A 12-spoke asterisk is not a Kaplan star, yet it MUST clear:
  // a sharp star's linework IS 2n radial spokes, so the asterisk genuinely
  // coincides with star ink and earns its ≥7 through REAL IoU (not flattery). It
  // is the honest mirror of the hexagon: same full sym+lattice=6, opposite
  // verdict, and the difference is entirely the overlap sub-score.
  it('RADIAL non-star (12-spoke asterisk) CLEARS ≥7 via genuine IoU — offered as a legit star, not flattery', () => {
    const ev = evaluateFit(asteriskFixture(12, 45), kaplanStarFamily, { lattice: hexLat, symmetry: p6m });
    expect(ev.accepted).toBe(true);
    expect(ev.score).toBeGreaterThanOrEqual(FIT_THRESHOLD);
    // Full structural match, SAME as the rejected hexagon…
    expect(ev.breakdown.symmetry + ev.breakdown.lattice).toBe(6);
    // …but here the ink genuinely overlaps star linework, so overlap is REAL and
    // above the floor — this is honest coincidence, the hexagon's opposite.
    expect(ev.breakdown.overlap).toBeGreaterThan(0);
    expect(ev.iou).toBeGreaterThan(IOU_FLOOR); // real ink overlap, not a sym+lat pass
    // Optimizer picked a real fold via the internal fit() search.
    expect(SUPPORTED_FOLDS).toContain(ev.params.n);
  });

  // Badge honesty (S12 task, advisor MAJOR): `score` FLOORS `total`, so a fitted
  // total in (6,7) — e.g. a hexagon OUTLINE, which best-fits a shallow 6-star and
  // banks a PARTIAL overlap point — can never DISPLAY "fit 7/10" while being
  // rejected. score ≥ threshold must be equivalent to accepted, always.
  it('score and accepted never disagree (floor, not round): a hexagon outline at total≈6.5 shows 6/10, not 7/10', () => {
    // A thin hexagon outline (stroke, no fill) — nearly a shallow n=6 star, so it
    // banks a real fraction of an overlap point (total lands in (6,7)).
    const cx = 50, cy = 50, r = 40, pts = [];
    for (let k = 0; k <= 6; k++) {
      const a = (2 * Math.PI * k) / 6 + Math.PI / 6;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    const outline = {
      width: 100,
      height: 100,
      fills: [],
      strokes: [{ d: `M${pts.map((p) => p.map((v) => Math.round(v * 100) / 100).join(' ')).join(' L ')} Z`, role: 'score' }],
    };
    const ev = evaluateFit(outline, kaplanStarFamily, { lattice: hexLat, symmetry: p6m });
    expect(ev.breakdown.overlap).toBeGreaterThan(0); // it DID bank a partial point
    expect(ev.breakdown.symmetry + ev.breakdown.lattice + ev.breakdown.overlap).toBeLessThan(FIT_THRESHOLD);
    expect(ev.accepted).toBe(false);
    expect(ev.score).toBeLessThan(FIT_THRESHOLD); // Math.round(6.5)=7 would break this
    expect(ev.score >= FIT_THRESHOLD).toBe(ev.accepted); // the invariant
    // The badge shows the floored score, and the rejection message agrees with
    // it — never the self-contradicting "Fit 7/10 — below 7" that Math.round gave.
    expect(ev.explanation).toContain(`Fit ${ev.score}/10 — below ${FIT_THRESHOLD}`);
    expect(ev.explanation).not.toContain(`Fit ${FIT_THRESHOLD}/10 — below`);
  });

  // The score↔accepted invariant holds across the ENTIRE battery (a Math.round
  // regression would break it on any fractional-total fixture).
  it('score ≥ threshold ⟺ accepted, for every fixture in the battery', () => {
    const cases = [
      evaluateFit(starFixture(8, 45), kaplanStarFamily, { lattice: squareLat, symmetry: p4m }),
      evaluateFit(starFixture(6, 50), kaplanStarFamily, { lattice: hexLat, symmetry: p6m }),
      evaluateFit(floralFixture(8), kaplanStarFamily, { lattice: squareLat, symmetry: p4m }),
      evaluateFit(hexagonFixture(45), kaplanStarFamily, { lattice: hexLat, symmetry: p6m }),
      evaluateFit(randomFixture(7), kaplanStarFamily, { lattice: squareLat, symmetry: p4m }),
      evaluateFit(starFixture(8), kaplanStarFamily, { lattice: null, symmetry: null }),
    ];
    for (const ev of cases) {
      expect(ev.score >= FIT_THRESHOLD).toBe(ev.accepted);
    }
  });
});

describe('IoU NECESSITY — sym+lattice alone cannot clear the bar', () => {
  it('a periodic non-star with GENUINELY HIGH sym+lattice (≥5) still stays < 7 — the fall-through is PROVABLY on IoU', () => {
    // The old version of this test used the floral fixture and asserted only
    // `sym+lat <= 6` — a ceiling any weak-scoring motif trivially satisfies, so
    // it proved nothing (the floral only reaches sym+lat=4). Use the hexagon,
    // which earns the FULL 6, and assert the sub-score is genuinely HIGH: now the
    // only remaining explanation for score < 7 is that IoU denied the last point.
    const ev = evaluateFit(hexagonFixture(45), kaplanStarFamily, { lattice: hexLat, symmetry: p6m });
    expect(ev.breakdown.symmetry + ev.breakdown.lattice).toBeGreaterThanOrEqual(5); // HIGH, not a weak score
    expect(ev.breakdown.overlap).toBe(0); // IoU is the one thing missing
    expect(ev.score).toBeLessThan(FIT_THRESHOLD);
  });

  it('distinguishes a no-lattice rejection from a low-IoU rejection VIA THE BREAKDOWN (a lattice-gate fall-through is NOT IoU discrimination)', () => {
    // No-lattice: the single-motif floor. Everything is zero — this rejection is
    // the LATTICE GATE, and must not be miscounted as IoU discrimination.
    const noLattice = evaluateFit(starFixture(8), kaplanStarFamily, { lattice: null, symmetry: null });
    expect(noLattice.breakdown).toEqual({ symmetry: 0, lattice: 0, overlap: 0 });
    expect(noLattice.score).toBe(0);

    // Low-IoU: a REAL lattice fully matched (lattice sub-score > 0), rejected
    // SOLELY because overlap is 0. This is the honest IoU discrimination the
    // no-lattice case cannot demonstrate.
    const lowIoU = evaluateFit(hexagonFixture(45), kaplanStarFamily, { lattice: hexLat, symmetry: p6m });
    expect(lowIoU.breakdown.lattice).toBeGreaterThan(0); // lattice genuinely matched
    expect(lowIoU.breakdown.symmetry).toBeGreaterThan(0); // symmetry genuinely matched
    expect(lowIoU.breakdown.overlap).toBe(0); // …only IoU is absent
    expect(lowIoU.accepted).toBe(false);
  });

  it('a real off-center star (soft symmetry) leans on IoU and may fall through — never a dead end', () => {
    const soft = { group: 'pm', confidence: 0.4, source: 'auto', hiddenRotation: true };
    const ev = evaluateFit(starFixture(8, 45), kaplanStarFamily, { lattice: squareLat, symmetry: soft });
    // Symmetry is capped low (soft), so the total is driven by lattice + IoU;
    // whatever the verdict, it is honest and never throws / dead-ends.
    expect(ev.breakdown.symmetry).toBeLessThanOrEqual(1);
    expect(typeof ev.accepted).toBe('boolean');
  });

  it('only the adjudicated score reaches the explanation (never family.fit()\'s raw IoU as /10)', () => {
    const ev = evaluateFit(starFixture(8, 45), kaplanStarFamily, { lattice: squareLat, symmetry: p4m });
    expect(ev.explanation).toContain(`${ev.score}/10`);
    // The raw IoU (0..1) is exposed separately, not as the /10 badge number.
    expect(ev.iou).toBeGreaterThan(0);
    expect(ev.iou).toBeLessThanOrEqual(1);
  });
});
