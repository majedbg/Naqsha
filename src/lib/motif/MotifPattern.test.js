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

import MotifPattern from './MotifPattern.js';
import { RecordingContext } from '../patterns/drawingContext.js';
import { placeMotifs } from './placementEngine.js';
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
});
