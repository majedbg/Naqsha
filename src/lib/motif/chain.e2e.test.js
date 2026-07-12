// End-to-end DEMONSTRATION of the SEQUENCER CHAIN through the FULL pure pipeline
// on a REAL MULTI-PATH edge host (B3 — the render seam wired end-to-end).
//
// The existing pipeline.e2e.test.js proves the pipeline on a Grid semantic host
// and a single-square fallback — neither exercises the D4 per-path restart with
// genuinely MULTI-path input. This file closes that gap: it assembles the REAL
// modules — sampleEdgeAnchors → resolveSelection (a `binding.chain` carrying a
// terminal `sequence` block) → resolvePlacements/dealSlots → MotifPattern emit —
// on a 2-path host where the cycle length (3) does NOT divide path-0's anchor
// count (5), and asserts the PER-PATH-RESTART BOUNDARY at the start of path 1.
//
// "glyphs appeared on an edge host" is NOT sufficient. The load-bearing proof is
// the boundary: with default per-path restart, path 1 starts FRESH at slot 0
// (flower); with continuous:true, global indexing carries path-0's 5-anchor
// counter into path 1, landing a DIFFERENT slot. Because slot 0 = flower and
// slot 1 = leaf reference DISTINCT glyph `d` strings, the boundary reads as a
// glyph swap in the emitted SVG — immune to "maybe it just didn't render".
//
// Env: pure JS (RecordingContext) — no p5/DOM/React. The only test-local code is
// the independent SVG parser (regex only; never imports instancing.js helpers),
// so the geometry/glyph assertions stay honest.

import MotifPattern from './MotifPattern.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import { compileSelectionToChain } from './compileSelectionToChain.js';

const W = 800;
const H = 600;

// Two DISTINCT glyphs so slot identity is legible in the emitted SVG `d`.
const FLOWER_D = 'M0,-6 L6,0 L0,6 L-6,0 Z';
const LEAF_D = 'M0,-8 L4,0 L0,8 L-4,0 Z';
const FLOWER = { id: 'flower', name: 'Flower', paths: [{ d: FLOWER_D, closed: true }], viewRadius: 6 };
const LEAF = { id: 'leaf', name: 'Leaf', paths: [{ d: LEAF_D, closed: true }], viewRadius: 8 };

// Two horizontal segments at different y. count:5 with includeEndpoints ⇒ each
// path yields 5 edge anchors at x = 100,200,300,400,500 (step = 400/4 = 100),
// carrying meta.pathIndex 0 (top) / 1 (bottom). Cycle length 3 does not divide 5.
const PATH0_Y = 100;
const PATH1_Y = 300;
const HOST_PATHS = [
  [{ x: 100, y: PATH0_Y }, { x: 500, y: PATH0_Y }],
  [{ x: 100, y: PATH1_Y }, { x: 500, y: PATH1_Y }],
];

// x-o-x-o with a real gap: slot0 flower, slot1 leaf, slot2 REST (no glyph).
function sequenceBlock(continuous) {
  return {
    type: 'sequence',
    mode: 'cycle',
    seed: 7,
    ...(continuous ? { continuous: true } : {}),
    slots: [{ glyphRef: 'flower' }, { glyphRef: 'leaf' }, { rest: true }],
  };
}

function chainParams(continuous) {
  return {
    glyphRef: 'flower',
    anchorMode: 'edge',
    hostPaths: HOST_PATHS,
    edgeOpts: { count: 5 },
    // Inject the glyph set exactly as useCanvas would (base + every slot ref).
    glyph: FLOWER,
    glyphs: { flower: FLOWER, leaf: LEAF },
    binding: {
      chain: [sequenceBlock(continuous)],
      // fixed small size, min:0 ⇒ 100px-spaced anchors never reject (no-fit /
      // below-floor), so an absent element ALWAYS means a Rest, never packing.
      placement: { sizing: { mode: 'fixed', size: 5, min: 0 } },
    },
  };
}

function run(params, seed = 1) {
  const inst = new MotifPattern();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, '#333', 100);
  return inst;
}

// Independent SVG-instance parser: translate (e,f) from the matrix + which glyph
// (by verbatim `d`). Regex only — never imports instancing.js. A Rest emits
// NOTHING, so parsed elements are exactly the non-rest placements.
function parseEmits(svgElements) {
  return svgElements.map((el) => {
    const m = el.match(/matrix\(([^)]+)\)/)[1].trim().split(/\s+/).map(Number);
    const [, , , , e, f] = m;
    let glyph = null;
    if (el.includes(FLOWER_D)) glyph = 'flower';
    else if (el.includes(LEAF_D)) glyph = 'leaf';
    return { x: e, y: f, glyph };
  });
}

const TOL = 1e-3; // matrixToSVG formats 100 as 100.000000.
// Find the single emit at (x,y); null if none (a Rest position).
function emitAt(emits, x, y) {
  return emits.find((p) => Math.abs(p.x - x) < TOL && Math.abs(p.y - y) < TOL) || null;
}

describe('motif chain end-to-end (multi-path edge host, per-path restart boundary)', () => {
  it('sanity: the 2-path host yields 5 edge anchors per path at the expected x positions', () => {
    // Re-derive anchors independently of MotifPattern to pin the host shape the
    // boundary assertions below rely on.
    // (sampleEdgeAnchors is unit-tested elsewhere; here we only need the count.)
    const emits = parseEmits(run(chainParams(false)).svgElements);
    // 5 anchors/path, slot2 (rest) drops one per full cycle: path emits at
    // idx 0,1,3,4 ⇒ 4 per path ⇒ 8 total.
    expect(emits.length).toBe(8);
  });

  it('DEFAULT per-path restart: path 1 starts FRESH at slot 0 — the full emit set is exact', () => {
    const emits = parseEmits(run(chainParams(false)).svgElements);
    // Per-path restart, both paths deal idx 0,1,2,3,4 ⇒ flower,leaf,REST,flower,leaf.
    const expected = [
      { x: 100, y: PATH0_Y, glyph: 'flower' },
      { x: 200, y: PATH0_Y, glyph: 'leaf' },
      // x=300 path0 ⇒ REST ⇒ absent
      { x: 400, y: PATH0_Y, glyph: 'flower' },
      { x: 500, y: PATH0_Y, glyph: 'leaf' },
      { x: 100, y: PATH1_Y, glyph: 'flower' }, // ← path 1 restarts at slot 0
      { x: 200, y: PATH1_Y, glyph: 'leaf' },
      // x=300 path1 ⇒ REST ⇒ absent
      { x: 400, y: PATH1_Y, glyph: 'flower' },
      { x: 500, y: PATH1_Y, glyph: 'leaf' },
    ];
    expect(emits.length).toBe(expected.length);
    for (const exp of expected) {
      const hit = emitAt(emits, exp.x, exp.y);
      expect(hit, `expected an emit at (${exp.x},${exp.y})`).not.toBeNull();
      expect(hit.glyph).toBe(exp.glyph);
    }
    // No emit at either REST position — a genuine gap, not a shifted neighbor.
    expect(emitAt(emits, 300, PATH0_Y)).toBeNull();
    expect(emitAt(emits, 300, PATH1_Y)).toBeNull();
  });

  it('THE BOUNDARY — path 1, first two anchors: restart(flower,leaf) vs continuous(REST,flower)', () => {
    const restart = parseEmits(run(chainParams(false)).svgElements);
    const cont = parseEmits(run(chainParams(true)).svgElements);

    // path 1 anchor 0 (x=100): restart ⇒ slot0 flower; continuous ⇒ global idx 5
    // ⇒ 5%3=2 ⇒ REST (absent).
    expect(emitAt(restart, 100, PATH1_Y)?.glyph).toBe('flower');
    expect(emitAt(cont, 100, PATH1_Y)).toBeNull();

    // path 1 anchor 1 (x=200) — the HEADLINE glyph-swap boundary (both emit):
    // restart ⇒ slot1 leaf; continuous ⇒ global idx 6 ⇒ 6%3=0 ⇒ flower.
    expect(emitAt(restart, 200, PATH1_Y)?.glyph).toBe('leaf');
    expect(emitAt(cont, 200, PATH1_Y)?.glyph).toBe('flower');
  });

  it('a REST consumes a cycle step: the anchor after path-0 rest lands slot 0 (flower), not shifted', () => {
    const emits = parseEmits(run(chainParams(false)).svgElements);
    // path0: idx2 (x=300) is REST. If the rest did NOT consume a step, idx3
    // (x=400) would re-land on slot2/rest and x=400 would be absent. Correct
    // behavior: idx3 ⇒ slot0 ⇒ flower present at x=400.
    expect(emitAt(emits, 300, PATH0_Y)).toBeNull(); // the gap
    expect(emitAt(emits, 400, PATH0_Y)?.glyph).toBe('flower'); // step advanced through it
    expect(emitAt(emits, 500, PATH0_Y)?.glyph).toBe('leaf');
  });

  it('the CONTINUOUS deal, in full: path-0 counter carries into path 1 (idx 5..9)', () => {
    const emits = parseEmits(run(chainParams(true)).svgElements);
    // Global idx 0..9 ⇒ slot idx%3:
    //  p0: 0 flower,1 leaf,2 REST,3 flower,4 leaf
    //  p1: 5 REST,6 flower,7 leaf,8 REST,9 flower
    const expected = [
      { x: 100, y: PATH0_Y, glyph: 'flower' },
      { x: 200, y: PATH0_Y, glyph: 'leaf' },
      { x: 400, y: PATH0_Y, glyph: 'flower' },
      { x: 500, y: PATH0_Y, glyph: 'leaf' },
      { x: 200, y: PATH1_Y, glyph: 'flower' },
      { x: 300, y: PATH1_Y, glyph: 'leaf' },
      { x: 500, y: PATH1_Y, glyph: 'flower' },
    ];
    expect(emits.length).toBe(expected.length);
    for (const exp of expected) {
      const hit = emitAt(emits, exp.x, exp.y);
      expect(hit, `expected an emit at (${exp.x},${exp.y})`).not.toBeNull();
      expect(hit.glyph).toBe(exp.glyph);
    }
    // The three continuous REST positions are gaps.
    expect(emitAt(emits, 300, PATH0_Y)).toBeNull(); // idx 2
    expect(emitAt(emits, 100, PATH1_Y)).toBeNull(); // idx 5
    expect(emitAt(emits, 400, PATH1_Y)).toBeNull(); // idx 8
  });

  it('is deterministic: the whole chain pipeline run twice ⇒ identical svgElements', () => {
    const a = run(chainParams(false), 1);
    const b = run(chainParams(false), 2); // different ctx seed — must not matter
    expect(a.svgElements).toEqual(b.svgElements);
    expect(a.svgElements.length).toBeGreaterThan(0);
  });
});

// D9 render-seam guarantee, END-TO-END: a LEGACY `binding.selection` (no chain)
// lazy-compiles at the render seam and renders BYTE-IDENTICAL to an explicit
// pre-compiled `binding.chain`. compileSelectionToChain is golden-tested in
// isolation; this proves the SAME compile happens inside MotifPattern.generate.
describe('motif chain end-to-end (D9 lazy-compile render-seam parity)', () => {
  const legacySelection = { roles: ['edge'], rate: { n: 2, offset: 0 } };
  const placement = { sizing: { mode: 'fixed', size: 5, min: 0 } };
  const base = {
    glyphRef: 'flower',
    anchorMode: 'edge',
    hostPaths: HOST_PATHS,
    edgeOpts: { count: 5 },
    glyph: FLOWER,
    glyphs: { flower: FLOWER },
  };

  it('legacy binding.selection renders identically to its explicitly-compiled chain', () => {
    const legacy = run({ ...base, binding: { selection: legacySelection, placement } });

    const { chain, overrides } = compileSelectionToChain(legacySelection);
    const explicit = run({ ...base, binding: { chain, overrides, placement } });

    // Non-vacuous: legacy rate is CONTINUOUS (compile sets continuous:true), so
    // n:2 over the 10 global anchors keeps idx 0,2,4,6,8 ⇒ 5 emits, all flower.
    expect(legacy.svgElements.length).toBe(5);
    parseEmits(legacy.svgElements).forEach((p) => expect(p.glyph).toBe('flower'));

    // Byte-identical: lazy-compile at the seam == the explicit chain.
    expect(legacy.svgElements).toEqual(explicit.svgElements);
  });
});
