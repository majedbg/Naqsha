import { describe, it, expect } from 'vitest';
import { partitionZones, applyEnds, zonesForRoles, ZONE_IDS } from './zones.js';
import { sampleEdgeAnchors } from './anchors.js';

// --- helpers -------------------------------------------------------------
// Minimal Anchor factory. partitionZones reads `role`, `s`, and
// `meta.pathIndex` / `meta.closed`; applyEnds additionally reads `x`,`y`.
function mkA(id, { role = 'edge', s = 0, x = 0, y = 0, pathIndex = 0, closed = false } = {}) {
  return { id, role, x, y, tangent: 0, normal: 0, s, meta: { pathIndex, closed } };
}

// ------------------------------------------------------------------------
describe('partitionZones — semantic host (tip → Apex, crossing → Stem, cell → Cell)', () => {
  it('routes tip to Apex, crossing to Stem, edge to Stem, cell to Cell', () => {
    // A semantic open path: two tips (the ends), an interior crossing junction,
    // interior edge samples, and a cell. Because a tip exists, the edge-terminus
    // derivation is skipped — edges stay Stem.
    //
    // #150 (ADR 0008 amendment): the cell used to be dropped by BOTH Zones, which
    // meant the zoned deal rested it. It is now a third partition, **Cell**.
    const anchors = [
      mkA('tip:0:a', { role: 'tip', s: 0 }),
      mkA('edge:0:0', { role: 'edge', s: 0.25 }),
      mkA('cross:0:0', { role: 'crossing', s: 0.5 }),
      mkA('edge:0:1', { role: 'edge', s: 0.75 }),
      mkA('cell:0:0', { role: 'cell', s: 0.6 }),
      mkA('tip:0:b', { role: 'tip', s: 1 }),
    ];
    const { apex, stem, cell } = partitionZones(anchors);
    expect(apex.map((a) => a.id)).toEqual(['tip:0:a', 'tip:0:b']);
    expect(stem.map((a) => a.id)).toEqual(['edge:0:0', 'cross:0:0', 'edge:0:1']);
    expect(cell.map((a) => a.id)).toEqual(['cell:0:0']);
  });

  it('a CELL-ONLY anchor set fills the Cell Zone and leaves Apex and Stem empty', () => {
    // The shape of a cell-only host (Circle Packing, Module Grid): before #150
    // this partitioned to nothing at all and the zoned Sequencer rested every
    // anchor — a zoned mode rendered an empty canvas.
    const anchors = [
      mkA('cell:0', { role: 'cell', x: 10, y: 10 }),
      mkA('cell:1', { role: 'cell', x: 40, y: 10 }),
      mkA('cell:2', { role: 'cell', x: 70, y: 10 }),
    ];
    const { apex, stem, cell } = partitionZones(anchors);
    expect(apex).toEqual([]);
    expect(stem).toEqual([]);
    expect(cell.map((a) => a.id)).toEqual(['cell:0', 'cell:1', 'cell:2']);
  });

  it('Cell takes the `cell` role and NOTHING else — unknown roles still fall to Stem', () => {
    // Stem stays the lenient catch-all. A Cell Zone that absorbed unrecognised
    // anchors would make the partition unpredictable on every future host.
    const { apex, stem, cell } = partitionZones([
      mkA('mystery:0', { role: 'wormhole' }),
      mkA('cell:0', { role: 'cell' }),
    ]);
    expect(apex).toEqual([]);
    expect(stem.map((a) => a.id)).toEqual(['mystery:0']);
    expect(cell.map((a) => a.id)).toEqual(['cell:0']);
  });

  it('preserves input order within Cell, like the other two Zones', () => {
    const { cell } = partitionZones([
      mkA('cell:c', { role: 'cell' }),
      mkA('edge:0', { role: 'edge' }),
      mkA('cell:a', { role: 'cell' }),
      mkA('cell:b', { role: 'cell' }),
    ]);
    expect(cell.map((a) => a.id)).toEqual(['cell:c', 'cell:a', 'cell:b']);
  });

  it('an empty input yields three empty Zones rather than throwing', () => {
    expect(partitionZones([])).toEqual({ apex: [], stem: [], cell: [] });
    expect(partitionZones(null)).toEqual({ apex: [], stem: [], cell: [] });
  });
});

// ── #150: cells must not disturb the OTHER two Zones ──────────────────────────
// The additive claim, stated as the thing that could actually break it: a cell in
// the input must not change which anchors land in Apex or Stem. `partitionZones`
// derives termini per path from `meta.pathIndex`, and a cell sharing a path key
// with edge samples could in principle suppress that derivation. This is the
// discriminator; the same assertion runs against REAL host geometry per cell-
// capable host in cellZone.integration.test.js.
describe('partitionZones — adding cells never moves an Apex or a Stem member', () => {
  it('apex/stem are identical with and without the cells, even sharing a path key', () => {
    // Cell anchors carry no `meta.pathIndex` on any shipped cell host, so their
    // pathKey is 0 — the SAME key as the first captured path. Interleave them.
    const withCells = [
      mkA('cell:a', { role: 'cell', pathIndex: 0 }),
      mkA('edge:0:0', { role: 'edge', s: 0.0, pathIndex: 0 }),
      mkA('cell:b', { role: 'cell', pathIndex: 0 }),
      mkA('edge:0:1', { role: 'edge', s: 0.5, pathIndex: 0 }),
      mkA('edge:0:2', { role: 'edge', s: 1.0, pathIndex: 0 }),
      mkA('cell:c', { role: 'cell', pathIndex: 0 }),
    ];
    const full = partitionZones(withCells);
    const cellFree = partitionZones(withCells.filter((a) => a.role !== 'cell'));
    expect(full.apex.map((a) => a.id)).toEqual(cellFree.apex.map((a) => a.id));
    expect(full.stem.map((a) => a.id)).toEqual(cellFree.stem.map((a) => a.id));
    // …and the guard is not vacuous: there really were termini to derive.
    expect(full.apex.map((a) => a.id)).toEqual(['edge:0:0', 'edge:0:2']);
  });
});

// ── #150: which Zones a host can actually feed ────────────────────────────────
// The role→Zone reading rule lives HERE, beside the partitioner that implements
// it, so the rack can ask one function instead of growing its own conditional.
describe('zonesForRoles — the Zones a host emitting these roles can fill', () => {
  it('a cell-only host feeds Cell alone', () => {
    expect(zonesForRoles(['cell'])).toEqual(['cell']);
  });

  it('an edge-captured host feeds Apex and Stem, never Cell', () => {
    expect(zonesForRoles(['edge'])).toEqual(['apex', 'stem']);
  });

  it('a mixed cell+edge host (Truchet) feeds all three', () => {
    expect(zonesForRoles(['edge', 'cell'])).toEqual(['apex', 'stem', 'cell']);
  });

  it('a four-role host (Grid) feeds all three, in canonical order', () => {
    expect(zonesForRoles(['crossing', 'edge', 'tip', 'cell'])).toEqual(['apex', 'stem', 'cell']);
  });

  it('tips alone feed Apex; crossings alone feed Stem', () => {
    expect(zonesForRoles(['tip'])).toEqual(['apex']);
    expect(zonesForRoles(['crossing'])).toEqual(['stem']);
  });

  it('an unknown role feeds Stem, mirroring the partitioner catch-all', () => {
    expect(zonesForRoles(['wormhole'])).toEqual(['stem']);
  });

  it('no roles feed no Zones, and a non-array is not a throw', () => {
    expect(zonesForRoles([])).toEqual([]);
    expect(zonesForRoles(undefined)).toEqual([]);
  });

  it('ZONE_IDS is the canonical order and holds exactly the three partitions', () => {
    expect([...ZONE_IDS]).toEqual(['apex', 'stem', 'cell']);
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

  it('the single-anchor terminus rule is scoped to EDGE — a lone cell is a Cell, a lone crossing stays Stem', () => {
    // The rule derives ends only from edge samples; it must not promote a cell to
    // Apex (a region has no ends — #150 keeps applyEnds Apex-only) nor a crossing.
    const cell = partitionZones([mkA('cell:0:solo', { role: 'cell', s: 0.4 })]);
    expect(cell.apex).toEqual([]);
    expect(cell.stem).toEqual([]);
    expect(cell.cell.map((a) => a.id)).toEqual(['cell:0:solo']);
    const crossing = partitionZones([mkA('cross:0:solo', { role: 'crossing', s: 0.4 })]);
    expect(crossing.apex).toEqual([]);
    expect(crossing.stem.map((a) => a.id)).toEqual(['cross:0:solo']);
    expect(crossing.cell).toEqual([]);
  });
});

// #144 — Apex and Stem must partition anchors on an OPEN captured curve, which
// is the only path shape the three new record-mode hosts produce (Radial Etch
// rays, one Hilbert run, one Lissajous run; all terminate endShape() bare, so
// capture reports them open). Geometry is built LITERALLY here — the anchors are
// arc-length samples off a plain open polyline, exactly the shape
// sampleEdgeAnchors yields from a captured hostPath — so this stays a statement
// about Zones, not about how any pattern happens to paint today.
describe('partitionZones — an OPEN captured curve flowers at its ends (#144)', () => {
  // A plain open polyline (an L, so it is unambiguously not a loop).
  const openPath = [
    { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }], closed: false },
  ];

  it('splits arc-length samples on one open path into 2 Apex + the rest Stem', () => {
    const anchors = sampleEdgeAnchors(openPath, { count: 7 });
    expect(anchors.length).toBe(7);
    expect(anchors.every((a) => a.role === 'edge')).toBe(true);

    const { apex, stem } = partitionZones(anchors);
    // Every anchor is in exactly one Zone — the zoned Sequencer rests anything
    // in neither, so a leak here renders as missing glyphs.
    expect(apex.length + stem.length).toBe(anchors.length);
    expect(apex.length).toBe(2);
    expect(stem.length).toBe(5);

    // The Apex members are the traversal ends (smallest and largest s).
    const byS = [...anchors].sort((a, b) => a.s - b.s);
    expect(apex.map((a) => a.id).sort()).toEqual([byS[0].id, byS[byS.length - 1].id].sort());
    // …and they sit at the polyline's physical endpoints.
    const ends = apex.map((a) => `${Math.round(a.x)},${Math.round(a.y)}`).sort();
    expect(ends).toEqual(['0,0', '100,80'].sort());
  });

  it('partitions per path — two open paths give 2 Apex each, never one for the field', () => {
    const twoPaths = [
      openPath[0],
      { points: [{ x: 0, y: 200 }, { x: 60, y: 200 }, { x: 60, y: 260 }], closed: false },
    ];
    const anchors = sampleEdgeAnchors(twoPaths, { count: 5 });
    const { apex, stem } = partitionZones(anchors);
    expect(apex.length + stem.length).toBe(anchors.length);
    expect(apex.length).toBe(4); // 2 per path
    expect(new Set(apex.map((a) => a.meta.pathIndex))).toEqual(new Set([0, 1]));
  });

  it('a 2-point open segment (one Radial Etch ray) is all Apex and no Stem', () => {
    const anchors = sampleEdgeAnchors(
      [{ points: [{ x: 10, y: 10 }, { x: 90, y: 90 }], closed: false }],
      { count: 2 }
    );
    const { apex, stem } = partitionZones(anchors);
    expect(apex.length).toBe(2);
    expect(stem.length).toBe(0);
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
