import { describe, it, expect } from 'vitest';
import { runSelectionChain } from './chain.js';
import { selectAnchors } from './placementEngine.js';
import { mulberry32 } from '../patterns/rng.js';

// --- helpers -------------------------------------------------------------
// Minimal Anchor factory matching the anchors.js shape. Only the fields the
// chain reads (id, role, x, y, meta.pathIndex/closed) matter; the rest are
// carried through untouched so a survivor is `===` its input anchor.
function mkAnchor(role, x, y, id, meta = {}) {
  return {
    id,
    role,
    x,
    y,
    tangent: 0,
    normal: 0,
    s: 0,
    meta: { pathIndex: 0, sampleIndex: 0, closed: false, ...meta },
  };
}

// A single-path row of `n` edge anchors, ids a0..a{n-1}, spaced along y=0.
function edgeRow(n, pathIndex = 0) {
  return Array.from({ length: n }, (_, i) =>
    mkAnchor('edge', i * 10, 0, `p${pathIndex}_a${i}`, { pathIndex, sampleIndex: i }),
  );
}

// Two paths interleaved in GLOBAL input order so per-path restart vs
// continuous is observable: [p0#0, p1#0, p0#1, p1#1, p0#2, p1#2, ...].
function twoPathInterleaved(perPath) {
  const out = [];
  for (let i = 0; i < perPath; i++) {
    out.push(mkAnchor('edge', i * 10, 0, `p0_a${i}`, { pathIndex: 0, sampleIndex: i }));
    out.push(mkAnchor('edge', i * 10, 50, `p1_a${i}`, { pathIndex: 1, sampleIndex: i }));
  }
  return out;
}

const ids = (arr) => arr.map((a) => a.id);

// ========================================================================
// route — role + path scope (all four scopes)
// ========================================================================
describe('runSelectionChain — route block', () => {
  it('roles null/absent passes all roles', () => {
    const anchors = [mkAnchor('edge', 0, 0, 'e'), mkAnchor('tip', 1, 1, 't')];
    expect(ids(runSelectionChain(anchors, [{ type: 'route' }]).survivors)).toEqual(['e', 't']);
    expect(
      ids(runSelectionChain(anchors, [{ type: 'route', roles: null }]).survivors),
    ).toEqual(['e', 't']);
  });

  it('roles filters by anchor role', () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'e0'),
      mkAnchor('tip', 1, 1, 't0'),
      mkAnchor('edge', 2, 2, 'e1'),
    ];
    expect(
      ids(runSelectionChain(anchors, [{ type: 'route', roles: ['edge'] }]).survivors),
    ).toEqual(['e0', 'e1']);
  });

  it("pathScope 'all' applies no path filter", () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'c', { closed: true, pathIndex: 0 }),
      mkAnchor('edge', 1, 1, 'o', { closed: false, pathIndex: 1 }),
    ];
    expect(
      ids(runSelectionChain(anchors, [{ type: 'route', pathScope: 'all' }]).survivors),
    ).toEqual(['c', 'o']);
  });

  it("pathScope 'closed' keeps only meta.closed === true", () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'c', { closed: true }),
      mkAnchor('edge', 1, 1, 'o', { closed: false }),
      mkAnchor('edge', 2, 2, 'u', {}), // closed defaults to false in factory
    ];
    expect(
      ids(runSelectionChain(anchors, [{ type: 'route', pathScope: 'closed' }]).survivors),
    ).toEqual(['c']);
  });

  it("pathScope 'open' keeps meta.closed !== true (including absent)", () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'c', { closed: true }),
      mkAnchor('edge', 1, 1, 'o', { closed: false }),
      // semantic-style anchor with NO closed field at all
      { id: 'sem', role: 'crossing', x: 3, y: 3, tangent: 0, normal: 0, s: 0, meta: {} },
    ];
    expect(
      ids(runSelectionChain(anchors, [{ type: 'route', pathScope: 'open' }]).survivors),
    ).toEqual(['o', 'sem']);
  });

  it("pathScope 'picked' keeps only anchors whose meta.pathIndex is in pickedPaths", () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'p0', { pathIndex: 0 }),
      mkAnchor('edge', 1, 1, 'p1', { pathIndex: 1 }),
      mkAnchor('edge', 2, 2, 'p2', { pathIndex: 2 }),
    ];
    expect(
      ids(
        runSelectionChain(anchors, [
          { type: 'route', pathScope: 'picked', pickedPaths: [0, 2] },
        ]).survivors,
      ),
    ).toEqual(['p0', 'p2']);
  });

  it('combines roles AND path scope', () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'e-closed', { closed: true }),
      mkAnchor('tip', 1, 1, 't-closed', { closed: true }),
      mkAnchor('edge', 2, 2, 'e-open', { closed: false }),
    ];
    expect(
      ids(
        runSelectionChain(anchors, [
          { type: 'route', roles: ['edge'], pathScope: 'closed' },
        ]).survivors,
      ),
    ).toEqual(['e-closed']);
  });
});

// ========================================================================
// everyN
// ========================================================================
describe('runSelectionChain — everyN block', () => {
  it('every 2nd, offset 0 (single path)', () => {
    const anchors = edgeRow(6);
    const out = runSelectionChain(anchors, [{ type: 'everyN', n: 2, offset: 0 }]);
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a2', 'p0_a4']);
  });

  it('respects offset', () => {
    const anchors = edgeRow(6);
    const out = runSelectionChain(anchors, [{ type: 'everyN', n: 3, offset: 1 }]);
    expect(ids(out.survivors)).toEqual(['p0_a1', 'p0_a4']);
  });

  it('degenerate n (<1) keeps all', () => {
    const anchors = edgeRow(4);
    expect(ids(runSelectionChain(anchors, [{ type: 'everyN', n: 0 }]).survivors)).toEqual(
      ids(anchors),
    );
    expect(
      ids(runSelectionChain(anchors, [{ type: 'everyN', n: -5 }]).survivors),
    ).toEqual(ids(anchors));
  });
});

// ========================================================================
// skip
// ========================================================================
describe('runSelectionChain — skip block', () => {
  it('cycled mask, true = drop', () => {
    const anchors = edgeRow(6);
    // mask [false,true] drops odd positions
    const out = runSelectionChain(anchors, [{ type: 'skip', mask: [false, true] }]);
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a2', 'p0_a4']);
  });

  it('empty / missing mask keeps all', () => {
    const anchors = edgeRow(4);
    expect(ids(runSelectionChain(anchors, [{ type: 'skip', mask: [] }]).survivors)).toEqual(
      ids(anchors),
    );
    expect(ids(runSelectionChain(anchors, [{ type: 'skip' }]).survivors)).toEqual(ids(anchors));
  });
});

// ========================================================================
// density — both rng modes
// ========================================================================
describe('runSelectionChain — density block', () => {
  it('density >= 1 keeps all and consumes no RNG', () => {
    const anchors = edgeRow(5);
    expect(
      ids(runSelectionChain(anchors, [{ type: 'density', density: 1, seed: 7 }]).survivors),
    ).toEqual(ids(anchors));
  });

  it('sequential mode reproduces one mulberry32(seed) drawn per candidate', () => {
    const anchors = edgeRow(20);
    const density = 0.5;
    const seed = 123;
    const rand = mulberry32(seed);
    const expected = anchors.filter(() => rand() < density).map((a) => a.id);
    const out = runSelectionChain(anchors, [
      { type: 'density', density, seed, rngMode: 'sequential' },
    ]);
    expect(ids(out.survivors)).toEqual(expected);
  });

  it('sequential is the default rngMode', () => {
    const anchors = edgeRow(20);
    const withMode = runSelectionChain(anchors, [
      { type: 'density', density: 0.5, seed: 9, rngMode: 'sequential' },
    ]);
    const noMode = runSelectionChain(anchors, [{ type: 'density', density: 0.5, seed: 9 }]);
    expect(ids(noMode.survivors)).toEqual(ids(withMode.survivors));
  });

  it('hash mode is order-independent (per-anchor-id stable)', () => {
    const anchors = edgeRow(30);
    const density = 0.5;
    const seed = 55;
    const forward = runSelectionChain(anchors, [
      { type: 'density', density, seed, rngMode: 'hash' },
    ]);
    // Reverse the INPUT order: each anchor's keep decision must be unchanged,
    // so the survivor SET is identical (order in output follows input order).
    const reversed = anchors.slice().reverse();
    const back = runSelectionChain(reversed, [
      { type: 'density', density, seed, rngMode: 'hash' },
    ]);
    expect(new Set(ids(back.survivors))).toEqual(new Set(ids(forward.survivors)));
  });
});

// ========================================================================
// field
// ========================================================================
describe('runSelectionChain — field block', () => {
  const field = { sampleNorm: (u) => u }; // value increases with x

  it('keeps anchors at or above threshold', () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'lo'), // u = 0.0
      mkAnchor('edge', 50, 0, 'mid'), // u = 0.5
      mkAnchor('edge', 90, 0, 'hi'), // u = 0.9
    ];
    const out = runSelectionChain(
      anchors,
      [{ type: 'field', field, threshold: 0.5, invert: false }],
      { canvasW: 100, canvasH: 100 },
    );
    expect(ids(out.survivors)).toEqual(['mid', 'hi']);
  });

  it('invert flips the comparison', () => {
    const anchors = [
      mkAnchor('edge', 0, 0, 'lo'),
      mkAnchor('edge', 50, 0, 'mid'),
      mkAnchor('edge', 90, 0, 'hi'),
    ];
    const out = runSelectionChain(
      anchors,
      [{ type: 'field', field, threshold: 0.5, invert: true }],
      { canvasW: 100, canvasH: 100 },
    );
    expect(ids(out.survivors)).toEqual(['lo']);
  });

  it('no-op when canvas dims are absent', () => {
    const anchors = edgeRow(4);
    const out = runSelectionChain(anchors, [{ type: 'field', field, threshold: 0.5 }], {});
    expect(ids(out.survivors)).toEqual(ids(anchors));
  });

  it('no-op when field is absent', () => {
    const anchors = edgeRow(4);
    const out = runSelectionChain(anchors, [{ type: 'field', threshold: 0.5 }], {
      canvasW: 100,
      canvasH: 100,
    });
    expect(ids(out.survivors)).toEqual(ids(anchors));
  });
});

// ========================================================================
// Order matters
// ========================================================================
describe('runSelectionChain — order matters', () => {
  it('[everyN, skip] and [skip, everyN] yield different (exact) survivors', () => {
    const anchors = edgeRow(9); // a0..a8
    // continuous:true so each block indexes over the whole stage (isolates the
    // ordering effect from per-path restart, which is irrelevant on 1 path).
    const everyThenSkip = runSelectionChain(anchors, [
      { type: 'everyN', n: 2, offset: 0, continuous: true }, // a0,a2,a4,a6,a8
      { type: 'skip', mask: [true, false, false], continuous: true }, // drop j%3==0
    ]);
    const skipThenEvery = runSelectionChain(anchors, [
      { type: 'skip', mask: [true, false, false], continuous: true }, // drop a0,a3,a6
      { type: 'everyN', n: 2, offset: 0, continuous: true },
    ]);
    // everyN→[a0,a2,a4,a6,a8]; skip drops j=0,3 → [a2,a4,a8]
    expect(ids(everyThenSkip.survivors)).toEqual(['p0_a2', 'p0_a4', 'p0_a8']);
    // skip→[a1,a2,a4,a5,a7,a8]; everyN keeps idx 0,2,4 → [a1,a4,a7]
    expect(ids(skipThenEvery.survivors)).toEqual(['p0_a1', 'p0_a4', 'p0_a7']);
    // ...and they differ — reordering the same two blocks is a different design.
    expect(ids(everyThenSkip.survivors)).not.toEqual(ids(skipThenEvery.survivors));
  });
});

// ========================================================================
// Repeated block (polyrhythm)
// ========================================================================
describe('runSelectionChain — repeated block', () => {
  it('two everyN blocks stack', () => {
    const anchors = edgeRow(12);
    const out = runSelectionChain(anchors, [
      { type: 'everyN', n: 2, offset: 0, continuous: true }, // a0,a2,a4,a6,a8,a10
      { type: 'everyN', n: 3, offset: 0, continuous: true }, // indices 0,3 of that → a0,a6
    ]);
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a6']);
  });
});

// ========================================================================
// Per-path restart vs continuous — the headline behavior (D4)
// ========================================================================
describe('runSelectionChain — per-path restart vs continuous (D4)', () => {
  it('everyN restarts its counter per path by default', () => {
    const anchors = twoPathInterleaved(4); // p0_a0,p1_a0,p0_a1,p1_a1,...
    const out = runSelectionChain(anchors, [{ type: 'everyN', n: 2, offset: 0 }]);
    // Per path: keep local index 0,2 → p0_a0,p0_a2 and p1_a0,p1_a2.
    // Output preserves GLOBAL input order.
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p1_a0', 'p0_a2', 'p1_a2']);
  });

  it('everyN continuous indexes across the whole stage', () => {
    const anchors = twoPathInterleaved(4);
    const out = runSelectionChain(anchors, [
      { type: 'everyN', n: 2, offset: 0, continuous: true },
    ]);
    // Global indices 0,2,4,6 → p0_a0,p0_a1,p0_a2,p0_a3 (the even global slots).
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a1', 'p0_a2', 'p0_a3']);
  });

  it('skip restarts its mask per path by default', () => {
    const anchors = twoPathInterleaved(3); // 6 anchors, 3 per path
    const out = runSelectionChain(anchors, [{ type: 'skip', mask: [false, true] }]);
    // Per path local idx 0,1,2 with mask[false,true]: keep 0,2 → a0,a2 each path.
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p1_a0', 'p0_a2', 'p1_a2']);
  });

  it('skip continuous cycles the mask across paths', () => {
    const anchors = twoPathInterleaved(3);
    const out = runSelectionChain(anchors, [
      { type: 'skip', mask: [false, true], continuous: true },
    ]);
    // Global idx 0..5, mask[false,true]: keep even global idx →
    // p0_a0(0), p0_a1(2), p0_a2(4).
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a1', 'p0_a2']);
  });

  it('restart and continuous produce DIFFERENT survivors on a 2-path fixture', () => {
    const anchors = twoPathInterleaved(4);
    const restart = runSelectionChain(anchors, [{ type: 'everyN', n: 2, offset: 0 }]);
    const continuous = runSelectionChain(anchors, [
      { type: 'everyN', n: 2, offset: 0, continuous: true },
    ]);
    expect(ids(restart.survivors)).not.toEqual(ids(continuous.survivors));
  });
});

// ========================================================================
// Bypass
// ========================================================================
describe('runSelectionChain — bypass', () => {
  it('a bypassed block is a no-op', () => {
    const anchors = edgeRow(6);
    const out = runSelectionChain(anchors, [
      { type: 'everyN', n: 2, offset: 0, bypass: true },
    ]);
    expect(ids(out.survivors)).toEqual(ids(anchors));
  });

  it('bypass on one block in a chain skips only that block', () => {
    const anchors = edgeRow(8);
    const out = runSelectionChain(anchors, [
      { type: 'everyN', n: 2, offset: 0, continuous: true, bypass: true }, // no-op
      { type: 'skip', mask: [false, true], continuous: true }, // drops odd
    ]);
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a2', 'p0_a4', 'p0_a6']);
  });
});

// ========================================================================
// Sequence passthrough (PIN)
// ========================================================================
describe('runSelectionChain — sequence passthrough', () => {
  it('returns the sequence block untouched and it does not affect survivors', () => {
    const anchors = edgeRow(4);
    const seqBlock = { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'flower' }] };
    const out = runSelectionChain(anchors, [
      { type: 'everyN', n: 2, offset: 0 },
      seqBlock,
    ]);
    expect(out.sequence).toBe(seqBlock); // same reference, untouched
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a2']);
  });

  it('no sequence block ⇒ sequence is null', () => {
    const anchors = edgeRow(4);
    const out = runSelectionChain(anchors, [{ type: 'everyN', n: 2 }]);
    expect(out.sequence).toBeNull();
  });

  it('two sequence blocks ⇒ the FIRST is returned', () => {
    const anchors = edgeRow(4);
    const first = { type: 'sequence', id: 'first' };
    const second = { type: 'sequence', id: 'second' };
    const out = runSelectionChain(anchors, [first, second]);
    expect(out.sequence).toBe(first);
  });

  it('selection filters positioned AFTER a sequence still run (order-lenient)', () => {
    const anchors = edgeRow(6);
    const seqBlock = { type: 'sequence' };
    const out = runSelectionChain(anchors, [
      seqBlock,
      { type: 'everyN', n: 2, offset: 0 },
    ]);
    expect(out.sequence).toBe(seqBlock);
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a2', 'p0_a4']);
  });
});

// ========================================================================
// Overrides (fixed post-chain step)
// ========================================================================
describe('runSelectionChain — overrides', () => {
  it('include adds back a filtered-out anchor (by id)', () => {
    const anchors = edgeRow(6);
    const out = runSelectionChain(
      anchors,
      [{ type: 'everyN', n: 2, offset: 0 }],
      { overrides: { include: ['p0_a1'] } },
    );
    // a1 was dropped by everyN; include restores it, in input order.
    expect(ids(out.survivors)).toEqual(['p0_a0', 'p0_a1', 'p0_a2', 'p0_a4']);
  });

  it('exclude wins over include on conflict', () => {
    const anchors = edgeRow(4);
    const out = runSelectionChain(anchors, [], {
      overrides: { include: ['p0_a1'], exclude: ['p0_a1'] },
    });
    expect(ids(out.survivors)).not.toContain('p0_a1');
  });

  it('unresolved include ref becomes an orphan', () => {
    const anchors = edgeRow(4);
    const ref = 'does-not-exist';
    const out = runSelectionChain(anchors, [], { overrides: { include: [ref] } });
    expect(out.orphans).toEqual([ref]);
  });

  it('spatial rebind resolves a coordinate ref within tolerance', () => {
    const anchors = edgeRow(4); // ids at x = 0,10,20,30
    const out = runSelectionChain(
      anchors,
      [{ type: 'route', roles: ['none'] }], // drops everything
      { overrides: { include: [{ x: 11, y: 0 }], tolerance: 5 } },
    );
    // nearest anchor to (11,0) is p0_a1 at (10,0), within tolerance 5.
    expect(ids(out.survivors)).toEqual(['p0_a1']);
    expect(out.orphans).toEqual([]);
  });

  it('spatial ref beyond tolerance orphans', () => {
    const anchors = edgeRow(4);
    const ref = { x: 100, y: 100 };
    const out = runSelectionChain(anchors, [], { overrides: { include: [ref], tolerance: 5 } });
    expect(out.orphans).toEqual([ref]);
  });
});

// ========================================================================
// Determinism
// ========================================================================
describe('runSelectionChain — determinism', () => {
  it('same inputs + seed ⇒ identical survivors across two runs', () => {
    const anchors = twoPathInterleaved(10);
    const chain = [
      { type: 'route', roles: ['edge'] },
      { type: 'everyN', n: 2, offset: 0 },
      { type: 'skip', mask: [false, false, true] },
      { type: 'density', density: 0.7, seed: 42, rngMode: 'hash' },
    ];
    const a = runSelectionChain(anchors, chain, { canvasW: 100, canvasH: 100 });
    const b = runSelectionChain(anchors, chain, { canvasW: 100, canvasH: 100 });
    expect(ids(a.survivors)).toEqual(ids(b.survivors));
  });
});

// ========================================================================
// Density sequential parity with selectAnchors (the A3 safety net, proven early)
// ========================================================================
describe('runSelectionChain — density sequential parity with selectAnchors', () => {
  it('bare density chain equals selectAnchors for the same (density, seed)', () => {
    const anchors = edgeRow(40);
    const density = 0.5;
    const seed = 2026;
    const legacy = selectAnchors(anchors, { density, seed });
    const chained = runSelectionChain(anchors, [
      { type: 'density', density, seed, rngMode: 'sequential' },
    ]);
    expect(ids(chained.survivors)).toEqual(ids(legacy.survivors));
  });

  it('parity holds across several (density, seed) combos', () => {
    const anchors = edgeRow(50);
    for (const density of [0.2, 0.35, 0.5, 0.8, 0.95]) {
      for (const seed of [1, 7, 99, 12345]) {
        const legacy = selectAnchors(anchors, { density, seed });
        const chained = runSelectionChain(anchors, [
          { type: 'density', density, seed, rngMode: 'sequential' },
        ]);
        expect(ids(chained.survivors)).toEqual(ids(legacy.survivors));
      }
    }
  });

  // The A3 composition safety net proven early: the FULL continuous pipeline
  // (route→everyN{continuous}→skip{continuous}→density{sequential}→field) is
  // byte-identical to selectAnchors on a MULTI-PATH host. This is what A3's
  // legacy compile must reproduce — and it ONLY holds when the cycling blocks
  // carry `continuous:true` (selectAnchors rate/skip are continuous; the chain
  // default is per-path restart, which would feed density a different survivor
  // set on >1 path and diverge the mulberry32 stream).
  it('full continuous pipeline is byte-identical to selectAnchors on a 2-path host', () => {
    const anchors = twoPathInterleaved(10); // 20 edge anchors across 2 paths
    const field = { sampleNorm: (u) => u };
    const roles = ['edge'];
    const rate = { n: 2, offset: 0 };
    const skipMask = [false, false, true];
    const density = 0.7;
    const seed = 4242;
    const legacy = selectAnchors(
      anchors,
      {
        roles,
        rate,
        skip: skipMask,
        density,
        seed,
        field,
        fieldThreshold: 0.3,
        fieldInvert: false,
      },
      { canvasW: 100, canvasH: 100 },
    );
    const chained = runSelectionChain(
      anchors,
      [
        { type: 'route', roles, pathScope: 'all' },
        { type: 'everyN', n: rate.n, offset: rate.offset, continuous: true },
        { type: 'skip', mask: skipMask, continuous: true },
        { type: 'density', density, seed, rngMode: 'sequential' },
        { type: 'field', field, threshold: 0.3, invert: false },
      ],
      { canvasW: 100, canvasH: 100 },
    );
    expect(ids(chained.survivors)).toEqual(ids(legacy.survivors));
    // Sanity: the pipeline actually removed some anchors (not a vacuous pass).
    expect(chained.survivors.length).toBeGreaterThan(0);
    expect(chained.survivors.length).toBeLessThan(anchors.length);
  });
});

// ========================================================================
// Input not mutated
// ========================================================================
describe('runSelectionChain — no input mutation', () => {
  it('does not mutate the input anchors array or the chain', () => {
    const anchors = twoPathInterleaved(5);
    const snapshotAnchors = anchors.slice();
    const snapshotIds = ids(anchors);
    const chain = [
      { type: 'everyN', n: 2, offset: 0 },
      { type: 'sequence', slots: [] },
    ];
    const chainSnapshot = JSON.parse(JSON.stringify(chain));
    runSelectionChain(anchors, chain, { overrides: { include: ['p0_a1'] } });
    expect(anchors).toEqual(snapshotAnchors);
    expect(ids(anchors)).toEqual(snapshotIds);
    expect(chain).toEqual(chainSnapshot);
  });
});

// ========================================================================
// onStage trace hook (opt-in; drives sieveCounts.js) — behavior byte-
// identical when absent, per-filter (blockIndex, type, inCount, outCount,
// bypassed) callback in ORIGINAL chain order when present, never fired for
// the terminal sequence block.
// ========================================================================
describe('runSelectionChain — onStage trace hook', () => {
  it('fires once per filter block in original chain order with in/out counts', () => {
    const anchors = edgeRow(12); // a0..a11
    const chain = [
      { type: 'route', roles: ['edge'] }, // 12 -> 12
      { type: 'everyN', n: 3, offset: 0 }, // 12 -> 4 (a0,a3,a6,a9)
    ];
    const seen = [];
    runSelectionChain(anchors, chain, { onStage: (e) => seen.push(e) });
    expect(seen.map((e) => [e.blockIndex, e.type, e.inCount, e.outCount, e.bypassed])).toEqual([
      [0, 'route', 12, 12, false],
      [1, 'everyN', 12, 4, false],
    ]);
  });

  it('preserves ORIGINAL block index across a partitioned sequence block', () => {
    const anchors = edgeRow(6);
    const chain = [
      { type: 'sequence', slots: [{ glyphRef: 'x' }] }, // index 0 — partitioned out, NOT traced
      { type: 'route', roles: ['edge'] }, // index 1
      { type: 'everyN', n: 2, offset: 0 }, // index 2
    ];
    const seen = [];
    runSelectionChain(anchors, chain, { onStage: (e) => seen.push(e) });
    expect(seen.map((e) => [e.blockIndex, e.type])).toEqual([
      [1, 'route'],
      [2, 'everyN'],
    ]);
  });

  it('reports a bypassed filter as pass-through (inCount === outCount, bypassed:true)', () => {
    const anchors = edgeRow(6);
    const chain = [{ type: 'everyN', n: 3, offset: 0, bypass: true }];
    const seen = [];
    const { survivors } = runSelectionChain(anchors, chain, { onStage: (e) => seen.push(e) });
    expect(survivors).toHaveLength(6); // bypass ⇒ no narrowing
    expect(seen).toEqual([{ blockIndex: 0, block: chain[0], type: 'everyN', inCount: 6, outCount: 6, bypassed: true }]);
  });

  it('is byte-identical to a run WITHOUT the hook (result unchanged)', () => {
    const anchors = twoPathInterleaved(5);
    const chain = [
      { type: 'route', roles: ['edge'] },
      { type: 'everyN', n: 2, offset: 0 },
      { type: 'sequence', slots: [{ glyphRef: 'x' }] },
    ];
    const withHook = runSelectionChain(anchors, chain, { onStage: () => {} });
    const without = runSelectionChain(anchors, chain);
    expect(ids(withHook.survivors)).toEqual(ids(without.survivors));
    expect(withHook.sequence).toBe(without.sequence);
    expect(withHook.orphans).toEqual(without.orphans);
  });
});
