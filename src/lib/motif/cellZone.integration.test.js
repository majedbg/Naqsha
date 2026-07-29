// The Cell Zone, END TO END (#150, PRD #143 — the ADR 0008 amendment).
//
// THE DEFECT THIS FILE GUARDS. `partitionZones` put `cell` anchors in no Zone and
// the zoned Sequencer rests every anchor it finds in no Zone, so selecting a
// zoned mode on a cell-only host rendered ZERO glyphs — no error, no explanation.
// On `main` before this slice, the real Vine chip on a real Circle Packing
// accepted **0** placements while the flat Alternate x‑o chip on the SAME anchors
// accepted 80.
//
// TWO STACKED DEFECTS, not one. The Sequencer half is only the second. The first
// is upstream: the Vine chip forced `['crossing','edge','tip']` on every semantic
// host, so on a cell-only host the Route yielded zero survivors before the
// Sequencer ever ran. Both are fixed here; a test that exercised only the
// partitioner would go green over an empty canvas.
//
// THE HARNESS MATTERS. `placeMotifs()` is the LEGACY `{selection, placement}`
// composer and NEVER runs `binding.chain` — handed a chain-form binding it places
// every anchor and reports a false pass. Everything below goes through
// `resolveSelection` + `resolvePlacements`, the same two stages MotifPattern.js
// uses, and counts `placements.length` — ACCEPTED placements. `placementStats` is
// initialised to the pre-rejection candidate count and is never read here.

import { describe, it, expect } from 'vitest';
import CirclePacking from '../patterns/CirclePacking.js';
import Grid from '../patterns/Grid.js';
import VoronoiCells from '../patterns/VoronoiCells.js';
import ModuleGrid from '../patterns/ModuleGrid.js';
import Truchet from '../patterns/extras/Truchet.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { resolveSelection } from './compileSelectionToChain.js';
import { resolvePlacements } from './placementEngine.js';
import { getGlyph } from './glyphs.js';
import { isSequenceBlock, sequenceSlots } from './sequencer.js';
import { partitionZones } from './zones.js';
import { dealSlots } from './sequencer.js';
import { STARTER_CHIPS } from './starterChips.js';

const W = 800;
const H = 600;
const OPTS = { canvasW: W, canvasH: H, boundary: { type: 'rect', width: W, height: H } };

/** Run a real pattern and return the anchors a motif on it would actually see. */
function hostAnchors(PatternClass, patternType, params, seed = 7) {
  const inst = new PatternClass();
  inst.generate(new RecordingContext({ seed: 1 }), seed, params, W, H, '#000000', 100);
  return getSemanticAnchors(patternType, params, W, H, inst.motifHostGeometry);
}

// #207 — the chips now write `sizing.footprint: 'tight'`, so the packer reads
// each glyph's MEASURED footprint and throws without one. This mirrors the
// render seam's resolution (`useCanvas` → `MotifPattern`): a BASE glyph plus a
// map over every ref a Sequencer slot might stamp, read through `sequenceSlots`
// so a Vine's ZONED slots (which live under `zones[].slots`, with no flat
// `slots`) are not silently dropped — the whole subject of this file.
function glyphSources(binding) {
  const glyphMap = {};
  for (const block of binding.chain || []) {
    if (!isSequenceBlock(block)) continue;
    for (const slot of sequenceSlots(block)) {
      if (!slot || slot.glyphRef == null) continue;
      const g = getGlyph(slot.glyphRef);
      if (g) glyphMap[slot.glyphRef] = g;
    }
  }
  return { glyph: getGlyph('leaf'), glyphMap };
}

/** The two real stages MotifPattern runs. Returns ACCEPTED placements. */
function place(binding, anchors) {
  const { survivors, sequence, overrideRecords } = resolveSelection(binding, anchors, OPTS);
  const placementConfig = { ...(binding.placement || {}) };
  if (sequence) placementConfig.sequence = sequence;
  const { placements } = resolvePlacements(survivors, placementConfig, {
    ...OPTS,
    overrideRecords,
    ...glyphSources(binding),
  });
  return { survivors, placements };
}

const chipBinding = (chipId, patternType) =>
  STARTER_CHIPS.find((c) => c.id === chipId).build(patternType).binding;

// Real, cell-capable hosts. Each entry is [label, anchors] with anchors built by
// RUNNING the pattern — the point of this file is that the real hosts work, and
// the additive claim is asserted per host rather than once on Grid (Grid's cell
// anchors happen to be contiguous at the END of its anchor list and Truchet's at
// the START, so a single-host regression proves nothing general).
const CELL_HOSTS = () => [
  [
    'circlepacking',
    hostAnchors(CirclePacking, 'circlepacking', { attempts: 600, minRadius: 8, maxRadius: 50 }),
  ],
  ['grid', hostAnchors(Grid, 'grid', { rows: 4, columns: 4 })],
  ['voronoi', hostAnchors(VoronoiCells, 'voronoi', { points: 24 })],
  ['modulegrid', hostAnchors(ModuleGrid, 'modulegrid', { cols: 5, rows: 4 })],
  ['truchet', hostAnchors(Truchet, 'truchet', { tiles: 6, tileSet: 'arcs' })],
];

// ─────────────────────────────────────────────────────────────────────────────
describe('Criterion 1 — a zoned Sequencer on a CELL-ONLY anchor set deals Slots', () => {
  it('deals every cell anchor on a real Circle Packing instead of resting it', () => {
    const anchors = hostAnchors(CirclePacking, 'circlepacking', {
      attempts: 600,
      minRadius: 8,
      maxRadius: 50,
    });
    expect(anchors.length).toBeGreaterThan(0);
    expect(new Set(anchors.map((a) => a.role))).toEqual(new Set(['cell']));

    const assigns = dealSlots(anchors, {
      type: 'sequence',
      seed: 1,
      zones: [{ zone: 'cell', mode: 'cycle', slots: [{ glyphRef: 'rosette' }] }],
    });
    expect(assigns).toHaveLength(anchors.length);
    expect(assigns.filter((a) => a.rest)).toHaveLength(0);
  });
});

describe('Criterion 2 — the real Vine chip on a real Circle Packing places glyphs', () => {
  const anchors = () =>
    hostAnchors(CirclePacking, 'circlepacking', { attempts: 600, minRadius: 8, maxRadius: 50 });

  it('routes the roles the host actually emits, so the Route keeps survivors', () => {
    const binding = chipBinding('vine', 'circlepacking');
    const route = binding.chain.find((b) => b.type === 'route');
    expect(route.roles).toEqual(['cell']);
    const { survivors } = place(binding, anchors());
    expect(survivors.length).toBeGreaterThan(0);
  });

  it('accepts placements — the canvas is no longer empty', () => {
    const { placements } = place(chipBinding('vine', 'circlepacking'), anchors());
    expect(placements.length).toBeGreaterThan(0);
    // Every accepted placement carries a real glyph, not a Rest.
    expect(placements.every((p) => p.glyphRef != null)).toBe(true);
  });

  it('is in the same league as the flat chip on the same anchors (not one stray glyph)', () => {
    const a = anchors();
    const flat = place(chipBinding('alternate-xo', 'circlepacking'), a).placements.length;
    const vine = place(chipBinding('vine', 'circlepacking'), a).placements.length;
    expect(flat).toBeGreaterThan(0);
    expect(vine).toBeGreaterThanOrEqual(flat);
  });

  it('places glyphs on Module Grid too — the other cell-only host', () => {
    const { placements } = place(
      chipBinding('vine', 'modulegrid'),
      hostAnchors(ModuleGrid, 'modulegrid', { cols: 5, rows: 4 }),
    );
    expect(placements.length).toBeGreaterThan(0);
  });
});

describe('Criterion 3 — a MIXED host partitions cells to Cell and edges to Apex/Stem as before', () => {
  // Truchet (#153) is the first shipped host emitting BOTH cells and edges, so it
  // is the real subject rather than a hand-built fixture.
  const anchors = () => hostAnchors(Truchet, 'truchet', { tiles: 6, tileSet: 'arcs' });

  it('sends every tile centre to Cell and every arc sample to Apex or Stem', () => {
    const a = anchors();
    const { apex, stem, cell } = partitionZones(a);
    const cells = a.filter((x) => x.role === 'cell');
    const edges = a.filter((x) => x.role === 'edge');
    expect(cells.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);
    expect(cell.map((x) => x.id)).toEqual(cells.map((x) => x.id));
    // Every edge sample is accounted for by Apex ∪ Stem, and no cell leaked in.
    expect(apex.length + stem.length).toBe(edges.length);
    expect([...apex, ...stem].some((x) => x.role === 'cell')).toBe(false);
    expect(apex.length).toBeGreaterThan(0);
    expect(stem.length).toBeGreaterThan(0);
  });

  it('the real Vine on Truchet deals all three Zones — nothing rests', () => {
    // The DEAL is the Zone claim; what the greedy packer then accepts is a
    // separate question (see the placement assertion below). Every survivor gets a
    // Slot: tiles the Cell rosette, arc ends the Apex rosette, arc interiors the
    // Stem leaves.
    const binding = chipBinding('vine', 'truchet');
    const { survivors, sequence } = resolveSelection(binding, anchors(), OPTS);
    const assigns = dealSlots(survivors, sequence);
    expect(assigns.some((a) => a.rest)).toBe(false);
    const glyphsAt = (role) =>
      new Set(assigns.filter((_, i) => survivors[i].role === role).map((a) => a.glyphRef));
    expect(glyphsAt('cell')).toEqual(new Set(['rosette'])); // the Cell Zone
    expect(glyphsAt('edge')).toEqual(new Set(['rosette', 'leaf'])); // Apex ∪ Stem
  });

  it('the real Vine on Truchet fills tiles AND runs the arcs in one layer', () => {
    const { placements } = place(chipBinding('vine', 'truchet'), anchors());
    expect(new Set(placements.map((p) => p.role))).toEqual(new Set(['cell', 'edge']));
    expect(placements.filter((p) => p.role === 'cell').length).toBeGreaterThan(0);
    expect(placements.filter((p) => p.role === 'edge').length).toBeGreaterThan(0);
  });
});

describe('Criterion 4 — an UNZONED Sequencer is unchanged', () => {
  it('the flat chip still deals one run to every survivor, cells included', () => {
    const a = hostAnchors(CirclePacking, 'circlepacking', {
      attempts: 600,
      minRadius: 8,
      maxRadius: 50,
    });
    const binding = chipBinding('alternate-xo', 'circlepacking');
    expect(binding.chain.find((b) => b.type === 'sequence').zones).toBeUndefined();
    const { survivors, placements } = place(binding, a);
    expect(survivors).toHaveLength(a.length);
    expect(placements.length).toBeGreaterThan(0);
  });

  it('a flat deal over a cell+edge anchor set never consults the partition', () => {
    const a = hostAnchors(Truchet, 'truchet', { tiles: 6, tileSet: 'arcs' });
    const assigns = dealSlots(a, {
      type: 'sequence',
      mode: 'cycle',
      seed: 1,
      slots: [{ glyphRef: 'A' }, { glyphRef: 'B' }],
    });
    expect(assigns).toHaveLength(a.length);
    expect(assigns.some((x) => x.rest)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Criterion 8 — the addition is ADDITIVE, asserted PER cell-capable host', () => {
  // Two things had to hold and both are checked on REAL host geometry for every
  // host that emits cells, because the argument for each is host-shaped:
  //   1. bucketing cells does not move an Apex or a Stem member (`partitionZones`
  //      derives termini per path, and a cell sharing a path key with edge
  //      samples could in principle suppress that derivation), and
  //   2. a stored two-Zone chain still rests every cell — the partition is not
  //      the deal.
  const TWO_ZONE = {
    type: 'sequence',
    seed: 1,
    zones: [
      { zone: 'apex', mode: 'cycle', continuous: true, ends: 'both', slots: [{ glyphRef: 'F' }] },
      { zone: 'stem', mode: 'cycle', slots: [{ glyphRef: 'L' }] },
    ],
  };

  for (const [label, anchors] of CELL_HOSTS()) {
    it(`${label}: apex/stem are identical with and without the cells`, () => {
      expect(anchors.some((a) => a.role === 'cell')).toBe(true);
      const full = partitionZones(anchors);
      const cellFree = partitionZones(anchors.filter((a) => a.role !== 'cell'));
      expect(full.apex.map((a) => a.id)).toEqual(cellFree.apex.map((a) => a.id));
      expect(full.stem.map((a) => a.id)).toEqual(cellFree.stem.map((a) => a.id));
    });

    it(`${label}: a stored two-Zone chain rests every cell and deals the rest unchanged`, () => {
      const assigns = dealSlots(anchors, TWO_ZONE);
      const cellAssigns = assigns.filter((_, i) => anchors[i].role === 'cell');
      expect(cellAssigns.length).toBeGreaterThan(0);
      expect(cellAssigns.every((a) => a.rest)).toBe(true);
      // The NON-cell assignments are byte-identical to the cell-free deal — this
      // is the claim that would break if cells shifted the per-Zone cycle index.
      const cellFree = anchors.filter((a) => a.role !== 'cell');
      expect(assigns.filter((_, i) => anchors[i].role !== 'cell')).toEqual(
        dealSlots(cellFree, TWO_ZONE),
      );
    });
  }
});
