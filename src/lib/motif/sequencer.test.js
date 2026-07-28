import { describe, it, expect } from 'vitest';
import { dealSlots, isSequenceBlock, sequenceSlots } from './sequencer.js';

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

// --- ZONED sequencer (ADR 0008) -----------------------------------------
// Zone-aware fixtures need explicit roles + spatial coords, so these build
// anchors directly rather than through the flat-form `mkA`/`row` helpers.
function mkZ(id, { role = 'edge', s = 0, x = 0, y = 0, pathIndex = 0, closed = false } = {}) {
  return { id, role, x, y, tangent: 0, normal: 0, s, meta: { pathIndex, closed } };
}

describe('dealSlots — zoned: Apex cycle defaults CONTINUOUS (flowers walk across strands)', () => {
  it('indexes the Apex slots continuously across paths (per-path restart would pin every strand to slot 0)', () => {
    // 3 paths, each a tip (Apex) + two edge samples (Stem). Because a tip exists,
    // edges stay Stem (no terminus derivation).
    const survivors = [
      mkZ('tip:0', { role: 'tip', pathIndex: 0 }),
      mkZ('edge:0:a', { role: 'edge', pathIndex: 0 }),
      mkZ('edge:0:b', { role: 'edge', pathIndex: 0 }),
      mkZ('tip:1', { role: 'tip', pathIndex: 1 }),
      mkZ('edge:1:a', { role: 'edge', pathIndex: 1 }),
      mkZ('edge:1:b', { role: 'edge', pathIndex: 1 }),
      mkZ('tip:2', { role: 'tip', pathIndex: 2 }),
      mkZ('edge:2:a', { role: 'edge', pathIndex: 2 }),
      mkZ('edge:2:b', { role: 'edge', pathIndex: 2 }),
    ];
    const assigns = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [
        { zone: 'apex', slots: [{ glyphRef: 'F1' }, { glyphRef: 'F2' }, { glyphRef: 'F3' }] },
        { zone: 'stem', slots: [{ glyphRef: 'L' }] },
      ],
    });
    // Apex walks F1→F2→F3 across the three strands; Stem is all L.
    // Per-path restart on the Apex would instead give F1,F1,F1 — the anti-case.
    expect(assigns.map((a) => a.glyphRef)).toEqual([
      'F1', 'L', 'L',
      'F2', 'L', 'L',
      'F3', 'L', 'L',
    ]);
  });
});

describe('dealSlots — zoned: Stem cycle defaults per-path RESTART (the x-o-x-o invariant)', () => {
  it('restarts the Stem cycle at each path (closed loops ⇒ all Stem, no Apex)', () => {
    // path 0: 3 stem samples, path 1: 2 — closed loops so every edge is Stem and
    // the terminus rule never fires. Restart gives x,o,x | x,o; a continuous
    // deal would instead give x,o,x,o,x (the anti-case, differing at idx 3 & 4).
    const survivors = [
      mkZ('e:0:0', { role: 'edge', pathIndex: 0, closed: true }),
      mkZ('e:0:1', { role: 'edge', pathIndex: 0, closed: true }),
      mkZ('e:0:2', { role: 'edge', pathIndex: 0, closed: true }),
      mkZ('e:1:0', { role: 'edge', pathIndex: 1, closed: true }),
      mkZ('e:1:1', { role: 'edge', pathIndex: 1, closed: true }),
    ];
    const assigns = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [{ zone: 'stem', slots: [{ glyphRef: 'x' }, { glyphRef: 'o' }] }],
    });
    expect(assigns.map((a) => a.glyphRef)).toEqual(['x', 'o', 'x', 'x', 'o']);
    expect(assigns.map((a) => a.rest)).toEqual([false, false, false, false, false]);
  });
});

describe('dealSlots — zoned: random deal is per-anchor-id stable within a Zone', () => {
  it('dropping a NON-LAST Stem anchor keeps every other anchor’s slot (hash over anchor.id)', () => {
    const mkStem = (i) => mkZ(`e:0:${i}`, { role: 'edge', pathIndex: 0, closed: true });
    const survivors = Array.from({ length: 12 }, (_, i) => mkStem(i));
    const seq = {
      type: 'sequence',
      seed: 5,
      zones: [
        {
          zone: 'stem',
          mode: 'random',
          slots: [{ glyphRef: 'A' }, { glyphRef: 'B' }, { glyphRef: 'C' }],
        },
      ],
    };
    const before = dealSlots(survivors, seq);
    const beforeMap = Object.fromEntries(survivors.map((s, i) => [s.id, before[i].glyphRef]));
    const dropped = survivors.filter((_, i) => i !== 3); // remove a non-last anchor
    const after = dealSlots(dropped, seq);
    dropped.forEach((s, i) => {
      expect(after[i].glyphRef).toBe(beforeMap[s.id]); // unchanged slot per surviving id
    });
  });
});

describe('dealSlots — zoned: a Rest slot inside a Zone CONSUMES a cycle step', () => {
  it('advances the Stem cycle index through a Rest (a real gap: A, rest, A, rest)', () => {
    const survivors = Array.from({ length: 4 }, (_, i) =>
      mkZ(`e:0:${i}`, { role: 'edge', pathIndex: 0, closed: true }),
    );
    const assigns = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [{ zone: 'stem', slots: [{ glyphRef: 'A' }, { rest: true }] }],
    });
    expect(assigns.map((a) => a.rest)).toEqual([false, true, false, true]);
    expect(assigns.map((a) => a.glyphRef)).toEqual(['A', undefined, 'A', undefined]);
    expect(assigns.map((a) => a.slotIndex)).toEqual([0, 1, 0, 1]);
  });
});

describe('dealSlots — zoned: anchors in NO Zone rest (cells, and Apex dropped by the ends filter)', () => {
  it('rests cells and the Apex member removed by ends:up (stamp nothing)', () => {
    // One OPEN path with two tips (a tip exists ⇒ edges stay Stem), plus a cell.
    const survivors = [
      mkZ('tip:0:hi', { role: 'tip', x: 0, y: 0, pathIndex: 0 }),
      mkZ('edge:0:a', { role: 'edge', x: 0, y: 3, pathIndex: 0 }),
      mkZ('cell:0', { role: 'cell', x: 0, y: 5, pathIndex: 0 }),
      mkZ('edge:0:b', { role: 'edge', x: 0, y: 7, pathIndex: 0 }),
      mkZ('tip:0:lo', { role: 'tip', x: 0, y: 10, pathIndex: 0 }),
    ];
    const assigns = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [
        { zone: 'apex', ends: 'up', slots: [{ glyphRef: 'F' }] },
        { zone: 'stem', slots: [{ glyphRef: 'L' }] },
      ],
    });
    // ends:up keeps the upper tip (y=0); the lower tip (y=10) and the cell rest.
    expect(assigns.map((a) => a.glyphRef)).toEqual(['F', 'L', undefined, 'L', undefined]);
    expect(assigns.map((a) => a.rest)).toEqual([false, false, true, false, true]);
  });
});

// ── #150 — the Cell Zone (ADR 0008 amendment) ────────────────────────────────
// The defect this slice exists to fix: `cell` anchors belonged to no Zone, and a
// zoned Sequencer rests every anchor it finds in no Zone, so a zoned mode on a
// cell-only host dealt nothing at all. Cell is now a third partition with its own
// Slots and its own cycle/random deal.
describe('dealSlots — zoned: a CELL-ONLY survivor set deals Slots instead of resting', () => {
  it('deals the Cell Zone over every cell anchor — no Apex, no Stem, no Rests', () => {
    const survivors = Array.from({ length: 5 }, (_, i) =>
      mkZ(`cell:${i}`, { role: 'cell', x: i * 20, y: 0 }),
    );
    const assigns = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [{ zone: 'cell', mode: 'cycle', slots: [{ glyphRef: 'A' }, { glyphRef: 'B' }] }],
    });
    expect(assigns.map((a) => a.rest)).toEqual([false, false, false, false, false]);
    expect(assigns.map((a) => a.glyphRef)).toEqual(['A', 'B', 'A', 'B', 'A']);
    expect(assigns.map((a) => a.slotIndex)).toEqual([0, 1, 0, 1, 0]);
  });

  it('a Rest inside the Cell Zone consumes a cycle step, exactly as in the other Zones', () => {
    const survivors = Array.from({ length: 4 }, (_, i) => mkZ(`cell:${i}`, { role: 'cell' }));
    const assigns = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [{ zone: 'cell', slots: [{ glyphRef: 'A' }, { rest: true }] }],
    });
    expect(assigns.map((a) => a.rest)).toEqual([false, true, false, true]);
  });

  it('the Cell Zone honours a weighted RANDOM deal, stable per anchor id', () => {
    const survivors = Array.from({ length: 12 }, (_, i) => mkZ(`cell:${i}`, { role: 'cell' }));
    const seq = {
      type: 'sequence',
      seed: 7,
      zones: [
        { zone: 'cell', mode: 'random', slots: [{ glyphRef: 'A' }, { glyphRef: 'B', weight: 3 }] },
      ],
    };
    const first = dealSlots(survivors, seq).map((a) => a.glyphRef);
    // Re-dealing a SHUFFLED survivor list gives each id the same slot (ADR 0005).
    const shuffled = [...survivors].reverse();
    const byId = new Map(dealSlots(shuffled, seq).map((a, i) => [shuffled[i].id, a.glyphRef]));
    expect(survivors.map((s) => byId.get(s.id))).toEqual(first);
    expect(new Set(first)).toEqual(new Set(['A', 'B']));
  });

  it("the Cell Zone's cycle default is PER-PATH (Stem's default), not continuous", () => {
    // Two cells per path over two paths. A per-path counter restarts at slot 0 on
    // path 1; a continuous one would carry the index across.
    const survivors = [
      mkZ('cell:0:a', { role: 'cell', pathIndex: 0 }),
      mkZ('cell:0:b', { role: 'cell', pathIndex: 0 }),
      mkZ('cell:0:c', { role: 'cell', pathIndex: 0 }),
      mkZ('cell:1:a', { role: 'cell', pathIndex: 1 }),
    ];
    const zone = { zone: 'cell', mode: 'cycle', slots: [{ glyphRef: 'A' }, { glyphRef: 'B' }] };
    const byDefault = dealSlots(survivors, { type: 'sequence', seed: 1, zones: [zone] });
    expect(byDefault.map((a) => a.slotIndex)).toEqual([0, 1, 0, 0]);
    // …and an explicit `continuous:true` still wins over the default.
    const continuous = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [{ ...zone, continuous: true }],
    });
    expect(continuous.map((a) => a.slotIndex)).toEqual([0, 1, 0, 1]);
  });

  it('a MIXED host deals all three Zones at once — tiles fill while arcs run', () => {
    // One open captured path (no tips ⇒ min/max-s edge samples are the Apex) plus
    // two cells. Every survivor is dealt; nothing rests.
    const survivors = [
      mkZ('cell:0', { role: 'cell', x: 0, y: 0 }),
      mkZ('edge:0:0', { role: 'edge', s: 0, pathIndex: 0 }),
      mkZ('edge:0:1', { role: 'edge', s: 0.5, pathIndex: 0 }),
      mkZ('edge:0:2', { role: 'edge', s: 1, pathIndex: 0 }),
      mkZ('cell:1', { role: 'cell', x: 50, y: 0 }),
    ];
    const assigns = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [
        { zone: 'apex', slots: [{ glyphRef: 'F' }] },
        { zone: 'stem', slots: [{ glyphRef: 'L' }] },
        { zone: 'cell', slots: [{ glyphRef: 'T' }] },
      ],
    });
    expect(assigns.map((a) => a.glyphRef)).toEqual(['T', 'F', 'L', 'F', 'T']);
    expect(assigns.some((a) => a.rest)).toBe(false);
  });

  it('a Cell Zone with no slots rests its members (stamp nothing), like any Zone', () => {
    const assigns = dealSlots([mkZ('cell:0', { role: 'cell' })], {
      type: 'sequence',
      seed: 1,
      zones: [{ zone: 'cell', slots: [] }],
    });
    expect(assigns.map((a) => a.rest)).toEqual([true]);
  });

  it('the Cell Zone has NO end-selector — `ends` on it is inert (a region has no ends)', () => {
    // applyEnds stays Apex-only by construction: passing `ends:'up'` to the Cell
    // Zone must not thin it to one member per path.
    const survivors = [
      mkZ('cell:0', { role: 'cell', x: 0, y: 0 }),
      mkZ('cell:1', { role: 'cell', x: 0, y: 50 }),
    ];
    const assigns = dealSlots(survivors, {
      type: 'sequence',
      seed: 1,
      zones: [{ zone: 'cell', ends: 'up', slots: [{ glyphRef: 'T' }] }],
    });
    expect(assigns.map((a) => a.rest)).toEqual([false, false]);
  });

  it('zone order in the chain does not change the deal — each Zone owns disjoint anchors', () => {
    const survivors = [
      mkZ('cell:0', { role: 'cell' }),
      mkZ('edge:0:0', { role: 'edge', s: 0, pathIndex: 0 }),
      mkZ('edge:0:1', { role: 'edge', s: 1, pathIndex: 0 }),
    ];
    const zones = [
      { zone: 'cell', slots: [{ glyphRef: 'T' }] },
      { zone: 'apex', slots: [{ glyphRef: 'F' }] },
    ];
    const appended = dealSlots(survivors, { type: 'sequence', seed: 1, zones: [...zones].reverse() });
    const prepended = dealSlots(survivors, { type: 'sequence', seed: 1, zones });
    expect(prepended).toEqual(appended);
    expect(prepended.map((a) => a.glyphRef)).toEqual(['T', 'F', 'F']);
  });
});

describe('dealSlots — zoned: a chain with NO Cell Zone is unaffected by the new partition', () => {
  it('still rests every cell — the partition is not the deal', () => {
    // Criterion 8, stated as the thing that would break it. `partitionZones` now
    // hands back a third bucket; a chain that names only Apex and Stem must not
    // read it. (sequencer.test.js's pre-#150 `ends:up` case above is the same
    // claim and is deliberately left UNTOUCHED as the tripwire.)
    const survivors = [
      mkZ('cell:0', { role: 'cell' }),
      mkZ('edge:0:0', { role: 'edge', s: 0, pathIndex: 0 }),
      mkZ('cell:1', { role: 'cell' }),
      mkZ('edge:0:1', { role: 'edge', s: 0.5, pathIndex: 0 }),
      mkZ('edge:0:2', { role: 'edge', s: 1, pathIndex: 0 }),
    ];
    const twoZone = {
      type: 'sequence',
      seed: 1,
      zones: [
        { zone: 'apex', slots: [{ glyphRef: 'F' }] },
        { zone: 'stem', slots: [{ glyphRef: 'L' }] },
      ],
    };
    const assigns = dealSlots(survivors, twoZone);
    expect(assigns.map((a) => a.rest)).toEqual([true, false, true, false, false]);
    // …and the NON-cell assignments are byte-identical to the cell-free deal.
    const cellFree = survivors.filter((a) => a.role !== 'cell');
    expect(assigns.filter((_, i) => survivors[i].role !== 'cell')).toEqual(
      dealSlots(cellFree, twoZone),
    );
  });

  it('a zone id the deal does not recognise rests its members rather than throwing', () => {
    // The pre-existing, documented failure mode: there is no schema validation of
    // zone ids anywhere in the studio, and an unknown id fails by RESTING. Adding
    // a third partition narrows the gap (ZONE_IDS is now single-sourced beside
    // the partition) without closing it. The sentinel is deliberately NOT 'node',
    // which ADR 0008 reserves for a future crossing Zone.
    const assigns = dealSlots([mkZ('edge:0:0', { role: 'edge' })], {
      type: 'sequence',
      seed: 1,
      zones: [{ zone: 'not-a-zone', slots: [{ glyphRef: 'X' }] }],
    });
    expect(assigns.map((a) => a.rest)).toEqual([true]);
  });
});

describe('isSequenceBlock — recognizes the ZONED form (gate that lets zoned blocks reach dealSlots)', () => {
  it('accepts a block whose deal is a non-empty zones array (no flat slots)', () => {
    // The placement engine gates the dealSlots call on this predicate; a zoned
    // block carries `zones` and NO `slots`, so it must be recognized here or the
    // zoned deal is unreachable.
    expect(
      isSequenceBlock({ type: 'sequence', zones: [{ zone: 'stem', slots: [{ glyphRef: 'A' }] }] }),
    ).toBe(true);
  });

  it('rejects a block with neither slots nor zones (degenerate ⇒ engine legacy fallback)', () => {
    expect(isSequenceBlock({ type: 'sequence' })).toBe(false);
  });

  it('rejects an empty zones array (nothing to deal ⇒ not a live sequence block)', () => {
    expect(isSequenceBlock({ type: 'sequence', zones: [] })).toBe(false);
  });
});

describe('sequenceSlots — "the slots of a block", flat or zoned', () => {
  it('a FLAT block reads as its own slots (same array contents, in order)', () => {
    const slots = [{ glyphRef: 'A' }, { rest: true }];
    expect(sequenceSlots({ type: 'sequence', slots })).toEqual(slots);
  });

  it('a ZONED block reads as its zones’ slots, concatenated in zone order', () => {
    expect(
      sequenceSlots({
        type: 'sequence',
        zones: [
          { zone: 'apex', slots: [{ glyphRef: 'rosette' }] },
          { zone: 'stem', slots: [{ glyphRef: 'leaf' }, { glyphRef: 'leaf', rotationOffset: 180 }] },
        ],
      }),
    ).toEqual([
      { glyphRef: 'rosette' },
      { glyphRef: 'leaf' },
      { glyphRef: 'leaf', rotationOffset: 180 },
    ]);
  });

  it('never throws on absent/degenerate input — always an array', () => {
    expect(sequenceSlots(null)).toEqual([]);
    expect(sequenceSlots({ type: 'route', roles: ['edge'] })).toEqual([]);
    expect(sequenceSlots({ type: 'sequence', zones: [{ zone: 'stem' }, null] })).toEqual([]);
    expect(sequenceSlots([{ glyphRef: 'A' }])).toEqual([]); // an array is not a block
  });
});
