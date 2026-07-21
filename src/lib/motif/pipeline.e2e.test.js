// End-to-end DEMONSTRATION of the pure motif-adorn pipeline.
//
// This is the "it actually works" artifact: it assembles the REAL modules —
// semanticAnchors → placementEngine → glyphs → instancing → MotifPattern — into
// the full pure pipeline on a REAL host (a Grid), and asserts sane, verifiable
// output. NOTHING here is mocked; the only test-local code is the independent
// matrix parser + affine reconstruction (so the assertions can't be vacuous by
// reusing the implementation's own helpers).
//
// Env: pure JS (RecordingContext) — no p5/DOM/React.

import MotifPattern from './MotifPattern.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import { getSemanticAnchors } from './semanticAnchors.js';
import { placeMotifs } from './placementEngine.js';
import { getGlyph } from './glyphs.js';

const W = 800;
const H = 600;
// Verbatim copy of the built-in leaf `d` (glyphs.js) — the render oracle for the
// path emission assertions below. Updated for the base-at-origin leaf (2026-07).
const LEAF_D = 'M0,0 L6,-6 L14,-5 L20,-0.5 L18,3 L11,4.5 L4,3 Z';

// --- Real Grid host params (centered 4×4 lattice, 60px pitch, 20px margin). ---
const gridParams = { cols: 4, rows: 4, spacing: 60, margin: 20 };

// A binding that selects CROSSING anchors, stamps the LEAF glyph, sizes
// proportionally against the (canvas) boundary, thins with a rate, flips odd
// instances. size:50 with a 60px pitch forces real empty-circle shrinking, so
// the no-overlap guarantee is exercised at a genuine touching pair — not a
// scene with so much slack the check can never bite.
const binding = {
  selection: { roles: ['crossing'], rate: { n: 2, offset: 0 } },
  placement: {
    flip: true,
    sizing: { mode: 'proportional', size: 50, min: 0, margin: 1.0 },
  },
};

function gridMotifParams() {
  return {
    glyphRef: 'leaf',
    anchorMode: 'semantic',
    hostPatternType: 'grid',
    hostParams: gridParams,
    binding,
    // NOTE: no hostPaths — a real Grid host has none; semantic mode must not
    // no-op on that (the load-bearing guard relaxation).
  };
}

// --- Independent SVG-instance parser. Regex only; NEVER imports instancing.js's
//     applyMatrix, so the geometry assertions stay honest. ---
function parseInstances(svgElements) {
  return svgElements.map((el) => {
    const m = el.match(/matrix\(([^)]+)\)/);
    const matrix = m[1].trim().split(/\s+/).map(Number);
    const [a, b, c, d, e, f] = matrix;
    return { matrix, a, b, c, d, e, f, el };
  });
}

function run(params, seed = 1) {
  const inst = new MotifPattern();
  const ctx = new RecordingContext({ seed });
  inst.generateWithContext(ctx, seed, params, W, H, '#333', 100);
  return { inst, ctx };
}

describe('motif pipeline end-to-end (Grid host, semantic crossings)', () => {
  it('getSemanticAnchors yields grid crossing anchors for the host params', () => {
    const anchors = getSemanticAnchors('grid', gridParams, W, H);
    expect(Array.isArray(anchors)).toBe(true);
    const crossings = anchors.filter((a) => a.role === 'crossing');
    // 4×4 grid ⇒ (cols+1)×(rows+1) = 5×5 = 25 crossings.
    expect(crossings.length).toBe(25);
    // Every crossing sits inside the canvas (world coords, base copy).
    crossings.forEach((a) => {
      expect(a.x).toBeGreaterThan(0);
      expect(a.x).toBeLessThan(W);
      expect(a.y).toBeGreaterThan(0);
      expect(a.y).toBeLessThan(H);
    });
  });

  it('composes the full pipeline: one <g matrix leaf> per placement, count matches an independent placeMotifs run', () => {
    // Independent expected count: re-derive anchors + placements outside MotifPattern.
    const anchors = getSemanticAnchors('grid', gridParams, W, H);
    const boundary = { type: 'rect', width: W, height: H };
    const { placements } = placeMotifs(anchors, binding, {
      boundary,
      canvasW: W,
      canvasH: H,
    });
    // roles:['crossing'] (25) → rate n:2 keeps even indices → 13 survivors,
    // zero rejections (min center gap 84.85px > any footprint).
    expect(placements.length).toBe(13);

    const { inst } = run(gridMotifParams());
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(inst.svgElements.length).toBe(placements.length);

    // Each element is a single <g transform="matrix(...)"> wrapping the VERBATIM
    // leaf path.
    inst.svgElements.forEach((el) => {
      expect(el).toMatch(/^<g transform="matrix\([^)]+\)">/);
      expect(el).toContain(`<path d="${LEAF_D}"`);
    });
  });

  it('END-TO-END no-overlap: reconstructed world footprints are pairwise disjoint (Wong guarantee survives the pipeline)', () => {
    const { inst } = run(gridMotifParams());
    const glyph = getGlyph('leaf');
    const insts = parseInstances(inst.svgElements);
    expect(insts.length).toBe(13);

    // world radius = |matrix scale| * viewRadius.  |scale| = sqrt(a²+b²) is
    // rotation- AND flip-invariant, so the 90° crossing normal + flip:true do
    // not disturb this. center = translate (e,f).
    const footprints = insts.map(({ a, b, e, f }) => ({
      x: e,
      y: f,
      r: Math.hypot(a, b) * glyph.viewRadius,
    }));

    // At least one genuinely shrunk footprint (proves proportional sizing +
    // empty-circle actually engaged, i.e. the check can bite).
    const naturalR = binding.placement.sizing.size; // 50 (viewRadius cancels)
    expect(footprints.some((fp) => fp.r < naturalR - 1)).toBe(true);

    // Pairwise: centers must be at least r_i + r_j apart (touching allowed).
    const TOL = 1e-3; // absorbs 6-decimal matrix formatting on the radius.
    for (let i = 0; i < footprints.length; i++) {
      for (let k = i + 1; k < footprints.length; k++) {
        const d = Math.hypot(footprints[i].x - footprints[k].x, footprints[i].y - footprints[k].y);
        expect(d + TOL).toBeGreaterThanOrEqual(footprints[i].r + footprints[k].r);
      }
    }
  });

  it('placements sit ON real grid crossings: every instance translate matches a getSemanticAnchors crossing', () => {
    const { inst } = run(gridMotifParams());
    const insts = parseInstances(inst.svgElements);
    const crossings = getSemanticAnchors('grid', gridParams, W, H).filter((a) => a.role === 'crossing');

    const TOL = 1e-6; // no jitter ⇒ translate == anchor position exactly.
    insts.forEach(({ e, f }) => {
      const hit = crossings.some((cr) => Math.hypot(cr.x - e, cr.y - f) <= TOL);
      expect(hit).toBe(true);
    });
  });

  it('is deterministic: the whole pipeline run twice ⇒ identical svgElements', () => {
    const a = run(gridMotifParams(), 1).inst;
    const b = run(gridMotifParams(), 2).inst; // different ctx seed — must not matter
    expect(a.svgElements).toEqual(b.svgElements);
    expect(a.svgElements.length).toBeGreaterThan(0);
  });
});

describe('motif pipeline end-to-end (graceful fallback for extractor-less host)', () => {
  // A closed square host polygon, well inside the canvas.
  const SQUARE = [
    { points: [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 400 }, { x: 200, y: 400 }], closed: true },
  ];

  const fallbackParams = {
    glyphRef: 'leaf',
    anchorMode: 'semantic',
    hostPatternType: 'voronoi', // extractor returns null → fall back to edges
    hostParams: {},
    hostPaths: SQUARE,
    edgeOpts: { count: 8 },
    binding: {
      selection: { roles: ['edge'] },
      placement: { sizing: { mode: 'proportional', size: 12, min: 0, margin: 0.9 } },
    },
  };

  it('voronoi host (null extractor) + hostPaths ⇒ falls back to edge anchors and still places motifs', () => {
    // Prove the extractor really returns null for this host.
    expect(getSemanticAnchors('voronoi', {}, W, H)).toBeNull();

    const { inst } = run(fallbackParams);
    expect(inst.svgElements.length).toBeGreaterThan(0);
    inst.svgElements.forEach((el) => {
      expect(el).toMatch(/^<g transform="matrix\([^)]+\)">/);
      expect(el).toContain(`<path d="${LEAF_D}"`);
    });
  });

  it('semantic mode with null extractor and NO hostPaths ⇒ clean no-op', () => {
    const { inst, ctx } = run({ ...fallbackParams, hostPaths: [] });
    expect(inst.svgElements).toEqual([]);
    expect(ctx.calls.filter((c) => c.op === 'vertex').length).toBe(0);
  });
});
