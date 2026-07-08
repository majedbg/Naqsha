// Adversarial dual-emit PARITY suite for MotifPattern.
//
// The whole point of this slice: a SINGLE per-instance matrix must feed BOTH
// the canvas draw calls AND the resolved SVG `svgElements`, so the two can never
// diverge. These tests reconstruct the canvas polylines from the recorded ctx
// calls, INDEPENDENTLY parse the `matrix(...)` + verbatim `<path d>` out of the
// SVG side, apply the matrix with a TEST-LOCAL affine (NOT instancing.js's
// applyMatrix — reusing the impl helper would make the parity test vacuous),
// and assert the two agree point-for-point.
//
// Env: pure JS (RecordingContext) — no jsdom.

import { vi } from 'vitest';
import MotifPattern from './MotifPattern.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import { placeMotifs } from './placementEngine.js';
import * as glyphs from './glyphs.js';
import { getGlyph } from './glyphs.js';
import { parsePathD } from '../plotter/pathOps.js';

const W = 800;
const H = 600;

// A deliberately DIAGONAL host path so the default 'path' orientation yields a
// non-axis-aligned rotation (normal = tangent + 90°, tangent = 45°). This makes
// the matrix genuinely rotational, catching any canvas-vs-SVG angle handling
// (radians/degrees, wrong sign) divergence and any "forgot to rotate" bug.
const DIAGONAL_HOST = [{ points: [{ x: 100, y: 100 }, { x: 300, y: 300 }], closed: false }];

function baseParams(overrides = {}) {
  return {
    glyphRef: 'leaf',
    hostPaths: DIAGONAL_HOST,
    binding: {},
    anchorMode: 'edge',
    edgeOpts: { count: 2 },
    ...overrides,
  };
}

// Independent placement count — MUST replicate the boundary MotifPattern builds.
function expectedPlacements(params) {
  const boundary = { type: 'rect', width: W, height: H };
  return placeMotifs(params.hostPaths ? sampleAnchorsLike(params) : [], params.binding || {}, {
    boundary,
    canvasW: W,
    canvasH: H,
  }).placements;
}

// Mirror MotifPattern's anchor step so the expected-count helper stays honest.
// (Imported lazily to avoid coupling the parity assertions to it.)
import { sampleEdgeAnchors } from './anchors.js';
function sampleAnchorsLike(params) {
  if ((params.anchorMode ?? 'edge') !== 'edge') return [];
  return sampleEdgeAnchors(params.hostPaths, params.edgeOpts || {});
}

// --- TEST-LOCAL affine apply. Intentionally NOT imported from instancing.js. ---
// SVG matrix [a,b,c,d,e,f] maps (x,y) -> (a*x + c*y + e, b*x + d*y + f).
const localApply = (x, y, [a, b, c, d, e, f]) => [a * x + c * y + e, b * x + d * y + f];

// Reconstruct one polyline per beginShape/endShape span from recorded vertices.
function canvasPolylines(calls) {
  const polys = [];
  let cur = null;
  for (const { op, args } of calls) {
    if (op === 'beginShape') cur = [];
    else if (op === 'vertex' && cur) cur.push([args[0], args[1]]);
    else if (op === 'endShape') {
      if (cur) polys.push(cur);
      cur = null;
    }
  }
  return polys;
}

// Parse each svgElement into { matrix:[6], paths:[parsedD,...] } via regex only.
function svgInstances(svgElements) {
  return svgElements.map((el) => {
    const m = el.match(/matrix\(([^)]+)\)/);
    const matrix = m[1].trim().split(/\s+/).map(Number);
    const paths = [...el.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((pm) => parsePathD(pm[1]));
    return { matrix, paths };
  });
}

// Flatten to per-glyph-path polylines in the SAME order the canvas draws them.
function svgPolylines(svgElements) {
  const polys = [];
  for (const inst of svgInstances(svgElements)) {
    for (const p of inst.paths) {
      polys.push(p.points.map(([x, y]) => localApply(x, y, inst.matrix)));
    }
  }
  return polys;
}

function run(params, ctxSeed = 1, color = '#123456', opacity = 100) {
  const inst = new MotifPattern();
  const ctx = new RecordingContext({ seed: ctxSeed });
  inst.generateWithContext(ctx, 7, params, W, H, color, opacity);
  return { inst, ctx };
}

describe('MotifPattern dual-emit parity', () => {
  it('canvas polylines equal INDEPENDENTLY-transformed SVG glyph points (rotated, two instances)', () => {
    const params = baseParams();
    const glyph = getGlyph('leaf');
    const placements = expectedPlacements(params);

    expect(placements.length).toBe(2); // two-instance scene

    const { inst, ctx } = run(params);

    // Build-time resolution: one svgElement per placement (instance).
    expect(inst.svgElements.length).toBe(placements.length);

    const canvasPolys = canvasPolylines(ctx.calls);
    const svgPolys = svgPolylines(inst.svgElements);

    // --- length guards BEFORE any point comparison (or the test is toothless) ---
    const expectedPolyCount = placements.length * glyph.paths.length;
    expect(expectedPolyCount).toBeGreaterThan(0);
    expect(canvasPolys.length).toBe(expectedPolyCount);
    expect(svgPolys.length).toBe(expectedPolyCount);

    canvasPolys.forEach((cPoly, i) => {
      const sPoly = svgPolys[i];
      expect(cPoly.length).toBe(sPoly.length);
      expect(cPoly.length).toBeGreaterThan(0);
      cPoly.forEach(([cx, cy], k) => {
        expect(cx).toBeCloseTo(sPoly[k][0], 2);
        expect(cy).toBeCloseTo(sPoly[k][1], 2);
      });
    });

    // The rotation actually manifested (non-axis-aligned) — so a future param
    // tweak can't silently make this scenario toothless.
    const { matrix } = svgInstances(inst.svgElements)[0];
    expect(Math.abs(matrix[1])).toBeGreaterThan(1e-6); // b
    expect(Math.abs(matrix[2])).toBeGreaterThan(1e-6); // c
  });

  it('flipped instance is a REAL mirror (negative determinant) and still parity-consistent', () => {
    const flippedParams = baseParams({ binding: { placement: { flip: true } } });
    const plain = expectedPlacements(flippedParams);
    expect(plain.length).toBe(2); // need index 1 to exist so odd-index flips

    const glyph = getGlyph('leaf');
    const { inst, ctx } = run(flippedParams);

    const insts = svgInstances(inst.svgElements);
    const det = (m) => m[0] * m[3] - m[1] * m[2];

    // Instance 0 unflipped (det > 0), instance 1 flipped (det < 0 = mirror).
    expect(det(insts[0].matrix)).toBeGreaterThan(0);
    expect(det(insts[1].matrix)).toBeLessThan(0);

    // Parity still holds for EVERY instance incl. the flipped one.
    const canvasPolys = canvasPolylines(ctx.calls);
    const svgPolys = svgPolylines(inst.svgElements);
    expect(canvasPolys.length).toBe(svgPolys.length);
    expect(canvasPolys.length).toBe(2 * glyph.paths.length);
    canvasPolys.forEach((cPoly, i) => {
      const sPoly = svgPolys[i];
      expect(cPoly.length).toBe(sPoly.length);
      cPoly.forEach(([cx, cy], k) => {
        expect(cx).toBeCloseTo(sPoly[k][0], 2);
        expect(cy).toBeCloseTo(sPoly[k][1], 2);
      });
    });

    // Complement: the flipped instance's geometry actually DIFFERS from the
    // same instance rendered without flip (proves flip changed the shape, not
    // a no-op) — with the asymmetric leaf, a mirror is observable.
    const noFlip = run(baseParams({ binding: { placement: { flip: false } } })).inst;
    const flippedPoly = svgPolylines(inst.svgElements)[1];
    const unflippedPoly = svgPolylines(noFlip.svgElements)[1];
    let maxDelta = 0;
    flippedPoly.forEach(([fx, fy], k) => {
      maxDelta = Math.max(maxDelta, Math.hypot(fx - unflippedPoly[k][0], fy - unflippedPoly[k][1]));
    });
    expect(maxDelta).toBeGreaterThan(1); // genuinely mirrored, not identical
  });

  it('resolves ALL geometry at build time: toSVGGroup emits from stored svgElements without re-running placement', () => {
    const params = baseParams();
    const { inst } = run(params, 1, '#ff0000', 80);

    const before = inst.svgElements.slice();
    expect(before.length).toBe(2);
    const matricesBefore = before.map((el) => el.match(/matrix\(([^)]+)\)/)[1]);

    // Kill the inputs export would need to re-derive placement. If toSVGGroup
    // re-ran the pipeline it would now produce nothing; reading resolved
    // geometry, it is unaffected.
    inst._lastParams = { ...inst._lastParams, hostPaths: [], glyphRef: undefined };

    const svg = inst.toSVGGroup('layer-A', '#ff0000', 80);
    expect(svg).toBeTruthy();
    expect(svg).toContain('layer-A');
    expect(svg).toContain('matrix(');
    // The exact resolved matrices survive.
    matricesBefore.forEach((mstr) => {
      expect(svg).toContain(`matrix(${mstr})`);
    });
  });

  it('is deterministic: same params, DIFFERENT ctx seeds ⇒ identical svgElements', () => {
    const params = baseParams();
    const a = run(params, 1).inst;
    const b = run(params, 2).inst;
    expect(a.svgElements).toEqual(b.svgElements);
    expect(a.svgElements.length).toBeGreaterThan(0);
  });

  it('closed glyph paths are drawn closed on canvas', () => {
    const { ctx } = run(baseParams());
    const endShapes = ctx.calls.filter((c) => c.op === 'endShape');
    expect(endShapes.length).toBeGreaterThan(0);
    // leaf is a closed glyph → every endShape carries the CLOSE flag.
    endShapes.forEach((c) => expect(c.args[0]).toBe(ctx.CLOSE));
  });

  it('CHARACTERIZATION: built-in glyph (no root) emits the exact pre-root svgElements', () => {
    // Absolute value pin (the parity/determinism tests above are all relational
    // and would NOT catch a uniform shift). Built-in glyphs carry no `root`, so
    // WI-2's root pre-transform must default to a no-op ⇒ byte-identical output.
    const { inst } = run(baseParams());
    expect(inst.svgElements).toEqual([
      '<g transform="matrix(-0.693242 0.693242 -0.693242 -0.693242 100 100)"><path d="M0,-10 L7,-4 L8,5 L2,10 L-6,6 L-7,-2 L-2,-8 Z" fill="none"/></g>',
      '<g transform="matrix(-0.693242 0.693242 -0.693242 -0.693242 300 300)"><path d="M0,-10 L7,-4 L8,5 L2,10 L-6,6 L-7,-2 L-2,-8 Z" fill="none"/></g>',
    ]);
  });

  it('WIRING: a glyph carrying a `root` maps the LOCAL ROOT POINT onto the anchor (3rd-arg is load-bearing)', () => {
    // Anchors for baseParams() land the local origin at (100,100) and (300,300)
    // (pinned above). With a rooted glyph, the ROOT POINT — not the origin —
    // must land there. If generate() dropped the 3rd placementMatrix arg, the
    // translation would stay at the anchor and this test would go red.
    const ROOT = { x: 3, y: 4, angle: 0 };
    const spy = vi
      .spyOn(glyphs, 'getGlyph')
      // Build the base glyph from MOTIF_GLYPHS (NOT getGlyph — that's the spy).
      .mockImplementation((id) => ({ ...glyphs.MOTIF_GLYPHS[id], root: ROOT }));
    try {
      const { inst } = run(baseParams());
      const anchors = [
        [100, 100],
        [300, 300],
      ];
      const insts = svgInstances(inst.svgElements);
      expect(insts.length).toBe(2);
      insts.forEach(({ matrix }, i) => {
        // The root point maps onto the anchor…
        const [rx, ry] = localApply(ROOT.x, ROOT.y, matrix);
        expect(rx).toBeCloseTo(anchors[i][0], 6);
        expect(ry).toBeCloseTo(anchors[i][1], 6);
        // …and the raw translation (local-origin landing) has SHIFTED off the
        // anchor, proving the root pre-transform actually applied (not a no-op).
        expect(Math.hypot(matrix[4] - anchors[i][0], matrix[5] - anchors[i][1])).toBeGreaterThan(1);
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('no-op when the glyph is missing', () => {
    const { inst, ctx } = run(baseParams({ glyphRef: 'does-not-exist' }));
    expect(inst.svgElements).toEqual([]);
    expect(ctx.calls.filter((c) => c.op === 'vertex').length).toBe(0);
  });

  it('no-op when there are no host paths', () => {
    const { inst, ctx } = run(baseParams({ hostPaths: [] }));
    expect(inst.svgElements).toEqual([]);
    expect(ctx.calls.filter((c) => c.op === 'vertex').length).toBe(0);
  });

  // WI-3: MotifPattern reads an INJECTED glyph (`params.glyph`) resolved upstream
  // by useCanvas against the document custom-glyph store, staying decoupled from
  // the store itself. It falls back to the built-in getGlyph(glyphRef) only when
  // no glyph is injected.
  describe('injected-glyph resolution (WI-3)', () => {
    // A glyph NOT in MOTIF_GLYPHS — proves the injected object is used, not a
    // built-in lookup. Distinctive `d` so we can assert it reached the SVG.
    const CUSTOM_GLYPH = {
      id: 'cg-custom',
      name: 'Custom',
      paths: [{ d: 'M0,-6 L6,0 L0,6 L-6,0 Z', closed: true }],
      viewRadius: 6,
    };

    it('uses params.glyph when injected (custom id absent from MOTIF_GLYPHS)', () => {
      const { inst } = run(baseParams({ glyphRef: 'cg-custom', glyph: CUSTOM_GLYPH }));
      expect(inst.svgElements.length).toBe(2);
      // The injected glyph's verbatim path d reached every emitted instance.
      expect(inst.svgElements.every((el) => el.includes('M0,-6 L6,0 L0,6 L-6,0 Z'))).toBe(true);
    });

    it('injected glyph WINS over the glyphRef built-in fallback', () => {
      // glyphRef points at a real built-in (leaf) but a custom glyph is injected;
      // the injected object must be what renders.
      const { inst } = run(baseParams({ glyphRef: 'leaf', glyph: CUSTOM_GLYPH }));
      expect(inst.svgElements.every((el) => el.includes('M0,-6 L6,0 L0,6 L-6,0 Z'))).toBe(true);
      expect(inst.svgElements.some((el) => el.includes('M0,-10'))).toBe(false);
    });

    it('falls back to the built-in when no glyph is injected (back-compat)', () => {
      const { inst } = run(baseParams({ glyphRef: 'leaf' }));
      expect(inst.svgElements.length).toBe(2);
      expect(inst.svgElements.every((el) => el.includes('M0,-10'))).toBe(true);
    });

    it('graceful degrade: missing glyph AND none injected → renders nothing (stripped-glyph failure mode)', () => {
      const { inst, ctx } = run(baseParams({ glyphRef: 'cg-missing' }));
      expect(inst.svgElements).toEqual([]);
      expect(ctx.calls.filter((c) => c.op === 'vertex').length).toBe(0);
    });
  });
});

describe('MotifPattern semantic anchor mode', () => {
  it('semantic grid host places motifs from crossing anchors even with NO hostPaths', () => {
    const inst = new MotifPattern();
    const ctx = new RecordingContext({ seed: 1 });
    inst.generateWithContext(
      ctx,
      7,
      {
        glyphRef: 'leaf',
        anchorMode: 'semantic',
        hostPatternType: 'grid',
        hostParams: { cols: 4, rows: 4, spacing: 60, margin: 20 },
        binding: { selection: { roles: ['crossing'] } },
        // no hostPaths — must NOT no-op in semantic mode.
      },
      W,
      H,
      '#123456',
      100
    );
    expect(inst.svgElements.length).toBeGreaterThan(0);
    expect(ctx.calls.filter((c) => c.op === 'vertex').length).toBeGreaterThan(0);
  });

  it('semantic mode with a null-extractor host + hostPaths falls back to EDGE anchors', () => {
    // voronoi's extractor returns null WITHOUT drawnCells (none supplied here);
    // with hostPaths the pattern degrades to generic edge anchors and still
    // produces placements.
    const withPaths = new MotifPattern();
    withPaths.generateWithContext(
      new RecordingContext({ seed: 1 }),
      7,
      {
        glyphRef: 'leaf',
        anchorMode: 'semantic',
        hostPatternType: 'voronoi',
        hostParams: {},
        hostPaths: DIAGONAL_HOST,
        edgeOpts: { count: 2 },
        binding: {},
      },
      W,
      H,
      '#123456',
      100
    );

    // Same host + edgeOpts under explicit edge mode ⇒ identical fallback output.
    const edgeMode = new MotifPattern();
    edgeMode.generateWithContext(
      new RecordingContext({ seed: 1 }),
      7,
      baseParams(),
      W,
      H,
      '#123456',
      100
    );

    expect(withPaths.svgElements.length).toBeGreaterThan(0);
    expect(withPaths.svgElements).toEqual(edgeMode.svgElements);
  });

  it('semantic mode with a null-extractor host and NO hostPaths ⇒ no-op', () => {
    const inst = new MotifPattern();
    const ctx = new RecordingContext({ seed: 1 });
    inst.generateWithContext(
      ctx,
      7,
      {
        glyphRef: 'leaf',
        anchorMode: 'semantic',
        hostPatternType: 'voronoi',
        hostParams: {},
        binding: {},
      },
      W,
      H,
      '#123456',
      100
    );
    expect(inst.svgElements).toEqual([]);
    expect(ctx.calls.filter((c) => c.op === 'vertex').length).toBe(0);
  });
});

describe('MotifPattern voronoi drawn-geometry (GEOMETRY-IN) semantic path', () => {
  // Three hand-authored cells sharing the interior vertex V = (400,300). The
  // Voronoi extractor dedupes it into ONE crossing anchor (junction, cellCount 3);
  // with roles:['crossing'] a glyph must land AT V. V is centered well inside the
  // canvas so the test-before-place accept step keeps it.
  const V = { x: 400, y: 300 };
  const DRAWN_CELLS = [
    { vertices: [V, { x: 150, y: 120 }, { x: 400, y: 80 }], site: { x: 300, y: 170 } },
    { vertices: [V, { x: 650, y: 120 }, { x: 680, y: 300 }], site: { x: 580, y: 240 } },
    { vertices: [V, { x: 400, y: 520 }, { x: 150, y: 480 }], site: { x: 320, y: 430 } },
  ];

  // Parse [a,b,c,d,e,f] out of a `<g transform="matrix(...)">` svgElement; the
  // translation (e,f) is the placement's canvas-px position.
  const translations = (svgElements) =>
    svgElements.map((el) => {
      const nums = el.match(/matrix\(([^)]+)\)/)[1].trim().split(/\s+/).map(Number);
      return { x: nums[4], y: nums[5] };
    });

  function runVoronoi(extraParams) {
    const inst = new MotifPattern();
    const ctx = new RecordingContext({ seed: 1 });
    inst.generateWithContext(
      ctx,
      7,
      {
        glyphRef: 'leaf',
        anchorMode: 'semantic',
        hostPatternType: 'voronoi',
        hostParams: {},
        binding: { selection: { roles: ['crossing'] } },
        ...extraParams,
      },
      W,
      H,
      '#123456',
      100
    );
    return inst;
  }

  it('places a glyph AT the shared Voronoi vertex when drawnCells are supplied', () => {
    const inst = runVoronoi({ drawnCells: DRAWN_CELLS });
    expect(inst.svgElements.length).toBeGreaterThan(0);
    const hit = translations(inst.svgElements).some(
      (t) => Math.abs(t.x - V.x) < 1e-3 && Math.abs(t.y - V.y) < 1e-3
    );
    expect(hit).toBe(true);
  });

  it('produces NOTHING without drawnCells (proves the 5th-arg wiring is load-bearing)', () => {
    // If MotifPattern dropped the 5th opts arg, this case would be identical to
    // the one above (both reach voronoiAnchors with no drawnCells) — so the
    // ABOVE test only passes because the drawn cells are threaded through.
    const inst = runVoronoi({}); // no drawnCells, no hostPaths
    expect(inst.svgElements).toEqual([]);
  });

  // ── Boundary-hardened path: drawnEdges + sites threaded through opts. ──
  const DRAWN_EDGES = [
    { x1: V.x, y1: V.y, x2: 150, y2: 120 }, // three drawn segments meet at V →
    { x1: V.x, y1: V.y, x2: 650, y2: 120 }, // V is a degree-3 junction.
    { x1: V.x, y1: V.y, x2: 400, y2: 520 },
  ];
  const SITES = [{ x: 300, y: 170 }, { x: 580, y: 240 }, { x: 320, y: 430 }];

  it('places a glyph AT the shared drawn junction when drawnEdges+sites are supplied', () => {
    const inst = runVoronoi({ drawnEdges: DRAWN_EDGES, sites: SITES });
    expect(inst.svgElements.length).toBeGreaterThan(0);
    const hit = translations(inst.svgElements).some(
      (t) => Math.abs(t.x - V.x) < 1e-3 && Math.abs(t.y - V.y) < 1e-3
    );
    expect(hit).toBe(true);
  });

  it('drawnEdges is PREFERRED over drawnCells when both are threaded', () => {
    // Supply drawnEdges (junction at V) AND a DIFFERENT drawnCells set whose only
    // junction is at (200,200) — NOT at V, and NO cell contains V. So a crossing
    // glyph at V can ONLY come from the drawn EDGES; if the legacy path won, V
    // would be absent from placements. This discriminates (unlike sharing V).
    const OTHER_CELLS = [
      { vertices: [{ x: 200, y: 200 }, { x: 100, y: 100 }, { x: 300, y: 100 }], site: { x: 200, y: 130 } },
      { vertices: [{ x: 200, y: 200 }, { x: 300, y: 100 }, { x: 300, y: 300 }], site: { x: 270, y: 200 } },
      { vertices: [{ x: 200, y: 200 }, { x: 300, y: 300 }, { x: 100, y: 300 }], site: { x: 200, y: 270 } },
    ];
    const inst = runVoronoi({ drawnEdges: DRAWN_EDGES, sites: SITES, drawnCells: OTHER_CELLS });
    const hit = translations(inst.svgElements).some(
      (t) => Math.abs(t.x - V.x) < 1e-3 && Math.abs(t.y - V.y) < 1e-3
    );
    expect(hit).toBe(true);
    // Sanity: the legacy junction (200,200) is NOT placed → the edge path, not
    // the cell path, drove selection.
    const legacyJunctionHit = translations(inst.svgElements).some(
      (t) => Math.abs(t.x - 200) < 1e-3 && Math.abs(t.y - 200) < 1e-3
    );
    expect(legacyJunctionHit).toBe(false);
  });
});
