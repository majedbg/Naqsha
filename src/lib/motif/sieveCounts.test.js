import { describe, it, expect } from 'vitest';
import { sieveCounts } from './sieveCounts.js';
import { runSelectionChain } from './chain.js';
import { resolvePlacements } from './placementEngine.js';

// --- helpers -------------------------------------------------------------
const mk = (role, i, id, meta = {}) => ({
  id,
  role,
  x: i * 30,
  y: 0,
  tangent: 0,
  normal: 0,
  s: 0,
  meta: { pathIndex: 0, sampleIndex: i, closed: false, ...meta },
});

// 12 anchors, roles mixed: 8 edge + 4 crossing (every 3rd is a crossing).
function mixed12() {
  const out = [];
  let ei = 0;
  let ci = 0;
  for (let i = 0; i < 12; i++) {
    if (i % 3 === 2) out.push(mk('crossing', i, `c${ci++}`));
    else out.push(mk('edge', i, `e${ei++}`));
  }
  return out;
}

const edgeRow = (n) => Array.from({ length: n }, (_, i) => mk('edge', i, `a${i}`));

describe('sieveCounts — per-stage anchor counts', () => {
  it('mirrors the engine at each stage: route (12→8), everyN n=3 (8→3)', () => {
    const anchors = mixed12();
    const chain = [
      { type: 'route', roles: ['edge'] },
      { type: 'everyN', n: 3, offset: 0 },
    ];
    const { stages, selected, placed } = sieveCounts(chain, anchors);
    expect(stages).toEqual([
      { blockIndex: 0, type: 'route', inCount: 12, outCount: 8, bypassed: false },
      { blockIndex: 1, type: 'everyN', inCount: 8, outCount: 3, bypassed: false },
    ]);
    expect(selected).toBe(3);
    // No sequence ⇒ every survivor places one glyph ⇒ placed === selected.
    expect(placed).toBe(3);
  });

  it('density stage count matches the engine (0.5, seed 1, sequential): 3→1', () => {
    const anchors = mixed12();
    const chain = [
      { type: 'route', roles: ['edge'] },
      { type: 'everyN', n: 3, offset: 0 },
      { type: 'density', density: 0.5, seed: 1, rngMode: 'sequential' },
    ];
    const { stages, selected } = sieveCounts(chain, anchors);
    // Pinned oracle: obtained ONCE from runSelectionChain, not hand-derived.
    expect(stages.map((s) => s.outCount)).toEqual([8, 3, 1]);
    expect(selected).toBe(1);
  });

  it('density outCount equals a pinned engine oracle on edgeRow(20) (0.5, seed 7, sequential): 11', () => {
    const anchors = edgeRow(20);
    const chain = [{ type: 'density', density: 0.5, seed: 7, rngMode: 'sequential' }];
    const { stages } = sieveCounts(chain, anchors);
    expect(stages[0].outCount).toBe(11); // pinned literal from the engine
  });
});

describe('sieveCounts — sequence / placed count', () => {
  it('rests REDUCE placed: sequence [glyph, rest] over 3 survivors ⇒ placed 2', () => {
    const anchors = mixed12();
    const chain = [
      { type: 'route', roles: ['edge'] },
      { type: 'everyN', n: 3, offset: 0 },
      { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'diamond' }, { rest: true }] },
    ];
    const { stages, selected, placed } = sieveCounts(chain, anchors);
    expect(selected).toBe(3); // sequence does not narrow the SELECTION
    expect(placed).toBe(2); // one of three beats is a rest
    // The terminal sequence block is surfaced as a trailing stage (selected→placed).
    expect(stages[stages.length - 1]).toEqual({
      blockIndex: 2,
      type: 'sequence',
      inCount: 3,
      outCount: 2,
      bypassed: false,
    });
  });

  it("placed EQUALS resolvePlacements' output length when there are no geometric rejections", () => {
    const anchors = mixed12();
    const seq = { type: 'sequence', mode: 'cycle', slots: [{ glyphRef: 'diamond' }, { rest: true }] };
    const chain = [{ type: 'route', roles: ['edge'] }, { type: 'everyN', n: 3, offset: 0 }, seq];
    const { placed } = sieveCounts(chain, anchors);
    // Oracle: resolvePlacements on the same survivors, well-spaced tiny footprints
    // so NOTHING is rejected for geometry — every rejection must be a rest, which
    // is the ONLY way placed (rest-accounting) can equal the engine's output.
    const { survivors, sequence } = runSelectionChain(anchors, chain);
    const { placements, rejected } = resolvePlacements(
      survivors,
      { sequence, sizing: { mode: 'fixed', size: 1, min: 0, margin: 1 } },
      {},
    );
    expect(rejected.every((r) => r.reason === 'rest')).toBe(true);
    expect(placed).toBe(placements.length);
  });

  it('degenerate sequence (empty slots) ⇒ placed === selected (engine single-glyph fallback)', () => {
    const anchors = edgeRow(5);
    const chain = [{ type: 'route', roles: ['edge'] }, { type: 'sequence', mode: 'cycle', slots: [] }];
    const { selected, placed } = sieveCounts(chain, anchors);
    expect(selected).toBe(5);
    expect(placed).toBe(5);
  });
});

describe('sieveCounts — bypass & edge cases', () => {
  it('a bypassed filter is a pass-through (inCount === outCount, bypassed:true)', () => {
    const anchors = edgeRow(6);
    const chain = [{ type: 'everyN', n: 3, offset: 0, bypass: true }];
    const { stages, selected } = sieveCounts(chain, anchors);
    expect(stages).toEqual([
      { blockIndex: 0, type: 'everyN', inCount: 6, outCount: 6, bypassed: true },
    ]);
    expect(selected).toBe(6);
  });

  it('empty chain ⇒ no stages, selected === placed === anchors.length', () => {
    const anchors = edgeRow(7);
    const { stages, selected, placed } = sieveCounts([], anchors);
    expect(stages).toEqual([]);
    expect(selected).toBe(7);
    expect(placed).toBe(7);
  });

  it('null/undefined-safe', () => {
    expect(sieveCounts(null, null)).toEqual({ stages: [], selected: 0, placed: 0 });
    expect(sieveCounts(undefined, undefined)).toEqual({ stages: [], selected: 0, placed: 0 });
  });

  it('threads opts through to the engine (canvasW/canvasH for a field block)', () => {
    // mk scales x by i*30 ⇒ anchor x-coords are 0, 90, 180.
    const anchors = [mk('edge', 0, 'a0'), mk('edge', 3, 'a1'), mk('edge', 6, 'a2')];
    const field = { sampleNorm: (u) => u }; // sample == normalized x
    const chain = [{ type: 'field', field, threshold: 0.4, invert: false }];
    const withDims = sieveCounts(chain, anchors, { canvasW: 300, canvasH: 300 });
    // x/300 => 0, 0.3, 0.6; >=0.4 keeps only a2
    expect(withDims.stages[0].outCount).toBe(1);
    // No dims ⇒ field is a no-op (engine contract) ⇒ all pass.
    const noDims = sieveCounts(chain, anchors);
    expect(noDims.stages[0].outCount).toBe(3);
  });
});
