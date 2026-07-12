import { describe, it, expect } from 'vitest';
import { dealSlots } from './sequencer.js';

// --- helpers -------------------------------------------------------------
// Minimal survivor Anchor factory. dealSlots only reads `id` (random deal +
// rotationRandom hashing) and `meta.pathIndex` (cycle per-path restart).
function mkA(id, { pathIndex = 0 } = {}) {
  return { id, role: 'edge', x: 0, y: 0, tangent: 0, normal: 0, s: 0, meta: { pathIndex } };
}

// A row of `n` survivors on one path, ids s0..s{n-1}.
function row(n, pathIndex = 0) {
  return Array.from({ length: n }, (_, i) => mkA(`s${i}`, { pathIndex }));
}

const seqBlock = (over = {}) => ({ type: 'sequence', mode: 'cycle', slots: [], ...over });

// ------------------------------------------------------------------------
describe('dealSlots — validity guard', () => {
  it('returns null when slots is missing/empty (⇒ engine falls back to legacy)', () => {
    expect(dealSlots(row(3), seqBlock({ slots: [] }))).toBeNull();
    expect(dealSlots(row(3), seqBlock({ slots: undefined }))).toBeNull();
    expect(dealSlots(row(3), null)).toBeNull();
  });

  it('returns one assignment per survivor, in survivor order', () => {
    const assigns = dealSlots(row(4), seqBlock({ slots: [{ glyphRef: 'A' }] }));
    expect(assigns).toHaveLength(4);
    expect(assigns.map((a) => a.glyphRef)).toEqual(['A', 'A', 'A', 'A']);
  });
});

describe('dealSlots — cycle mode (positional)', () => {
  it('x-o-x-o: cycles the slot list per survivor index', () => {
    const assigns = dealSlots(
      row(5),
      seqBlock({ mode: 'cycle', slots: [{ glyphRef: 'A' }, { glyphRef: 'B' }] }),
    );
    expect(assigns.map((a) => a.glyphRef)).toEqual(['A', 'B', 'A', 'B', 'A']);
    expect(assigns.map((a) => a.slotIndex)).toEqual([0, 1, 0, 1, 0]);
  });

  it('a Rest slot CONSUMES a step but marks rest:true (a real gap)', () => {
    const assigns = dealSlots(
      row(4),
      seqBlock({ mode: 'cycle', slots: [{ glyphRef: 'A' }, { rest: true }] }),
    );
    // survivor 0→A, 1→rest, 2→A, 3→rest. The index still advances through rests.
    expect(assigns.map((a) => a.rest)).toEqual([false, true, false, true]);
    expect(assigns.map((a) => a.glyphRef)).toEqual(['A', undefined, 'A', undefined]);
  });

  it('restarts the cycle at each host path by DEFAULT (per meta.pathIndex)', () => {
    // path 0 has 3 survivors, path 1 has 2 — each starts at slot 0.
    const survivors = [...row(3, 0), ...row(2, 1)];
    const assigns = dealSlots(
      survivors,
      seqBlock({ mode: 'cycle', slots: [{ glyphRef: 'A' }, { glyphRef: 'B' }] }),
    );
    // path0: A,B,A  |  path1 RESTARTS: A,B
    expect(assigns.map((a) => a.glyphRef)).toEqual(['A', 'B', 'A', 'A', 'B']);
  });

  it('continuous:true indexes globally across paths (no per-path restart)', () => {
    const survivors = [...row(3, 0), ...row(2, 1)];
    const assigns = dealSlots(
      survivors,
      seqBlock({ mode: 'cycle', continuous: true, slots: [{ glyphRef: 'A' }, { glyphRef: 'B' }] }),
    );
    // global index 0..4 ⇒ A,B,A,B,A (path boundary ignored)
    expect(assigns.map((a) => a.glyphRef)).toEqual(['A', 'B', 'A', 'B', 'A']);
  });

  it('restart and continuous DIFFER on a multi-path survivor set', () => {
    const survivors = [...row(3, 0), ...row(2, 1)];
    const slots = [{ glyphRef: 'A' }, { glyphRef: 'B' }];
    const restart = dealSlots(survivors, seqBlock({ mode: 'cycle', slots }));
    const cont = dealSlots(survivors, seqBlock({ mode: 'cycle', continuous: true, slots }));
    expect(restart.map((a) => a.glyphRef)).not.toEqual(cont.map((a) => a.glyphRef));
  });

  it('cycle is POSITIONAL: shifting the survivor set shifts downstream slots', () => {
    const slots = [{ glyphRef: 'A' }, { glyphRef: 'B' }];
    const full = dealSlots(row(4), seqBlock({ mode: 'cycle', slots }));
    // drop the first survivor: everyone shifts one slot earlier.
    const dropped = dealSlots(row(4).slice(1), seqBlock({ mode: 'cycle', slots }));
    expect(full.map((a) => a.glyphRef)).toEqual(['A', 'B', 'A', 'B']);
    expect(dropped.map((a) => a.glyphRef)).toEqual(['A', 'B', 'A']); // s1 now gets A, not B
  });
});

describe('dealSlots — random mode (per-anchor-id stable, weighted)', () => {
  it('weighted draw matches weights approximately over many anchors', () => {
    const survivors = Array.from({ length: 4000 }, (_, i) => mkA(`edge:0:${i}`));
    const assigns = dealSlots(
      survivors,
      seqBlock({ mode: 'random', seed: 7, slots: [{ glyphRef: 'A', weight: 3 }, { glyphRef: 'B', weight: 1 }] }),
    );
    const a = assigns.filter((x) => x.glyphRef === 'A').length;
    const b = assigns.filter((x) => x.glyphRef === 'B').length;
    // expect ~75% / 25%.
    expect(a / assigns.length).toBeGreaterThan(0.72);
    expect(a / assigns.length).toBeLessThan(0.78);
    expect(a + b).toBe(assigns.length);
  });

  it('default weight is 1 (uniform when unspecified)', () => {
    const survivors = Array.from({ length: 4000 }, (_, i) => mkA(`edge:0:${i}`));
    const assigns = dealSlots(
      survivors,
      seqBlock({ mode: 'random', seed: 3, slots: [{ glyphRef: 'A' }, { glyphRef: 'B' }] }),
    );
    const a = assigns.filter((x) => x.glyphRef === 'A').length;
    expect(a / assigns.length).toBeGreaterThan(0.46);
    expect(a / assigns.length).toBeLessThan(0.54);
  });

  it('SURVIVOR-STABLE: dropping a NON-LAST upstream anchor keeps others’ slots', () => {
    const survivors = Array.from({ length: 12 }, (_, i) => mkA(`edge:0:${i}`));
    const slots = [{ glyphRef: 'A' }, { glyphRef: 'B' }, { glyphRef: 'C' }];
    const before = dealSlots(survivors, seqBlock({ mode: 'random', seed: 5, slots }));
    // remove a non-last anchor (index 3) — a positional impl would reshuffle all after it.
    const dropped = survivors.filter((_, i) => i !== 3);
    const after = dealSlots(dropped, seqBlock({ mode: 'random', seed: 5, slots }));
    const byId = (arr) => Object.fromEntries(arr.map((a, i) => [dropped[i].id, a.glyphRef]));
    const beforeMap = Object.fromEntries(survivors.map((s, i) => [s.id, before[i].glyphRef]));
    const afterMap = byId(after);
    for (const s of dropped) {
      expect(afterMap[s.id]).toBe(beforeMap[s.id]); // every surviving anchor kept its slot
    }
  });

  it('continuous toggle is a NO-OP in random mode (documented)', () => {
    const survivors = [...row(3, 0).map((a, i) => ({ ...a, id: `p0:${i}` })),
      ...row(3, 1).map((a, i) => ({ ...a, id: `p1:${i}` }))];
    const slots = [{ glyphRef: 'A' }, { glyphRef: 'B' }];
    const restart = dealSlots(survivors, seqBlock({ mode: 'random', seed: 9, slots }));
    const cont = dealSlots(survivors, seqBlock({ mode: 'random', seed: 9, continuous: true, slots }));
    expect(cont.map((a) => a.glyphRef)).toEqual(restart.map((a) => a.glyphRef));
  });

  it('is deterministic: two calls with the same seed are identical', () => {
    const survivors = Array.from({ length: 20 }, (_, i) => mkA(`edge:0:${i}`));
    const slots = [{ glyphRef: 'A' }, { glyphRef: 'B' }, { rest: true }];
    const a = dealSlots(survivors, seqBlock({ mode: 'random', seed: 11, slots }));
    const b = dealSlots(survivors, seqBlock({ mode: 'random', seed: 11, slots }));
    expect(a).toEqual(b);
  });

  it('a different seed produces a different deal', () => {
    const survivors = Array.from({ length: 40 }, (_, i) => mkA(`edge:0:${i}`));
    const slots = [{ glyphRef: 'A' }, { glyphRef: 'B' }];
    const a = dealSlots(survivors, seqBlock({ mode: 'random', seed: 1, slots }));
    const b = dealSlots(survivors, seqBlock({ mode: 'random', seed: 2, slots }));
    expect(a.map((x) => x.glyphRef)).not.toEqual(b.map((x) => x.glyphRef));
  });

  // C3 zero-sum weight guard (correctness target #4): all-zero weights (or an
  // all-Rest strip) must not divide-by-zero or pick nothing. The A4 engine
  // already guards this by falling back to slot 0 (deterministic, no throw) — a
  // Rest winning the draw is a legitimate silence. Pinned here so the UI can
  // expose weight sliders that reach 0 without an engine crash.
  it('all-zero weights do not throw and yield one valid assignment per survivor (fallback to slot 0)', () => {
    const survivors = row(6);
    const slots = [{ glyphRef: 'A', weight: 0 }, { glyphRef: 'B', weight: 0 }];
    let assigns;
    expect(() => {
      assigns = dealSlots(survivors, seqBlock({ mode: 'random', seed: 4, slots }));
    }).not.toThrow();
    expect(assigns).toHaveLength(6);
    // Deterministic fallback: every survivor lands on slot 0 (glyph 'A').
    expect(assigns.every((a) => a.slotIndex === 0 && a.glyphRef === 'A')).toBe(true);
  });

  it('an all-Rest strip with zero weights does not throw (every survivor rests)', () => {
    const survivors = row(5);
    const slots = [{ rest: true, weight: 0 }, { rest: true, weight: 0 }];
    let assigns;
    expect(() => {
      assigns = dealSlots(survivors, seqBlock({ mode: 'random', seed: 8, slots }));
    }).not.toThrow();
    expect(assigns).toHaveLength(5);
    expect(assigns.every((a) => a.rest === true)).toBe(true);
  });
});

describe('dealSlots — modifier passthrough + defaults', () => {
  it('carries sizeScale / rotationOffset / flip with defaults', () => {
    const assigns = dealSlots(
      row(2),
      seqBlock({
        mode: 'cycle',
        slots: [
          { glyphRef: 'A', sizeScale: 2, rotationOffset: 15, flip: true },
          { glyphRef: 'B' },
        ],
      }),
    );
    expect(assigns[0].sizeScale).toBe(2);
    expect(assigns[0].rotationOffset).toBe(15);
    expect(assigns[0].flip).toBe(true);
    expect(assigns[0].flipSpecified).toBe(true);
    // defaults on the bare slot
    expect(assigns[1].sizeScale).toBe(1);
    expect(assigns[1].rotationOffset).toBe(0);
    expect(assigns[1].flipSpecified).toBe(false);
    expect(assigns[1].rotationRandomDelta).toBe(0);
  });

  it('distinguishes flip:false (specified) from flip absent', () => {
    const assigns = dealSlots(
      row(2),
      seqBlock({ mode: 'cycle', slots: [{ glyphRef: 'A', flip: false }, { glyphRef: 'B' }] }),
    );
    expect(assigns[0].flipSpecified).toBe(true);
    expect(assigns[0].flip).toBe(false);
    expect(assigns[1].flipSpecified).toBe(false);
  });
});

describe('dealSlots — rotationRandom spread shape (hashRng, channel "rot")', () => {
  const R = 90;
  function deltas(spread) {
    const survivors = Array.from({ length: 4000 }, (_, i) => mkA(`edge:0:${i}`));
    const assigns = dealSlots(
      survivors,
      seqBlock({
        mode: 'cycle',
        seed: 4,
        slots: [{ glyphRef: 'A', rotationRandom: { range: R, spread } }],
      }),
    );
    return assigns.map((a) => a.rotationRandomDelta);
  }
  const variance = (xs) => {
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    return xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length;
  };
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

  it('flat is ~uniform in [-R,R] (variance ≈ R²/3, mean ≈ 0)', () => {
    const d = deltas('flat');
    expect(Math.max(...d)).toBeLessThanOrEqual(R);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(-R);
    expect(Math.abs(mean(d))).toBeLessThan(R * 0.06);
    expect(variance(d)).toBeGreaterThan((R * R) / 3 * 0.85);
    expect(variance(d)).toBeLessThan((R * R) / 3 * 1.15);
  });

  it('bell (sum-of-2-uniforms) is concentrated near 0: variance ≈ half of flat', () => {
    const flat = deltas('flat');
    const bell = deltas('bell');
    const vFlat = variance(flat);
    const vBell = variance(bell);
    // triangular variance is R²/6, half of flat's R²/3.
    expect(vBell / vFlat).toBeGreaterThan(0.4);
    expect(vBell / vFlat).toBeLessThan(0.6);
    // more mass near 0: |delta| < R/3 more often for bell than flat.
    const nearZero = (xs) => xs.filter((x) => Math.abs(x) < R / 3).length;
    expect(nearZero(bell)).toBeGreaterThan(nearZero(flat));
  });

  it('rotationRandom is stable per anchor id + independent of the slot deal', () => {
    // Same anchor id + seed ⇒ identical rot delta regardless of mode / weights.
    const one = [mkA('edge:0:42')];
    const slots = [{ glyphRef: 'A', rotationRandom: { range: 30, spread: 'flat' } }];
    const cyc = dealSlots(one, seqBlock({ mode: 'cycle', seed: 8, slots }));
    const rnd = dealSlots(one, seqBlock({ mode: 'random', seed: 8, slots }));
    expect(cyc[0].rotationRandomDelta).toBe(rnd[0].rotationRandomDelta);
  });
});
