import { describe, it, expect } from 'vitest';
import { partitionZones, applyEnds } from './zones.js';

// --- helpers -------------------------------------------------------------
// Minimal Anchor factory. partitionZones reads `role`, `s`, and
// `meta.pathIndex` / `meta.closed`; applyEnds additionally reads `x`,`y`.
function mkA(id, { role = 'edge', s = 0, x = 0, y = 0, pathIndex = 0, closed = false } = {}) {
  return { id, role, x, y, tangent: 0, normal: 0, s, meta: { pathIndex, closed } };
}

// ------------------------------------------------------------------------
describe('partitionZones — semantic host (tip → Apex, crossing → Stem, cell excluded)', () => {
  it('routes tip to Apex, crossing to Stem, edge to Stem, cell to neither', () => {
    // A semantic open path: two tips (the ends), an interior crossing junction,
    // interior edge samples, and a cell (off the plant). Because a tip exists,
    // the edge-terminus derivation is skipped — edges stay Stem.
    const anchors = [
      mkA('tip:0:a', { role: 'tip', s: 0 }),
      mkA('edge:0:0', { role: 'edge', s: 0.25 }),
      mkA('cross:0:0', { role: 'crossing', s: 0.5 }),
      mkA('edge:0:1', { role: 'edge', s: 0.75 }),
      mkA('cell:0:0', { role: 'cell', s: 0.6 }),
      mkA('tip:0:b', { role: 'tip', s: 1 }),
    ];
    const { apex, stem } = partitionZones(anchors);
    expect(apex.map((a) => a.id)).toEqual(['tip:0:a', 'tip:0:b']);
    expect(stem.map((a) => a.id)).toEqual(['edge:0:0', 'cross:0:0', 'edge:0:1']);
  });
});

describe('partitionZones — captured host (no tips ⇒ derive termini from min/max s)', () => {
  it('makes the min-s and max-s edge samples of an open, tip-less path the Apex', () => {
    // Edge-captured hosts emit only uniform `edge` samples. Input order is
    // deliberately shuffled to prove derivation is by `s`, not array position.
    const anchors = [
      mkA('edge:0:mid', { role: 'edge', s: 0.66 }),
      mkA('edge:0:last', { role: 'edge', s: 1.0 }),
      mkA('edge:0:first', { role: 'edge', s: 0.0 }),
      mkA('edge:0:early', { role: 'edge', s: 0.33 }),
    ];
    const { apex, stem } = partitionZones(anchors);
    // min-s (0.0) and max-s (1.0) → Apex, preserving INPUT order (last before first).
    expect(apex.map((a) => a.id)).toEqual(['edge:0:last', 'edge:0:first']);
    expect(stem.map((a) => a.id)).toEqual(['edge:0:mid', 'edge:0:early']);
  });

  it('a closed loop contributes NO Apex — Stem covers it whole (termini rule skipped)', () => {
    const anchors = [
      mkA('edge:0:0', { role: 'edge', s: 0.0, closed: true }),
      mkA('edge:0:1', { role: 'edge', s: 0.5, closed: true }),
      mkA('edge:0:2', { role: 'edge', s: 0.9, closed: true }),
    ];
    const { apex, stem } = partitionZones(anchors);
    expect(apex).toEqual([]);
    expect(stem.map((a) => a.id)).toEqual(['edge:0:0', 'edge:0:1', 'edge:0:2']);
  });

  it('a single edge sample on an open, tip-less path is itself a terminus → Apex', () => {
    const { apex, stem } = partitionZones([mkA('edge:0:solo', { role: 'edge', s: 0.4 })]);
    expect(apex.map((a) => a.id)).toEqual(['edge:0:solo']);
    expect(stem).toEqual([]);
  });

  it('the single-anchor terminus rule is scoped to EDGE — a lone cell stays off, a lone crossing stays Stem', () => {
    // The rule derives ends only from edge samples; it must not pull a cell onto
    // the plant nor promote a crossing to Apex.
    const cell = partitionZones([mkA('cell:0:solo', { role: 'cell', s: 0.4 })]);
    expect(cell.apex).toEqual([]);
    expect(cell.stem).toEqual([]);
    const crossing = partitionZones([mkA('cross:0:solo', { role: 'crossing', s: 0.4 })]);
    expect(crossing.apex).toEqual([]);
    expect(crossing.stem.map((a) => a.id)).toEqual(['cross:0:solo']);
  });
});

describe('applyEnds — spatial end-selector (y-then-x, never drawing order)', () => {
  it("'both' / undefined is identity (keeps every Apex member)", () => {
    const apex = [
      mkA('tip:0:a', { role: 'tip', x: 5, y: 0 }),
      mkA('tip:0:b', { role: 'tip', x: 5, y: 10 }),
    ];
    expect(applyEnds(apex, 'both').map((a) => a.id)).toEqual(['tip:0:a', 'tip:0:b']);
    expect(applyEnds(apex, undefined).map((a) => a.id)).toEqual(['tip:0:a', 'tip:0:b']);
  });

  it("'up' keeps the smallest (y,x) per path; a y-tie is broken by smaller x", () => {
    // path 0: two tips at the SAME y=0 → x breaks the tie (x=2 < x=8).
    // path 1: two tips at different y → smaller y=3 wins regardless of x.
    const apex = [
      mkA('tip:0:hi-x', { role: 'tip', x: 8, y: 0, pathIndex: 0 }),
      mkA('tip:0:lo-x', { role: 'tip', x: 2, y: 0, pathIndex: 0 }),
      mkA('tip:1:low', { role: 'tip', x: 9, y: 7, pathIndex: 1 }),
      mkA('tip:1:high', { role: 'tip', x: 1, y: 3, pathIndex: 1 }),
    ];
    // up = smallest (y,x): path0 → tip:0:lo-x, path1 → tip:1:high (y=3<7).
    expect(applyEnds(apex, 'up').map((a) => a.id)).toEqual(['tip:0:lo-x', 'tip:1:high']);
  });

  it("'down' keeps the largest (y,x) per path; a y-tie is broken by larger x", () => {
    const apex = [
      mkA('tip:0:hi-x', { role: 'tip', x: 8, y: 0, pathIndex: 0 }),
      mkA('tip:0:lo-x', { role: 'tip', x: 2, y: 0, pathIndex: 0 }),
      mkA('tip:1:low', { role: 'tip', x: 9, y: 7, pathIndex: 1 }),
      mkA('tip:1:high', { role: 'tip', x: 1, y: 3, pathIndex: 1 }),
    ];
    // down = largest (y,x): path0 → tip:0:hi-x (x=8), path1 → tip:1:low (y=7).
    expect(applyEnds(apex, 'down').map((a) => a.id)).toEqual(['tip:0:hi-x', 'tip:1:low']);
  });

  it('up/down both keep a path that has a single Apex member', () => {
    const apex = [mkA('tip:0:solo', { role: 'tip', x: 4, y: 4, pathIndex: 0 })];
    expect(applyEnds(apex, 'up').map((a) => a.id)).toEqual(['tip:0:solo']);
    expect(applyEnds(apex, 'down').map((a) => a.id)).toEqual(['tip:0:solo']);
  });
});
